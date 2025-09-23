// SPDX-License-Identifier: MIT
pragma solidity 0.6.12;

/**
 * @title PitTippingImplementation
 * @dev Engagement Rewards Contract - Post authors reward users who interact with their content
 * Based on Noice structure - NO OpenZeppelin imports, pure Solidity
 */
contract PitTippingImplementation {
    // Owner
    address public owner;
    
    // Struct to store creator's reward configuration
    struct RewardConfig {
        address token;
        uint256 likeAmount;
        uint256 replyAmount;
        uint256 recastAmount;
        uint256 quoteAmount;
        uint256 followAmount;
        uint256 spendingLimit;
        uint256 totalSpent;
        bool isActive;
    }

    // Struct to store tip transaction details
    struct TipTransaction {
        address from;
        address to;
        address token;
        uint256 amount;
        string actionType;
        uint256 timestamp;
        bytes32 farcasterCastHash;
    }

    // Mappings
    mapping(address => RewardConfig) public creatorConfigs;
    mapping(address => uint256) public totalTipsReceived;
    mapping(address => uint256) public totalTipsGiven;
    mapping(bytes32 => bool) public processedInteractions;
    
    // Arrays
    address[] public activeUsers;
    mapping(address => bool) public isActiveUser;
    TipTransaction[] public tipHistory;
    mapping(address => uint256[]) public userTipsSent;
    mapping(address => uint256[]) public userTipsReceived;

    // Contract state
    address public feeRecipient;
    address public backendVerifier;
    uint256 public protocolFeeBps = 0; // NO fees - like Noice

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
    function initialize(address _feeRecipient, address _backendVerifier) external {
        require(feeRecipient == address(0), "Already initialized");
        feeRecipient = _feeRecipient;
        backendVerifier = _backendVerifier;
    }

    /**
     * @dev Set or update user's reward configuration
     */
    function setRewardConfig(
        address _token,
        uint256 _likeAmount,
        uint256 _replyAmount,
        uint256 _recastAmount,
        uint256 _quoteAmount,
        uint256 _followAmount,
        uint256 _spendingLimit
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
     * @dev Process a tip for an interaction
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
        
        // Simple ERC20 transfer (no SafeERC20)
        require(IERC20(config.token).transferFrom(_postAuthor, _interactor, tipAmount), "Transfer failed");
        
        config.totalSpent += tipAmount;
        totalTipsReceived[_interactor] += tipAmount;
        totalTipsGiven[_postAuthor] += tipAmount;
        
        tipHistory.push(TipTransaction({
            from: _postAuthor,
            to: _interactor,
            token: config.token,
            amount: tipAmount,
            actionType: _actionType,
            timestamp: block.timestamp,
            farcasterCastHash: _farcasterCastHash
        }));
        
        uint256 txnId = tipHistory.length - 1;
        userTipsSent[_postAuthor].push(txnId);
        userTipsReceived[_interactor].push(txnId);
        
        emit TipSent(_postAuthor, _interactor, config.token, tipAmount, _actionType, _farcasterCastHash);
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
     * @dev Emergency withdraw
     */
    function emergencyWithdraw(address _token, address _to) external onlyOwner {
        require(_token != address(0), "Invalid token address");
        require(_to != address(0), "Invalid recipient address");
        
        uint256 balance = IERC20(_token).balanceOf(address(this));
        require(balance > 0, "No tokens to withdraw");
        
        IERC20(_token).transfer(_to, balance);
    }
}

// Simple ERC20 interface (no imports)
interface IERC20 {
    function transfer(address to, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
}