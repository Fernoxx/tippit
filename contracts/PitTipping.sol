// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/security/Pausable.sol";

/**
 * @title PitTipping
 * @dev Reverse tipping contract - Post authors tip users who interact with their posts
 * 
 * FLOW (Like Noice):
 * 1. User sets token allowance to this contract (any Base token)
 * 2. User configures tip amounts (like: 1 token, reply: 2 tokens, etc.)
 * 3. When someone likes/recasts/replies to their post → They get tipped tokens
 * 4. Backend verifies interaction via Neynar webhook
 * 5. Backend batches all interactions for 1 minute
 * 6. After 1 minute, all engagers get their tips in ONE transaction
 */
contract PitTipping is Ownable, ReentrancyGuard, Pausable {
    using SafeERC20 for IERC20;

    // Struct to store user's tipping configuration
    struct TippingConfig {
        address token; // Any ERC20 token address (USDC, ETH, DAI, etc.)
        uint256 likeAmount;    // Token amount to tip for likes
        uint256 replyAmount;   // Token amount to tip for replies
        uint256 recastAmount;  // Token amount to tip for recasts
        uint256 quoteAmount;   // Token amount to tip for quotes
        uint256 followAmount;  // Token amount to tip for follows
        uint256 spendingLimit; // Maximum tokens they can spend in total
        uint256 totalSpent;    // Tokens already spent
        bool isActive;         // Whether tipping is enabled
    }

    // Struct to store tip transaction details
    struct TipTransaction {
        address from;           // Post author (who pays)
        address to;             // Engager (who receives tokens)
        address token;          // Token address
        uint256 amount;         // Token amount transferred
        string actionType;      // "like", "reply", "recast", etc.
        uint256 timestamp;      // When tip happened
        bytes32 farcasterCastHash; // Cast hash
    }

    // Mappings
    mapping(address => TippingConfig) public userConfigs;
    mapping(address => uint256) public totalTipsReceived; // Total tokens received by user
    mapping(address => uint256) public totalTipsGiven;    // Total tokens given by user
    
    // Arrays for leaderboard functionality
    address[] public activeUsers;
    mapping(address => bool) public isActiveUser;
    
    // Transaction history
    TipTransaction[] public tipHistory;
    mapping(address => uint256[]) public userTipsSent;
    mapping(address => uint256[]) public userTipsReceived;

    // Track processed interactions to prevent double-tipping
    mapping(bytes32 => bool) public processedInteractions;

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
        uint256 spendingLimit
    );
    
    event TipSent(
        address indexed from,      // Post author (pays tokens)
        address indexed to,        // Engager (receives tokens)
        address token,
        uint256 amount,
        string actionType,
        bytes32 farcasterCastHash
    );
    
    event BatchProcessed(
        uint256 indexed batchId,
        uint256 tipCount,
        uint256 totalGasUsed
    );
    
    event ConfigRevoked(address indexed user);
    event SpendingLimitUpdated(address indexed user, uint256 newLimit);
    event EmergencyWithdraw(address indexed token, uint256 amount, address indexed to);
    event BackendVerifierUpdated(address indexed oldVerifier, address indexed newVerifier);

    // Protocol fee (1% = 100 bps)
    uint256 public protocolFeeBps = 100;
    address public feeRecipient;
    
    // Batch processing
    uint256 public batchIdCounter;
    
    modifier onlyBackend() {
        require(msg.sender == backendVerifier, "Only backend can call");
        _;
    }

    constructor(address _feeRecipient, address _backendVerifier) Ownable(msg.sender) {
        feeRecipient = _feeRecipient;
        backendVerifier = _backendVerifier;
    }

    /**
     * @dev Set or update user's tipping configuration
     * User sets how much tokens to tip for each interaction type (any Base token)
     */
    function setTippingConfig(
        address _token,           // Any Base token address (USDC, ETH, DAI, etc.)
        uint256 _likeAmount,      // Tokens to tip for likes
        uint256 _replyAmount,     // Tokens to tip for replies
        uint256 _recastAmount,    // Tokens to tip for recasts
        uint256 _quoteAmount,     // Tokens to tip for quotes
        uint256 _followAmount,    // Tokens to tip for follows
        uint256 _spendingLimit    // Maximum tokens to spend total
    ) external {
        require(_token != address(0), "Invalid token address");
        require(_spendingLimit > 0, "Spending limit must be > 0");
        
        TippingConfig storage config = userConfigs[msg.sender];
        config.token = _token;
        config.likeAmount = _likeAmount;
        config.replyAmount = _replyAmount;
        config.recastAmount = _recastAmount;
        config.quoteAmount = _quoteAmount;
        config.followAmount = _followAmount;
        config.spendingLimit = _spendingLimit;
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
            _spendingLimit
        );
    }

    /**
     * @dev Process a tip for an interaction (called by backend)
     * Backend verifies the interaction via Neynar webhook
     */
    function processTip(
        address _postAuthor,      // Who wrote the post (pays tokens)
        address _interactor,      // Who liked/replied/etc (receives tokens)
        string memory _actionType, // "like", "reply", "recast", etc.
        bytes32 _farcasterCastHash,
        bytes32 _interactionHash
    ) external onlyBackend nonReentrant whenNotPaused {
        require(!processedInteractions[_interactionHash], "Interaction already processed");
        require(_postAuthor != _interactor, "Cannot tip yourself");
        
        TippingConfig storage config = userConfigs[_postAuthor];
        require(config.isActive, "Author config not active");
        
        // Get token amount to tip for this action
        uint256 tipAmount = getTipAmount(config, _actionType);
        require(tipAmount > 0, "No tip amount set for action");
        
        // Check if within spending limit
        require(config.totalSpent + tipAmount <= config.spendingLimit, "Spending limit reached");
        
        // Check token allowance (user must approve this contract to spend their tokens)
        IERC20 token = IERC20(config.token);
        uint256 allowance = token.allowance(_postAuthor, address(this));
        require(allowance >= tipAmount, "Insufficient token allowance");
        
        // Check token balance
        uint256 balance = token.balanceOf(_postAuthor);
        require(balance >= tipAmount, "Insufficient token balance");
        
        // Mark interaction as processed
        processedInteractions[_interactionHash] = true;
        
        // Calculate protocol fee (1%)
        uint256 fee = (tipAmount * protocolFeeBps) / 10000;
        uint256 netAmount = tipAmount - fee;
        
        // Update spending tracker
        config.totalSpent += tipAmount;
        
        // TRANSFER TOKENS: Post author → Engager
        token.safeTransferFrom(_postAuthor, _interactor, netAmount);
        
        // Transfer fee to protocol
        if (fee > 0) {
            token.safeTransferFrom(_postAuthor, feeRecipient, fee);
        }
        
        // Update stats
        totalTipsReceived[_interactor] += netAmount;  // Engager received tokens
        totalTipsGiven[_postAuthor] += tipAmount;     // Post author gave tokens
        
        // Record transaction
        TipTransaction memory txn = TipTransaction({
            from: _postAuthor,        // Who paid
            to: _interactor,          // Who received
            token: config.token,      // Token address
            amount: netAmount,        // Token amount
            actionType: _actionType,  // "like", "reply", etc.
            timestamp: block.timestamp,
            farcasterCastHash: _farcasterCastHash
        });
        
        uint256 txnId = tipHistory.length;
        tipHistory.push(txn);
        userTipsSent[_postAuthor].push(txnId);
        userTipsReceived[_interactor].push(txnId);
        
        emit TipSent(_postAuthor, _interactor, config.token, netAmount, _actionType, _farcasterCastHash);
    }

    /**
     * @dev BATCH PROCESSING: Process multiple tips in one transaction (Like Noice)
     * This is the key function - backend calls this every 1 minute with all interactions
     * 
     * Example:
     * - 1 minute passes
     * - 50 people liked/replied to posts
     * - Backend calls this function with all 50 interactions
     * - All 50 engagers get their tips in ONE transaction (~$0.01 gas on Base)
     */
    function batchProcessTips(
        address[] memory _postAuthors,    // Who wrote posts (pay tokens)
        address[] memory _interactors,    // Who engaged (receive tokens)
        string[] memory _actionTypes,     // "like", "reply", etc.
        bytes32[] memory _castHashes,
        bytes32[] memory _interactionHashes
    ) external onlyBackend nonReentrant whenNotPaused {
        require(
            _postAuthors.length == _interactors.length &&
            _postAuthors.length == _actionTypes.length &&
            _postAuthors.length == _castHashes.length &&
            _postAuthors.length == _interactionHashes.length,
            "Array length mismatch"
        );
        
        uint256 gasStart = gasleft();
        uint256 batchId = ++batchIdCounter;
        uint256 processedCount = 0;
        
        // Process each tip
        for (uint256 i = 0; i < _postAuthors.length; i++) {
            processedCount += _processTipInBatch(
                _postAuthors[i],
                _interactors[i],
                _actionTypes[i],
                _castHashes[i],
                _interactionHashes[i]
            );
        }
        
        uint256 gasUsed = gasStart - gasleft();
        emit BatchProcessed(batchId, processedCount, gasUsed);
    }
    
    function _processTipInBatch(
        address _postAuthor,
        address _interactor,
        string memory _actionType,
        bytes32 _castHash,
        bytes32 _interactionHash
    ) internal returns (uint256) {
        // Early returns to reduce stack depth
        if (processedInteractions[_interactionHash] || _postAuthor == _interactor) return 0;
        
        TippingConfig storage config = userConfigs[_postAuthor];
        if (!config.isActive) return 0;
        
        uint256 tipAmount = getTipAmount(config, _actionType);
        if (tipAmount == 0 || config.totalSpent + tipAmount > config.spendingLimit) return 0;
        
        IERC20 token = IERC20(config.token);
        if (token.allowance(_postAuthor, address(this)) < tipAmount || token.balanceOf(_postAuthor) < tipAmount) return 0;
        
        // Process the tip
        return _executeTipTransfer(_postAuthor, _interactor, config, token, tipAmount, _actionType, _castHash, _interactionHash);
    }
    
    function _executeTipTransfer(
        address _postAuthor,
        address _interactor,
        TippingConfig storage _config,
        IERC20 _token,
        uint256 _tipAmount,
        string memory _actionType,
        bytes32 _castHash,
        bytes32 _interactionHash
    ) internal returns (uint256) {
        // Mark as processed
        processedInteractions[_interactionHash] = true;
        
        // Calculate amounts
        uint256 fee = (_tipAmount * protocolFeeBps) / 10000;
        uint256 netAmount = _tipAmount - fee;
        
        // Update spending tracker
        _config.totalSpent += _tipAmount;
        
        // TRANSFER TOKENS: Post author → Engager
        _token.safeTransferFrom(_postAuthor, _interactor, netAmount);
        
        // Transfer fee
        if (fee > 0) {
            _token.safeTransferFrom(_postAuthor, feeRecipient, fee);
        }
        
        // Update stats
        totalTipsReceived[_interactor] += netAmount;
        totalTipsGiven[_postAuthor] += _tipAmount;
        
        // Record transaction
        _recordTipTransaction(_postAuthor, _interactor, _config.token, netAmount, _actionType, _castHash);
        
        emit TipSent(_postAuthor, _interactor, _config.token, netAmount, _actionType, _castHash);
        
        return 1;
    }
    
    function _recordTipTransaction(
        address _from,
        address _to,
        address _token,
        uint256 _amount,
        string memory _actionType,
        bytes32 _castHash
    ) internal {
        TipTransaction memory txn = TipTransaction({
            from: _from,
            to: _to,
            token: _token,
            amount: _amount,
            actionType: _actionType,
            timestamp: block.timestamp,
            farcasterCastHash: _castHash
        });
        
        uint256 txnId = tipHistory.length;
        tipHistory.push(txn);
        userTipsSent[_from].push(txnId);
        userTipsReceived[_to].push(txnId);
    }

    /**
     * @dev Get tip amount for a specific action type
     */
    function getTipAmount(TippingConfig memory config, string memory actionType) 
        internal 
        pure 
        returns (uint256) 
    {
        if (keccak256(bytes(actionType)) == keccak256(bytes("like"))) {
            return config.likeAmount;
        } else if (keccak256(bytes(actionType)) == keccak256(bytes("reply"))) {
            return config.replyAmount;
        } else if (keccak256(bytes(actionType)) == keccak256(bytes("recast"))) {
            return config.recastAmount;
        } else if (keccak256(bytes(actionType)) == keccak256(bytes("quote"))) {
            return config.quoteAmount;
        } else if (keccak256(bytes(actionType)) == keccak256(bytes("follow"))) {
            return config.followAmount;
        }
        return 0;
    }

    /**
     * @dev Update spending limit
     */
    function updateSpendingLimit(uint256 _newLimit) external {
        require(_newLimit > 0, "Limit must be > 0");
        userConfigs[msg.sender].spendingLimit = _newLimit;
        emit SpendingLimitUpdated(msg.sender, _newLimit);
    }

    /**
     * @dev Revoke tipping configuration
     */
    function revokeConfig() external {
        userConfigs[msg.sender].isActive = false;
        emit ConfigRevoked(msg.sender);
    }

    /**
     * @dev Get users sorted by tip amount per like (for homepage)
     */
    function getUsersByLikeAmount(uint256 offset, uint256 limit) 
        external 
        view 
        returns (address[] memory users, uint256[] memory amounts) 
    {
        uint256 activeCount = 0;
        for (uint256 i = 0; i < activeUsers.length; i++) {
            if (userConfigs[activeUsers[i]].isActive) {
                activeCount++;
            }
        }
        
        uint256 returnCount = limit;
        if (offset + limit > activeCount) {
            returnCount = activeCount > offset ? activeCount - offset : 0;
        }
        
        users = new address[](returnCount);
        amounts = new uint256[](returnCount);
        
        // Simple implementation - in production, use more efficient sorting
        address[] memory tempUsers = new address[](activeCount);
        uint256[] memory tempAmounts = new uint256[](activeCount);
        uint256 index = 0;
        
        for (uint256 i = 0; i < activeUsers.length; i++) {
            if (userConfigs[activeUsers[i]].isActive) {
                tempUsers[index] = activeUsers[i];
                tempAmounts[index] = userConfigs[activeUsers[i]].likeAmount;
                index++;
            }
        }
        
        // Sort by like amount (descending)
        for (uint256 i = 0; i < activeCount - 1; i++) {
            for (uint256 j = 0; j < activeCount - i - 1; j++) {
                if (tempAmounts[j] < tempAmounts[j + 1]) {
                    uint256 tempAmount = tempAmounts[j];
                    tempAmounts[j] = tempAmounts[j + 1];
                    tempAmounts[j + 1] = tempAmount;
                    
                    address tempUser = tempUsers[j];
                    tempUsers[j] = tempUsers[j + 1];
                    tempUsers[j + 1] = tempUser;
                }
            }
        }
        
        // Copy to return arrays
        for (uint256 i = 0; i < returnCount; i++) {
            users[i] = tempUsers[offset + i];
            amounts[i] = tempAmounts[offset + i];
        }
        
        return (users, amounts);
    }

    /**
     * @dev Get leaderboard of most tipped users
     */
    function getLeaderboard(uint256 offset, uint256 limit) 
        external 
        view 
        returns (address[] memory users, uint256[] memory amounts) 
    {
        uint256 userCount = activeUsers.length;
        uint256 returnCount = limit;
        if (offset + limit > userCount) {
            returnCount = userCount > offset ? userCount - offset : 0;
        }
        
        users = new address[](returnCount);
        amounts = new uint256[](returnCount);
        
        // In production, implement efficient sorting
        for (uint256 i = 0; i < returnCount && i + offset < userCount; i++) {
            users[i] = activeUsers[i + offset];
            amounts[i] = totalTipsReceived[activeUsers[i + offset]];
        }
        
        return (users, amounts);
    }

    /**
     * @dev Update backend verifier address (only owner)
     */
    function updateBackendVerifier(address _newVerifier) external onlyOwner {
        require(_newVerifier != address(0), "Invalid verifier address");
        address oldVerifier = backendVerifier;
        backendVerifier = _newVerifier;
        emit BackendVerifierUpdated(oldVerifier, _newVerifier);
    }

    /**
     * @dev Update protocol fee (only owner)
     */
    function updateProtocolFee(uint256 _newFeeBps) external onlyOwner {
        require(_newFeeBps <= 500, "Fee too high"); // Max 5%
        protocolFeeBps = _newFeeBps;
    }

    /**
     * @dev Pause/unpause contract (only owner)
     */
    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    /**
     * @dev Emergency withdraw for tokens mistakenly sent to this contract
     */
    function emergencyWithdraw(address _token, address _to) external onlyOwner {
        require(_token != address(0), "Invalid token address");
        require(_to != address(0), "Invalid recipient address");
        
        uint256 balance = IERC20(_token).balanceOf(address(this));
        require(balance > 0, "No tokens to withdraw");
        
        IERC20(_token).safeTransfer(_to, balance);
        
        emit EmergencyWithdraw(_token, balance, _to);
    }

    /**
     * @dev Get user's available token balance (considering allowance)
     */
    function getUserAvailableBalance(address _user) 
        external 
        view 
        returns (
            address token,
            uint256 balance,
            uint256 allowance,
            uint256 availableToTip
        ) 
    {
        TippingConfig memory config = userConfigs[_user];
        if (config.token == address(0)) {
            return (address(0), 0, 0, 0);
        }
        
        token = config.token;
        balance = IERC20(token).balanceOf(_user);
        allowance = IERC20(token).allowance(_user, address(this));
        availableToTip = balance < allowance ? balance : allowance;
    }
}