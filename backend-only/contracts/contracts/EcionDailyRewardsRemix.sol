// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "https://github.com/OpenZeppelin/openzeppelin-contracts/blob/v5.0.0/contracts/token/ERC20/IERC20.sol";
import "https://github.com/OpenZeppelin/openzeppelin-contracts/blob/v5.0.0/contracts/access/Ownable.sol";
import "https://github.com/OpenZeppelin/openzeppelin-contracts/blob/v5.0.0/contracts/utils/ReentrancyGuard.sol";
import "https://github.com/OpenZeppelin/openzeppelin-contracts/blob/v5.0.0/contracts/utils/cryptography/ECDSA.sol";
import "https://github.com/OpenZeppelin/openzeppelin-contracts/blob/v5.0.0/contracts/utils/cryptography/MessageHashUtils.sol";

/**
 * @title EcionDailyRewards
 * @dev Daily check-in reward contract with random rewards
 */
contract EcionDailyRewards is Ownable, ReentrancyGuard {
    using ECDSA for bytes32;
    using MessageHashUtils for bytes32;

    IERC20 public immutable ecionToken;
    IERC20 public immutable usdcToken;
    address public backendSigner;
    
    struct RewardRange {
        uint256 ecionMin;
        uint256 ecionMax;
        uint256 usdcMin;
        uint256 usdcMax;
    }
    
    mapping(uint8 => RewardRange) public dayRewards;
    
    struct UserData {
        uint8 currentStreak;
        uint256 lastCheckInDay;
        uint256 totalEcionEarned;
        uint256 totalUsdcEarned;
    }
    
    mapping(address => UserData) public userData;
    mapping(address => mapping(uint8 => bool)) public claimedDays;
    mapping(address => uint256) public nonces;
    
    event CheckIn(address indexed user, uint8 dayNumber, uint256 ecionAmount, uint256 usdcAmount, uint8 newStreak, uint256 timestamp);
    event BackendSignerUpdated(address indexed oldSigner, address indexed newSigner);
    
    error InvalidDayNumber();
    error AlreadyClaimedToday();
    error InvalidSignature();
    error SignatureExpired();
    error MustFollowDoteth();
    
    constructor(
        address _ecionToken,
        address _usdcToken,
        address _backendSigner
    ) Ownable(msg.sender) {
        ecionToken = IERC20(_ecionToken);
        usdcToken = IERC20(_usdcToken);
        backendSigner = _backendSigner;
        
        // Day 1: 1-69 ECION + $0.02-$0.06 USDC
        dayRewards[1] = RewardRange(1e18, 69e18, 20000, 60000);
        // Day 2: 69-1000 ECION only
        dayRewards[2] = RewardRange(69e18, 1000e18, 0, 0);
        // Day 3: 1000-5000 ECION + $0.02-$0.12 USDC
        dayRewards[3] = RewardRange(1000e18, 5000e18, 20000, 120000);
        // Day 4: 5000-10000 ECION only
        dayRewards[4] = RewardRange(5000e18, 10000e18, 0, 0);
        // Day 5: 5000-10000 ECION + $0.02-$0.16 USDC
        dayRewards[5] = RewardRange(5000e18, 10000e18, 20000, 160000);
        // Day 6: 10000-20000 ECION only
        dayRewards[6] = RewardRange(10000e18, 20000e18, 0, 0);
        // Day 7: 10000-20000 ECION + $0.02-$0.20 USDC
        dayRewards[7] = RewardRange(10000e18, 20000e18, 20000, 200000);
    }
    
    function checkIn(
        uint256 ecionAmount,
        uint256 usdcAmount,
        bool isFollowing,
        uint256 expiry,
        bytes calldata signature
    ) external nonReentrant {
        if (block.timestamp > expiry) revert SignatureExpired();
        if (!isFollowing) revert MustFollowDoteth();
        
        uint256 currentDay = block.timestamp / 86400;
        uint8 claimDay = _calculateClaimDay(userData[msg.sender], currentDay);
        if (claimedDays[msg.sender][claimDay]) revert AlreadyClaimedToday();
        
        // Verify signature
        bytes32 messageHash = keccak256(abi.encodePacked(
            msg.sender, ecionAmount, usdcAmount, isFollowing, nonces[msg.sender], expiry, block.chainid
        ));
        bytes32 ethSignedHash = messageHash.toEthSignedMessageHash();
        if (ethSignedHash.recover(signature) != backendSigner) revert InvalidSignature();
        
        nonces[msg.sender]++;
        
        // Validate amounts
        RewardRange storage range = dayRewards[claimDay];
        require(ecionAmount >= range.ecionMin && ecionAmount <= range.ecionMax, "ECION out of range");
        if (range.usdcMax > 0) {
            require(usdcAmount >= range.usdcMin && usdcAmount <= range.usdcMax, "USDC out of range");
        } else {
            require(usdcAmount == 0, "No USDC for this day");
        }
        
        claimedDays[msg.sender][claimDay] = true;
        
        UserData storage user = userData[msg.sender];
        user.currentStreak = claimDay;
        user.lastCheckInDay = currentDay;
        user.totalEcionEarned += ecionAmount;
        user.totalUsdcEarned += usdcAmount;
        
        if (ecionAmount > 0) require(ecionToken.transfer(msg.sender, ecionAmount), "ECION transfer failed");
        if (usdcAmount > 0) require(usdcToken.transfer(msg.sender, usdcAmount), "USDC transfer failed");
        
        emit CheckIn(msg.sender, claimDay, ecionAmount, usdcAmount, claimDay, block.timestamp);
    }
    
    function _calculateClaimDay(UserData storage user, uint256 currentDay) internal view returns (uint8) {
        if (user.lastCheckInDay == 0 || currentDay > user.lastCheckInDay + 1) return 1;
        if (currentDay == user.lastCheckInDay + 1) {
            uint8 nextDay = user.currentStreak + 1;
            return nextDay > 7 ? 1 : nextDay;
        }
        return user.currentStreak;
    }
    
    function getUserStatus(address user) external view returns (
        uint8 currentStreak,
        uint8 nextClaimDay,
        bool canClaimToday,
        uint256 totalEcionEarned,
        uint256 totalUsdcEarned,
        bool[] memory claimedDaysArray
    ) {
        UserData storage data = userData[user];
        uint256 currentDay = block.timestamp / 86400;
        
        currentStreak = data.currentStreak;
        nextClaimDay = _calculateClaimDayView(data, currentDay);
        canClaimToday = !claimedDays[user][nextClaimDay] && (data.lastCheckInDay == 0 || currentDay >= data.lastCheckInDay);
        totalEcionEarned = data.totalEcionEarned;
        totalUsdcEarned = data.totalUsdcEarned;
        
        claimedDaysArray = new bool[](7);
        for (uint8 i = 1; i <= 7; i++) {
            claimedDaysArray[i-1] = claimedDays[user][i];
        }
    }
    
    function _calculateClaimDayView(UserData storage user, uint256 currentDay) internal view returns (uint8) {
        if (user.lastCheckInDay == 0 || currentDay > user.lastCheckInDay + 1) return 1;
        if (currentDay == user.lastCheckInDay + 1) {
            uint8 nextDay = user.currentStreak + 1;
            return nextDay > 7 ? 1 : nextDay;
        }
        return user.currentStreak;
    }
    
    function getRewardRange(uint8 dayNumber) external view returns (uint256, uint256, uint256, uint256, bool) {
        if (dayNumber < 1 || dayNumber > 7) revert InvalidDayNumber();
        RewardRange memory range = dayRewards[dayNumber];
        return (range.ecionMin, range.ecionMax, range.usdcMin, range.usdcMax, range.usdcMax > 0);
    }
    
    function setBackendSigner(address newSigner) external onlyOwner {
        require(newSigner != address(0), "Invalid address");
        emit BackendSignerUpdated(backendSigner, newSigner);
        backendSigner = newSigner;
    }
    
    function setRewardRange(uint8 dayNumber, uint256 ecionMin, uint256 ecionMax, uint256 usdcMin, uint256 usdcMax) external onlyOwner {
        if (dayNumber < 1 || dayNumber > 7) revert InvalidDayNumber();
        dayRewards[dayNumber] = RewardRange(ecionMin, ecionMax, usdcMin, usdcMax);
    }
    
    function depositTokens(address token, uint256 amount) external onlyOwner {
        IERC20(token).transferFrom(msg.sender, address(this), amount);
    }
    
    function emergencyWithdraw(address token, uint256 amount) external onlyOwner {
        if (token == address(0)) {
            payable(owner()).transfer(amount);
        } else {
            IERC20(token).transfer(owner(), amount);
        }
    }
    
    function getContractBalances() external view returns (uint256 ecionBalance, uint256 usdcBalance) {
        return (ecionToken.balanceOf(address(this)), usdcToken.balanceOf(address(this)));
    }
    
    function resetUser(address user) external onlyOwner {
        delete userData[user];
        for (uint8 i = 1; i <= 7; i++) claimedDays[user][i] = false;
    }
}
