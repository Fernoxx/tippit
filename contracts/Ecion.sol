// SPDX-License-Identifier: MIT
pragma solidity 0.6.12;

/**
 * @title Ecion
 * @dev Engagement Rewards Contract - Post authors reward users who interact with their content
 * Based on Noice contract structure but ENGAGERS get rewards (not creators)
 * Built for Base network with support for any ERC20 token microtransactions
 * 
 * REWARD FLOW (Different from Noice):
 * 1. Content creator sets token allowance to this contract (any Base token)
 * 2. Creator configures reward amounts (like: 1 token, reply: 2 tokens, etc.)
 * 3. Creator sets tipping audience: Following, Followers, or Anyone
 * 4. When someone likes/recasts/replies to their post → ENGAGER gets rewarded tokens
 * 5. Backend verifies interaction via Neynar webhook and checks audience eligibility
 * 6. Backend batches all interactions for 1 minute
 * 7. After 1 minute, all eligible engagers get their rewards in ONE transaction
 * 
 * Key Difference: In Noice, creators get rewarded. Here, ENGAGERS get rewarded.
 * New Feature: Tipping audience control (Following/Followers/Anyone)
 */
contract Ecion {
    // Owner
    address public owner;
    
    // Enum for tipping audience
    enum TippingAudience {
        Following,  // Only users that the caster follows can get tips
        Followers,  // Only users that follow the caster can get tips
        Anyone      // Anyone can get tips (must be Farcaster user)
    }

    // Struct to store creator's reward configuration
    struct RewardConfig {
        address token; // Any ERC20 token address (USDC, ETH, DAI, etc.)
        uint256 likeAmount;    // Token reward for likes received
        uint256 replyAmount;   // Token reward for replies received
        uint256 recastAmount;  // Token reward for recasts received
        uint256 quoteAmount;   // Token reward for quotes received
        uint256 followAmount;  // Token reward for follows received
        uint256 spendingLimit; // Maximum tokens they can spend in total
        uint256 totalSpent;    // Tokens already spent
        TippingAudience audience; // Who can receive tips
        uint256 minFollowerCount; // Minimum followers required for engager
        bool likeEnabled;      // Whether likes are enabled
        bool replyEnabled;     // Whether replies are enabled
        bool recastEnabled;    // Whether recasts are enabled
        bool quoteEnabled;     // Whether quotes are enabled
        bool followEnabled;    // Whether follows are enabled
        bool isActive;         // Whether rewards are enabled
    }

    // Struct to store tip transaction details
    struct TipTransaction {
        address from;           // Post author (who pays)
        address to;             // Engager (who receives tokens)
        address token;          // Token address
        uint256 amount;         // Token amount
        string actionType;      // "like", "reply", etc.
        uint256 timestamp;      // When tip happened
        bytes32 farcasterCastHash; // Cast hash
    }

    // Mappings
    mapping(address => RewardConfig) public creatorConfigs;
    mapping(address => uint256) public totalTipsReceived; // Total tokens received by user
    mapping(address => uint256) public totalTipsGiven;    // Total tokens given by user
    mapping(bytes32 => bool) public processedInteractions;
    
    // Arrays for leaderboard functionality
    address[] public activeUsers;
    mapping(address => bool) public isActiveUser;
    TipTransaction[] public tipHistory;
    mapping(address => uint256[]) public userTipsSent;
    mapping(address => uint256[]) public userTipsReceived;

    // Backend verifier (only your backend can call processTip)
    address public backendVerifier;
    
    // Events
    event ConfigUpdated(
        address indexed user,
        address token,
        uint256 likeAmount,
        uint256 replyAmount,
        uint256 recastAmount,
        uint256 quoteAmount,
        uint256 followAmount,
        uint256 spendingLimit,
        TippingAudience audience,
        uint256 minFollowerCount,
        bool likeEnabled,
        bool replyEnabled,
        bool recastEnabled,
        bool quoteEnabled,
        bool followEnabled
    );
    event TipSent(
        address indexed from,
        address indexed to,
        address token,
        uint256 amount,
        string actionType,
        bytes32 farcasterCastHash
    );
    event BatchProcessed(
        uint256 processedCount,
        uint256 timestamp
    );
    event EmergencyWithdraw(
        address indexed token,
        uint256 amount,
        address indexed to
    );
    event ConfigRevoked(address indexed user);
    event SpendingLimitUpdated(address indexed user, uint256 newLimit);
    event BackendVerifierUpdated(address indexed oldVerifier, address indexed newVerifier);

    modifier onlyOwner() {
        require(msg.sender == owner, "Only owner can call");
        _;
    }

    modifier onlyBackend() {
        require(msg.sender == backendVerifier, "Only backend can call");
        _;
    }

    constructor() public {
        owner = msg.sender;
    }

    /**
     * @dev Initialize contract (called by proxy)
     */
    function initialize(address _backendVerifier) external {
        require(backendVerifier == address(0), "Already initialized");
        backendVerifier = _backendVerifier;
    }

    /**
     * @dev Set or update creator's reward configuration
     * Creator sets how much tokens to reward for each interaction type (any Base token)
     */
    function setRewardConfig(
        address _token,           // Any Base token address (USDC, ETH, DAI, etc.)
        uint256 _likeAmount,      // Tokens to reward for likes
        uint256 _replyAmount,     // Tokens to reward for replies
        uint256 _recastAmount,    // Tokens to reward for recasts
        uint256 _quoteAmount,     // Tokens to reward for quotes
        uint256 _followAmount,    // Tokens to reward for follows
        uint256 _spendingLimit,   // Maximum tokens they can spend in total
        TippingAudience _audience, // Who can receive tips
        uint256 _minFollowerCount, // Minimum followers required for engager
        bool _likeEnabled,        // Whether likes are enabled
        bool _replyEnabled,       // Whether replies are enabled
        bool _recastEnabled,      // Whether recasts are enabled
        bool _quoteEnabled,       // Whether quotes are enabled
        bool _followEnabled       // Whether follows are enabled
    ) external {
        require(_token != address(0), "Invalid token address");
        require(_spendingLimit > 0, "Spending limit must be > 0");
        
        RewardConfig storage config = creatorConfigs[msg.sender];
        config.token = _token;
        config.likeAmount = _likeAmount;
        config.replyAmount = _replyAmount;
        config.recastAmount = _recastAmount;
        config.quoteAmount = _quoteAmount;
        config.followAmount = _followAmount;
        config.spendingLimit = _spendingLimit;
        config.audience = _audience;
        config.minFollowerCount = _minFollowerCount;
        config.likeEnabled = _likeEnabled;
        config.replyEnabled = _replyEnabled;
        config.recastEnabled = _recastEnabled;
        config.quoteEnabled = _quoteEnabled;
        config.followEnabled = _followEnabled;
        config.isActive = true;

        if (!isActiveUser[msg.sender]) {
            activeUsers.push(msg.sender);
            isActiveUser[msg.sender] = true;
        }

        emit ConfigUpdated(
            msg.sender,
            _token,
            _likeAmount,
            _replyAmount,
            _recastAmount,
            _quoteAmount,
            _followAmount,
            _spendingLimit,
            _audience,
            _minFollowerCount,
            _likeEnabled,
            _replyEnabled,
            _recastEnabled,
            _quoteEnabled,
            _followEnabled
        );
    }

    /**
     * @dev Revoke creator's reward configuration (stop rewarding)
     */
    function revokeRewardConfig() external {
        RewardConfig storage config = creatorConfigs[msg.sender];
        config.isActive = false;
        emit ConfigRevoked(msg.sender);
    }

    /**
     * @dev Update spending limit
     */
    function updateSpendingLimit(uint256 _newLimit) external {
        require(_newLimit > 0, "Spending limit must be > 0");
        RewardConfig storage config = creatorConfigs[msg.sender];
        config.spendingLimit = _newLimit;
        emit SpendingLimitUpdated(msg.sender, _newLimit);
    }

    /**
     * @dev Process a single reward for an interaction (called by backend)
     * Backend verifies the interaction via Neynar webhook
     */
    function processTip(
        address _postAuthor,      // Who wrote the post (pays tokens)
        address _interactor,      // Who liked/replied/etc (receives tokens)
        string memory _actionType, // "like", "reply", "recast", etc.
        bytes32 _farcasterCastHash,
        bytes32 _interactionHash
    ) external onlyBackend {
        require(!processedInteractions[_interactionHash], "Interaction already processed");
        require(_postAuthor != _interactor, "Cannot reward yourself");
        
        RewardConfig storage config = creatorConfigs[_postAuthor];
        require(config.isActive, "Creator config not active");
        
        // Get token amount to reward for this action
        uint256 rewardAmount = getRewardAmount(config, _actionType);
        require(rewardAmount > 0, "No reward amount set for action");
        require(isActionEnabled(config, _actionType), "Action type not enabled");
        
        // Check if within spending limit
        require(config.totalSpent + rewardAmount <= config.spendingLimit, "Spending limit reached");
        
        // Check token allowance (creator must approve this contract to spend their tokens)
        IERC20 token = IERC20(config.token);
        uint256 allowance = token.allowance(_postAuthor, address(this));
        require(allowance >= rewardAmount, "Insufficient token allowance");
        
        // Check token balance
        uint256 balance = token.balanceOf(_postAuthor);
        require(balance >= rewardAmount, "Insufficient token balance");
        
        // Mark interaction as processed
        processedInteractions[_interactionHash] = true;
        
        // Update spending tracker
        config.totalSpent += rewardAmount;
        
        // TRANSFER TOKENS: Post author → Engager
        token.transferFrom(_postAuthor, _interactor, rewardAmount);
        
        // Update stats
        totalTipsReceived[_interactor] += rewardAmount;  // Engager received tokens
        totalTipsGiven[_postAuthor] += rewardAmount;     // Creator gave tokens
        
        // Record transaction
        tipHistory.push(TipTransaction({
            from: _postAuthor,        // Who paid
            to: _interactor,          // Who received
            token: config.token,      // Token address
            amount: rewardAmount,     // Token amount
            actionType: _actionType,  // "like", "reply", etc.
            timestamp: block.timestamp,
            farcasterCastHash: _farcasterCastHash
        }));
        
        uint256 txnId = tipHistory.length - 1;
        userTipsSent[_postAuthor].push(txnId);
        userTipsReceived[_interactor].push(txnId);
        
        emit TipSent(_postAuthor, _interactor, config.token, rewardAmount, _actionType, _farcasterCastHash);
    }

    /**
     * @dev BATCH PROCESSING: Process multiple rewards in one transaction (Like Noice)
     * This is the key function - backend calls this every 1 minute with all interactions
     * 
     * Example:
     * - 1 minute passes
     * - 50 people liked/replied to posts
     * - Backend calls this function with all 50 interactions
     * - All 50 engagers get their rewards in ONE transaction (~$0.01 gas on Base)
     */
    function batchProcessTips(
        address[] calldata _postAuthors,
        address[] calldata _interactors,
        string[] calldata _actionTypes,
        bytes32[] calldata _castHashes,
        bytes32[] calldata _interactionHashes
    ) external onlyBackend {
        require(_postAuthors.length == _interactors.length, "Array length mismatch");
        require(_postAuthors.length == _actionTypes.length, "Array length mismatch");
        require(_postAuthors.length == _castHashes.length, "Array length mismatch");
        require(_postAuthors.length == _interactionHashes.length, "Array length mismatch");
        
        uint256 processedCount = 0;
        
        for (uint256 i = 0; i < _postAuthors.length; i++) {
            if (_processTipInBatch(_postAuthors[i], _interactors[i], _actionTypes[i], _castHashes[i], _interactionHashes[i])) {
                processedCount++;
            }
        }
        
        emit BatchProcessed(processedCount, block.timestamp);
    }
    
    function _processTipInBatch(
        address _postAuthor,
        address _interactor,
        string memory _actionType,
        bytes32 _castHash,
        bytes32 _interactionHash
    ) internal returns (bool) {
        if (processedInteractions[_interactionHash] || _postAuthor == _interactor) return false;
        
        RewardConfig storage config = creatorConfigs[_postAuthor];
        if (!config.isActive) return false;
        
        uint256 rewardAmount = getRewardAmount(config, _actionType);
        if (rewardAmount == 0 || !isActionEnabled(config, _actionType) || config.totalSpent + rewardAmount > config.spendingLimit) return false;
        
        IERC20 token = IERC20(config.token);
        if (token.allowance(_postAuthor, address(this)) < rewardAmount || token.balanceOf(_postAuthor) < rewardAmount) return false;
        
        processedInteractions[_interactionHash] = true;
        config.totalSpent += rewardAmount;
        
        token.transferFrom(_postAuthor, _interactor, rewardAmount);
        
        totalTipsReceived[_interactor] += rewardAmount;
        totalTipsGiven[_postAuthor] += rewardAmount;
        
        tipHistory.push(TipTransaction({
            from: _postAuthor,
            to: _interactor,
            token: config.token,
            amount: rewardAmount,
            actionType: _actionType,
            timestamp: block.timestamp,
            farcasterCastHash: _castHash
        }));
        
        uint256 txnId = tipHistory.length - 1;
        userTipsSent[_postAuthor].push(txnId);
        userTipsReceived[_interactor].push(txnId);
        
        emit TipSent(_postAuthor, _interactor, config.token, rewardAmount, _actionType, _castHash);
        
        return true;
    }

    /**
     * @dev Get reward amount for a specific action type
     */
    function getRewardAmount(RewardConfig memory config, string memory actionType) 
        internal 
        pure 
        returns (uint256) 
    {
        if (keccak256(abi.encodePacked(actionType)) == keccak256(abi.encodePacked("like"))) {
            return config.likeAmount;
        } else if (keccak256(abi.encodePacked(actionType)) == keccak256(abi.encodePacked("reply"))) {
            return config.replyAmount;
        } else if (keccak256(abi.encodePacked(actionType)) == keccak256(abi.encodePacked("recast"))) {
            return config.recastAmount;
        } else if (keccak256(abi.encodePacked(actionType)) == keccak256(abi.encodePacked("quote"))) {
            return config.quoteAmount;
        } else if (keccak256(abi.encodePacked(actionType)) == keccak256(abi.encodePacked("follow"))) {
            return config.followAmount;
        }
        return 0;
    }

    /**
     * @dev Check if action type is enabled
     */
    function isActionEnabled(RewardConfig memory config, string memory actionType) 
        internal 
        pure 
        returns (bool) 
    {
        if (keccak256(abi.encodePacked(actionType)) == keccak256(abi.encodePacked("like"))) {
            return config.likeEnabled;
        } else if (keccak256(abi.encodePacked(actionType)) == keccak256(abi.encodePacked("reply"))) {
            return config.replyEnabled;
        } else if (keccak256(abi.encodePacked(actionType)) == keccak256(abi.encodePacked("recast"))) {
            return config.recastEnabled;
        } else if (keccak256(abi.encodePacked(actionType)) == keccak256(abi.encodePacked("quote"))) {
            return config.quoteEnabled;
        } else if (keccak256(abi.encodePacked(actionType)) == keccak256(abi.encodePacked("follow"))) {
            return config.followEnabled;
        }
        return false;
    }

    /**
     * @dev Get creator's reward configuration
     */
    function getCreatorConfig(address _user) 
        external 
        view 
        returns (
            address token,
            uint256 likeAmount,
            uint256 replyAmount,
            uint256 recastAmount,
            uint256 quoteAmount,
            uint256 followAmount,
            uint256 spendingLimit,
            uint256 totalSpent,
            TippingAudience audience,
            uint256 minFollowerCount,
            bool likeEnabled,
            bool replyEnabled,
            bool recastEnabled,
            bool quoteEnabled,
            bool followEnabled,
            bool isActive
        ) 
    {
        RewardConfig memory config = creatorConfigs[_user];
        return (
            config.token,
            config.likeAmount,
            config.replyAmount,
            config.recastAmount,
            config.quoteAmount,
            config.followAmount,
            config.spendingLimit,
            config.totalSpent,
            config.audience,
            config.minFollowerCount,
            config.likeEnabled,
            config.replyEnabled,
            config.recastEnabled,
            config.quoteEnabled,
            config.followEnabled,
            config.isActive
        );
    }

    /**
     * @dev Get user's available balance for rewarding
     */
    function getCreatorAvailableBalance(address _user) 
        external 
        view 
        returns (
            address token,
            uint256 balance,
            uint256 allowance,
            uint256 availableToReward
        ) 
    {
        RewardConfig memory config = creatorConfigs[_user];
        if (config.token == address(0)) {
            return (address(0), 0, 0, 0);
        }
        
        token = config.token;
        balance = IERC20(token).balanceOf(_user);
        allowance = IERC20(token).allowance(_user, address(this));
        
        // Calculate available to reward based on spending limit and already spent
        uint256 remainingLimit = config.spendingLimit > config.totalSpent ? config.spendingLimit - config.totalSpent : 0;
        
        // Available to reward is the minimum of balance, allowance, and remaining limit
        availableToReward = balance < allowance ? balance : allowance;
        availableToReward = availableToReward < remainingLimit ? availableToReward : remainingLimit;
        
        return (token, balance, allowance, availableToReward);
    }

    /**
     * @dev Get all active users (for leaderboard)
     */
    function getActiveUsers() external view returns (address[] memory) {
        return activeUsers;
    }

    /**
     * @dev Get top users by total tips received (simple bubble sort for example)
     * NOTE: For production, this should be done off-chain (e.g., The Graph)
     */
    function getTopUsersByTipsReceived(uint256 _limit) external view returns (address[] memory, uint256[] memory) {
        address[] memory topUsers = new address[](activeUsers.length);
        uint256[] memory topAmounts = new uint256[](activeUsers.length);

        for (uint256 i = 0; i < activeUsers.length; i++) {
            topUsers[i] = activeUsers[i];
            topAmounts[i] = totalTipsReceived[activeUsers[i]];
        }

        // Simple bubble sort (inefficient for large arrays, use off-chain for production)
        for (uint256 i = 0; i < topUsers.length; i++) {
            for (uint256 j = i + 1; j < topUsers.length; j++) {
                if (topAmounts[j] > topAmounts[i]) {
                    uint256 tempAmount = topAmounts[i];
                    topAmounts[i] = topAmounts[j];
                    topAmounts[j] = tempAmount;

                    address tempUser = topUsers[i];
                    topUsers[i] = topUsers[j];
                    topUsers[j] = tempUser;
                }
            }
        }

        uint256 actualLimit = _limit < topUsers.length ? _limit : topUsers.length;
        address[] memory resultUsers = new address[](actualLimit);
        uint256[] memory resultAmounts = new uint256[](actualLimit);

        for (uint256 i = 0; i < actualLimit; i++) {
            resultUsers[i] = topUsers[i];
            resultAmounts[i] = topAmounts[i];
        }

        return (resultUsers, resultAmounts);
    }

    /**
     * @dev Get top users by total tips given (simple bubble sort for example)
     * NOTE: For production, this should be done off-chain (e.g., The Graph)
     */
    function getTopUsersByTipsGiven(uint256 _limit) external view returns (address[] memory, uint256[] memory) {
        address[] memory topUsers = new address[](activeUsers.length);
        uint256[] memory topAmounts = new uint256[](activeUsers.length);

        for (uint256 i = 0; i < activeUsers.length; i++) {
            topUsers[i] = activeUsers[i];
            topAmounts[i] = totalTipsGiven[activeUsers[i]];
        }

        // Simple bubble sort (inefficient for large arrays, use off-chain for production)
        for (uint256 i = 0; i < topUsers.length; i++) {
            for (uint256 j = i + 1; j < topUsers.length; j++) {
                if (topAmounts[j] > topAmounts[i]) {
                    uint256 tempAmount = topAmounts[i];
                    topAmounts[i] = topAmounts[j];
                    topAmounts[j] = tempAmount;

                    address tempUser = topUsers[i];
                    topUsers[i] = topUsers[j];
                    topUsers[j] = tempUser;
                }
            }
        }

        uint256 actualLimit = _limit < topUsers.length ? _limit : topUsers.length;
        address[] memory resultUsers = new address[](actualLimit);
        uint256[] memory resultAmounts = new uint256[](actualLimit);

        for (uint256 i = 0; i < actualLimit; i++) {
            resultUsers[i] = topUsers[i];
            resultAmounts[i] = topAmounts[i];
        }

        return (resultUsers, resultAmounts);
    }

    /**
     * @dev Get a user's sent tip history
     */
    function getUserTipsSent(address _user) external view returns (TipTransaction[] memory) {
        TipTransaction[] memory userTxns = new TipTransaction[](userTipsSent[_user].length);
        for (uint256 i = 0; i < userTipsSent[_user].length; i++) {
            userTxns[i] = tipHistory[userTipsSent[_user][i]];
        }
        return userTxns;
    }

    /**
     * @dev Get a user's received tip history
     */
    function getUserTipsReceived(address _user) external view returns (TipTransaction[] memory) {
        TipTransaction[] memory userTxns = new TipTransaction[](userTipsReceived[_user].length);
        for (uint256 i = 0; i < userTipsReceived[_user].length; i++) {
            userTxns[i] = tipHistory[userTipsReceived[_user][i]];
        }
        return userTxns;
    }

    /**
     * @dev Update backend verifier address (only owner)
     */
    function updateBackendVerifier(address _newVerifier) external onlyOwner {
        require(_newVerifier != address(0), "Invalid verifier address");
        emit BackendVerifierUpdated(backendVerifier, _newVerifier);
        backendVerifier = _newVerifier;
    }

    /**
     * @dev Emergency withdraw for tokens mistakenly sent to this contract
     */
    function emergencyWithdraw(address _token, address _to) external onlyOwner {
        require(_token != address(0), "Invalid token address");
        require(_to != address(0), "Invalid recipient address");
        
        uint256 balance = IERC20(_token).balanceOf(address(this));
        require(balance > 0, "No tokens to withdraw");
        
        IERC20(_token).transfer(_to, balance);
        
        emit EmergencyWithdraw(_token, balance, _to);
    }
}

// Simple ERC20 interface (no imports)
interface IERC20 {
    function transfer(address to, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
    function allowance(address owner, address spender) external view returns (uint256);
}