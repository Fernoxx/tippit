// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/security/Pausable.sol";

/**
 * @title PITTipping
 * @dev Reverse tipping contract where post authors tip users who interact with their posts
 */
contract PITTipping is Ownable, ReentrancyGuard, Pausable {
    using SafeERC20 for IERC20;

    // Struct to store user's tipping configuration
    struct TippingConfig {
        address token; // Token address (e.g., USDC)
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
    mapping(address => TippingConfig) public userConfigs;
    mapping(address => uint256) public userAllowances;
    mapping(address => mapping(address => uint256)) public tokenBalances; // user => token => balance
    mapping(address => uint256) public totalTipsReceived;
    mapping(address => uint256) public totalTipsGiven;
    
    // Arrays for leaderboard functionality
    address[] public activeUsers;
    mapping(address => bool) public isActiveUser;
    
    // Transaction history
    TipTransaction[] public tipHistory;
    mapping(address => uint256[]) public userTipsSent;
    mapping(address => uint256[]) public userTipsReceived;

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
        address token,
        uint256 amount,
        string actionType,
        bytes32 farcasterCastHash
    );
    
    event FundsDeposited(address indexed user, address token, uint256 amount);
    event FundsWithdrawn(address indexed user, address token, uint256 amount);
    event ConfigRevoked(address indexed user);
    event SpendingLimitUpdated(address indexed user, uint256 newLimit);

    // Protocol fee
    uint256 public protocolFeeBps = 100; // 1%
    address public feeRecipient;
    
    // Farcaster verification oracle
    address public farcasterOracle;
    
    modifier onlyOracle() {
        require(msg.sender == farcasterOracle, "Only oracle can call");
        _;
    }

    constructor(address _feeRecipient, address _farcasterOracle) {
        feeRecipient = _feeRecipient;
        farcasterOracle = _farcasterOracle;
    }

    /**
     * @dev Set or update user's tipping configuration
     */
    function setTippingConfig(
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
     * @dev Deposit funds for tipping
     */
    function depositFunds(address _token, uint256 _amount) external nonReentrant {
        require(_amount > 0, "Amount must be > 0");
        require(_token != address(0), "Invalid token address");
        
        IERC20(_token).safeTransferFrom(msg.sender, address(this), _amount);
        tokenBalances[msg.sender][_token] += _amount;
        
        emit FundsDeposited(msg.sender, _token, _amount);
    }

    /**
     * @dev Withdraw deposited funds
     */
    function withdrawFunds(address _token, uint256 _amount) external nonReentrant {
        require(_amount > 0, "Amount must be > 0");
        require(tokenBalances[msg.sender][_token] >= _amount, "Insufficient balance");
        
        tokenBalances[msg.sender][_token] -= _amount;
        IERC20(_token).safeTransfer(msg.sender, _amount);
        
        emit FundsWithdrawn(msg.sender, _token, _amount);
    }

    /**
     * @dev Process a tip for an interaction (called by oracle)
     */
    function processTip(
        address _postAuthor,
        address _interactor,
        string memory _actionType,
        bytes32 _farcasterCastHash
    ) external onlyOracle nonReentrant whenNotPaused {
        TippingConfig storage config = userConfigs[_postAuthor];
        require(config.isActive, "Author config not active");
        
        uint256 tipAmount = getTipAmount(config, _actionType);
        require(tipAmount > 0, "No tip amount set for action");
        
        require(config.totalSpent + tipAmount <= config.spendingLimit, "Spending limit reached");
        require(tokenBalances[_postAuthor][config.token] >= tipAmount, "Insufficient balance");
        
        // Calculate fee
        uint256 fee = (tipAmount * protocolFeeBps) / 10000;
        uint256 netAmount = tipAmount - fee;
        
        // Update balances
        tokenBalances[_postAuthor][config.token] -= tipAmount;
        config.totalSpent += tipAmount;
        
        // Transfer tip
        IERC20(config.token).safeTransfer(_interactor, netAmount);
        if (fee > 0) {
            IERC20(config.token).safeTransfer(feeRecipient, fee);
        }
        
        // Update stats
        totalTipsReceived[_interactor] += netAmount;
        totalTipsGiven[_postAuthor] += tipAmount;
        
        // Record transaction
        TipTransaction memory txn = TipTransaction({
            from: _postAuthor,
            to: _interactor,
            token: config.token,
            amount: netAmount,
            actionType: _actionType,
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
        // Implementation similar to getUsersByLikeAmount but sorting by totalTipsReceived
        // Simplified for brevity
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
     * @dev Update oracle address (only owner)
     */
    function updateOracle(address _newOracle) external onlyOwner {
        farcasterOracle = _newOracle;
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
}