// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts@4.9.3/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts@4.9.3/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts@4.9.3/access/Ownable.sol";

/**
 * @title PitTipping
 * @dev Engagement Rewards Contract - Post authors reward users who interact with their content
 * Built for Base network with support for any ERC20 token microtransactions
 * 
 * REWARD FLOW (Different from Noice):
 * 1. Content creator sets token allowance to this contract (any Base token)
 * 2. Creator configures reward amounts (like: 1 token, reply: 2 tokens, etc.)
 * 3. When someone likes/recasts/replies to their post → ENGAGER gets rewarded tokens
 * 4. Backend verifies interaction via Neynar webhook
 * 5. Backend batches all interactions for 1 minute
 * 6. After 1 minute, all engagers get their rewards in ONE transaction
 * 
 * Key Difference: In Noice, creators get rewarded. Here, ENGAGERS get rewarded.
 */
contract PitTippingClean is Ownable {
    using SafeERC20 for IERC20;

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

    // Contract state
    address public feeRecipient;
    address public backendVerifier;
    uint256 public protocolFeeBps = 100; // 1% fee (100 basis points)

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
        address indexed from,
        address indexed to,
        address indexed token,
        uint256 amount,
        string actionType,
        bytes32 farcasterCastHash
    );

    event BatchProcessed(
        uint256 processedCount,
        uint256 timestamp
    );

    // Modifiers
    modifier onlyBackend() {
        require(msg.sender == backendVerifier, "Only backend can call");
        _;
    }

    constructor(address _feeRecipient, address _backendVerifier) {
        feeRecipient = _feeRecipient;
        backendVerifier = _backendVerifier;
    }

    /**
     * @dev Set or update user's reward configuration
     * User sets how much tokens to reward for each interaction type (any Base token)
     */
    function setRewardConfig(
        address _token,           // Any Base token address (USDC, ETH, DAI, etc.)
        uint256 _likeAmount,      // Tokens to reward for likes
        uint256 _replyAmount,     // Tokens to reward for replies
        uint256 _recastAmount,    // Tokens to reward for recasts
        uint256 _quoteAmount,     // Tokens to reward for quotes
        uint256 _followAmount,    // Tokens to reward for follows
        uint256 _spendingLimit    // Maximum tokens to spend total
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
        address _postAuthor,
        address _interactor,
        string memory _actionType,
        bytes32 _farcasterCastHash,
        bytes32 _interactionHash
    ) external onlyBackend {
        require(!processedInteractions[_interactionHash], "Interaction already processed");
        require(_postAuthor != _interactor, "Cannot tip yourself");
        
        RewardConfig storage config = creatorConfigs[_postAuthor];
        require(config.isActive, "Author config not active");
        
        uint256 tipAmount = getRewardAmount(config, _actionType);
        require(tipAmount > 0, "No tip amount set for action");
        require(config.totalSpent + tipAmount <= config.spendingLimit, "Spending limit reached");
        
        IERC20 token = IERC20(config.token);
        require(token.allowance(_postAuthor, address(this)) >= tipAmount, "Insufficient token allowance");
        require(token.balanceOf(_postAuthor) >= tipAmount, "Insufficient token balance");
        
        processedInteractions[_interactionHash] = true;
        
        uint256 fee = (tipAmount * protocolFeeBps) / 10000;
        uint256 netAmount = tipAmount - fee;
        
        config.totalSpent += tipAmount;
        
        token.safeTransferFrom(_postAuthor, _interactor, netAmount);
        
        if (fee > 0) {
            token.safeTransferFrom(_postAuthor, feeRecipient, fee);
        }
        
        totalTipsReceived[_interactor] += netAmount;
        totalTipsGiven[_postAuthor] += tipAmount;
        
        _recordSingleTip(_postAuthor, _interactor, config.token, netAmount, _actionType, _farcasterCastHash);
        
        emit TipSent(_postAuthor, _interactor, config.token, netAmount, _actionType, _farcasterCastHash);
    }
    
    function _recordSingleTip(
        address _from,
        address _to,
        address _token,
        uint256 _amount,
        string memory _actionType,
        bytes32 _castHash
    ) internal {
        tipHistory.push(TipTransaction({
            from: _from,
            to: _to,
            token: _token,
            amount: _amount,
            actionType: _actionType,
            timestamp: block.timestamp,
            farcasterCastHash: _castHash
        }));
        
        uint256 txnId = tipHistory.length - 1;
        userTipsSent[_from].push(txnId);
        userTipsReceived[_to].push(txnId);
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
            if (_processTip(_postAuthors[i], _interactors[i], _actionTypes[i], _castHashes[i], _interactionHashes[i])) {
                processedCount++;
            }
        }
        
        emit BatchProcessed(processedCount, block.timestamp);
    }
    
    function _processTip(
        address _postAuthor,
        address _interactor,
        string memory _actionType,
        bytes32 _castHash,
        bytes32 _interactionHash
    ) internal returns (bool) {
        if (processedInteractions[_interactionHash] || _postAuthor == _interactor) return false;
        
        RewardConfig storage config = creatorConfigs[_postAuthor];
        if (!config.isActive) return false;
        
        uint256 tipAmount = getRewardAmount(config, _actionType);
        if (tipAmount == 0 || config.totalSpent + tipAmount > config.spendingLimit) return false;
        
        IERC20 token = IERC20(config.token);
        if (token.allowance(_postAuthor, address(this)) < tipAmount || token.balanceOf(_postAuthor) < tipAmount) return false;
        
        processedInteractions[_interactionHash] = true;
        
        uint256 fee = (tipAmount * protocolFeeBps) / 10000;
        uint256 netAmount = tipAmount - fee;
        
        config.totalSpent += tipAmount;
        
        token.safeTransferFrom(_postAuthor, _interactor, netAmount);
        
        if (fee > 0) {
            token.safeTransferFrom(_postAuthor, feeRecipient, fee);
        }
        
        totalTipsReceived[_interactor] += netAmount;
        totalTipsGiven[_postAuthor] += tipAmount;
        
        _recordTip(_postAuthor, _interactor, config.token, netAmount, _actionType, _castHash);
        
        emit TipSent(_postAuthor, _interactor, config.token, netAmount, _actionType, _castHash);
        
        return true;
    }
    
    function _recordTip(
        address _from,
        address _to,
        address _token,
        uint256 _amount,
        string memory _actionType,
        bytes32 _castHash
    ) internal {
        tipHistory.push(TipTransaction({
            from: _from,
            to: _to,
            token: _token,
            amount: _amount,
            actionType: _actionType,
            timestamp: block.timestamp,
            farcasterCastHash: _castHash
        }));
        
        uint256 txnId = tipHistory.length - 1;
        userTipsSent[_from].push(txnId);
        userTipsReceived[_to].push(txnId);
    }

    /**
     * @dev Get reward amount for a specific action type
     */
    function getRewardAmount(RewardConfig memory config, string memory actionType) 
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
        require(_newLimit > 0, "Spending limit must be > 0");
        creatorConfigs[msg.sender].spendingLimit = _newLimit;
    }

    /**
     * @dev Disable tipping configuration
     */
    function disableRewards() external {
        creatorConfigs[msg.sender].isActive = false;
    }

    /**
     * @dev Get user's reward configuration
     */
    function getUserConfig(address _user) external view returns (
        address token,
        uint256 likeAmount,
        uint256 replyAmount,
        uint256 recastAmount,
        uint256 quoteAmount,
        uint256 followAmount,
        uint256 spendingLimit,
        uint256 totalSpent,
        bool isActive
    ) {
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
            config.isActive
        );
    }

    /**
     * @dev Get available balance for tipping
     */
    function getUserAvailableBalance(address _user) external view returns (
        address token,
        uint256 balance,
        uint256 allowance,
        uint256 availableToTip
    ) {
        RewardConfig memory config = creatorConfigs[_user];
        if (config.token == address(0)) {
            return (address(0), 0, 0, 0);
        }
        
        token = config.token;
        balance = IERC20(config.token).balanceOf(_user);
        allowance = IERC20(config.token).allowance(_user, address(this));
        availableToTip = config.spendingLimit - config.totalSpent;
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
    }

    /**
     * @dev Set protocol fee (only owner)
     */
    function setProtocolFee(uint256 _newFeeBps) external onlyOwner {
        require(_newFeeBps <= 1000, "Fee cannot exceed 10%"); // Max 10%
        protocolFeeBps = _newFeeBps;
    }

    /**
     * @dev Update backend verifier address (only owner)
     */
    function updateBackendVerifier(address _newVerifier) external onlyOwner {
        require(_newVerifier != address(0), "Invalid address");
        backendVerifier = _newVerifier;
    }
}