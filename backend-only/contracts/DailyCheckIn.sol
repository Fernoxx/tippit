// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title DailyCheckIn
 * @dev Contract for daily check-in rewards with FID verification via backend
 * @notice Deploy on Remix with optimization: 200
 */

interface IERC20 {
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function transfer(address to, uint256 amount) external returns (bool);
}

abstract contract Ownable {
    address private _owner;

    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);

    constructor() {
        _transferOwnership(msg.sender);
    }

    modifier onlyOwner() {
        _checkOwner();
        _;
    }

    function owner() public view virtual returns (address) {
        return _owner;
    }

    function _checkOwner() internal view virtual {
        require(owner() == msg.sender, "Ownable: caller is not the owner");
    }

    function _transferOwnership(address newOwner) internal virtual {
        address oldOwner = _owner;
        _owner = newOwner;
        emit OwnershipTransferred(oldOwner, newOwner);
    }
}

abstract contract ReentrancyGuard {
    uint256 private _status;

    uint256 private constant _NOT_ENTERED = 1;
    uint256 private constant _ENTERED = 2;

    constructor() {
        _status = _NOT_ENTERED;
    }

    modifier nonReentrant() {
        require(_status != _ENTERED, "ReentrancyGuard: reentrant call");
        _status = _ENTERED;
        _;
        _status = _NOT_ENTERED;
    }
}

contract DailyCheckIn is Ownable, ReentrancyGuard {
    IERC20 public ecionToken;
    address public backendWallet;
    address public backendVerifier; // Backend address that can verify check-ins
    
    // Daily reward amounts (in tokens, 18 decimals)
    mapping(uint8 => uint256) public dailyRewards;
    
    // Track claimed rewards: user => day => claimed
    mapping(address => mapping(uint8 => bool)) public claimedRewards;
    
    // Track check-ins: user => day => checked in
    mapping(address => mapping(uint8 => bool)) public checkIns;
    
    // Events
    event CheckIn(address indexed user, uint8 dayNumber, uint256 timestamp);
    event RewardClaimed(address indexed user, uint8 dayNumber, uint256 amount);
    event BackendVerifierUpdated(address indexed oldVerifier, address indexed newVerifier);
    
    constructor(
        address _ecionToken,
        address _backendWallet,
        address _backendVerifier
    ) Ownable(msg.sender) {
        ecionToken = IERC20(_ecionToken);
        backendWallet = _backendWallet;
        backendVerifier = _backendVerifier;
        
        // Set daily rewards
        dailyRewards[1] = 69 * 10**18;
        dailyRewards[2] = 1000 * 10**18;
        dailyRewards[3] = 5000 * 10**18;
        dailyRewards[4] = 10000 * 10**18;
        dailyRewards[5] = 20000 * 10**18;
        dailyRewards[6] = 30000 * 10**18;
        dailyRewards[7] = 100000 * 10**18;
    }
    
    /**
     * @dev Check in for a specific day
     * @param dayNumber Day number (1-7)
     * @param fid Farcaster FID (verified by backend)
     * @param timestamp Timestamp used in signature
     * @param signature Backend signature verifying the check-in
     */
    function checkIn(uint8 dayNumber, uint256 fid, uint256 timestamp, bytes memory signature) external nonReentrant {
        require(dayNumber >= 1 && dayNumber <= 7, "Invalid day number");
        require(!checkIns[msg.sender][dayNumber], "Already checked in for this day");
        require(block.timestamp >= timestamp && block.timestamp <= timestamp + 300, "Signature expired"); // 5 min window
        
        // Verify signature from backend
        bytes32 messageHash = keccak256(abi.encodePacked(msg.sender, dayNumber, fid, timestamp));
        bytes32 ethSignedMessageHash = keccak256(abi.encodePacked("\x19Ethereum Signed Message:\n32", messageHash));
        address signer = recoverSigner(ethSignedMessageHash, signature);
        require(signer == backendVerifier, "Invalid signature from backend");
        
        // Mark as checked in
        checkIns[msg.sender][dayNumber] = true;
        emit CheckIn(msg.sender, dayNumber, block.timestamp);
        
        // Auto-claim reward if not already claimed
        if (!claimedRewards[msg.sender][dayNumber]) {
            _claimReward(dayNumber);
        }
    }
    
    /**
     * @dev Claim reward for a specific day (can be called separately)
     * @param dayNumber Day number (1-7)
     */
    function claimReward(uint8 dayNumber) external nonReentrant {
        require(dayNumber >= 1 && dayNumber <= 7, "Invalid day number");
        require(checkIns[msg.sender][dayNumber], "Must check in first");
        require(!claimedRewards[msg.sender][dayNumber], "Reward already claimed");
        
        _claimReward(dayNumber);
    }
    
    /**
     * @dev Internal function to claim reward
     */
    function _claimReward(uint8 dayNumber) internal {
        uint256 rewardAmount = dailyRewards[dayNumber];
        require(rewardAmount > 0, "Invalid reward amount");
        
        // Mark as claimed
        claimedRewards[msg.sender][dayNumber] = true;
        
        // Transfer tokens from backend wallet to user
        require(
            ecionToken.transferFrom(backendWallet, msg.sender, rewardAmount),
            "Token transfer failed"
        );
        
        emit RewardClaimed(msg.sender, dayNumber, rewardAmount);
    }
    
    /**
     * @dev Recover signer from signature
     */
    function recoverSigner(bytes32 messageHash, bytes memory signature) internal pure returns (address) {
        require(signature.length == 65, "Invalid signature length");
        
        bytes32 r;
        bytes32 s;
        uint8 v;
        
        assembly {
            r := mload(add(signature, 32))
            s := mload(add(signature, 64))
            v := byte(0, mload(add(signature, 96)))
        }
        
        if (v < 27) {
            v += 27;
        }
        
        require(v == 27 || v == 28, "Invalid signature");
        
        return ecrecover(messageHash, v, r, s);
    }
    
    /**
     * @dev Update backend verifier address (only owner)
     */
    function setBackendVerifier(address _newVerifier) external onlyOwner {
        require(_newVerifier != address(0), "Invalid address");
        address oldVerifier = backendVerifier;
        backendVerifier = _newVerifier;
        emit BackendVerifierUpdated(oldVerifier, _newVerifier);
    }
    
    /**
     * @dev Update backend wallet address (only owner)
     */
    function setBackendWallet(address _newWallet) external onlyOwner {
        require(_newWallet != address(0), "Invalid address");
        backendWallet = _newWallet;
    }
    
    /**
     * @dev Emergency withdraw tokens (only owner)
     */
    function emergencyWithdraw(address token, uint256 amount) external onlyOwner {
        IERC20(token).transfer(owner(), amount);
    }
}
