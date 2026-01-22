// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "https://github.com/OpenZeppelin/openzeppelin-contracts/blob/v5.0.0/contracts/token/ERC20/IERC20.sol";
import "https://github.com/OpenZeppelin/openzeppelin-contracts/blob/v5.0.0/contracts/access/Ownable.sol";
import "https://github.com/OpenZeppelin/openzeppelin-contracts/blob/v5.0.0/contracts/utils/ReentrancyGuard.sol";
import "https://github.com/OpenZeppelin/openzeppelin-contracts/blob/v5.0.0/contracts/utils/cryptography/ECDSA.sol";
import "https://github.com/OpenZeppelin/openzeppelin-contracts/blob/v5.0.0/contracts/utils/cryptography/MessageHashUtils.sol";

/**
 * @title EcionDailyRewardsV2
 * @dev Daily check-in reward contract with individual token claiming support
 * @notice Users can claim tokens one by one (ECION, USDC, CELO, ARB)
 * 
 * Reward Structure:
 * Day 1: 1-69 ECION + $0.02-$0.06 USDC
 * Day 2: 69-1000 ECION + 0.05-0.15 CELO + 0.05-0.15 ARB
 * Day 3: 1000-5000 ECION + $0.02-$0.12 USDC
 * Day 4: 5000-10000 ECION + 0.05-0.15 CELO
 * Day 5: 5000-10000 ECION + $0.02-$0.16 USDC + 0.05-0.15 ARB
 * Day 6: 10000-20000 ECION + 0.05-0.15 CELO
 * Day 7: 10000-20000 ECION + $0.02-$0.20 USDC + 0.05-0.15 CELO + 0.05-0.15 ARB
 */
contract EcionDailyRewardsV2 is Ownable, ReentrancyGuard {
    using ECDSA for bytes32;
    using MessageHashUtils for bytes32;

    // Token contracts
    IERC20 public immutable ecionToken;
    IERC20 public immutable usdcToken;
    IERC20 public immutable celoToken;
    IERC20 public immutable arbToken;
    
    // Backend signer address
    address public backendSigner;
    
    // Token type enum
    enum TokenType { ECION, USDC, CELO, ARB }
    
    // Reward ranges for each day and token type
    struct RewardRange {
        uint256 ecionMin;
        uint256 ecionMax;
        uint256 usdcMin;
        uint256 usdcMax;
        uint256 celoMin;
        uint256 celoMax;
        uint256 arbMin;
        uint256 arbMax;
    }
    
    // Day rewards configuration
    mapping(uint8 => RewardRange) public dayRewards;
    
    // User check-in data
    struct UserData {
        uint8 currentStreak;
        uint256 lastCheckInDay;
        uint256 totalEcionEarned;
        uint256 totalUsdcEarned;
        uint256 totalCeloEarned;
        uint256 totalArbEarned;
    }
    
    mapping(address => UserData) public userData;
    
    // Track claimed tokens per day per user (user => day => tokenType => claimed)
    mapping(address => mapping(uint8 => mapping(TokenType => bool))) public claimedTokens;
    
    // Nonce for signature replay protection
    mapping(address => uint256) public nonces;
    
    // Events
    event TokenClaimed(
        address indexed user,
        uint8 dayNumber,
        TokenType tokenType,
        uint256 amount,
        uint8 newStreak,
        uint256 timestamp
    );
    
    event BackendSignerUpdated(address indexed oldSigner, address indexed newSigner);
    event RewardRangeUpdated(uint8 dayNumber, RewardRange range);
    
    // Errors
    error InvalidDayNumber();
    error TokenAlreadyClaimed();
    error InvalidSignature();
    error SignatureExpired();
    error MustFollowDoteth();
    error TransferFailed();
    error InvalidTokenType();
    error AmountOutOfRange();
    error NoRewardForThisDay();
    
    /**
     * @param _ecionToken ECION token address (Base chain only)
     * @param _usdcToken USDC token address (Base chain)
     * @param _celoToken CELO token address (0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee for native CELO on CELO chain)
     * @param _arbToken ARB token address (0xb50721bcf8d664c30412cfbc6cf7a15145234ad1 on Arbitrum)
     * @param _backendSigner Backend signer address
     */
    constructor(
        address _ecionToken,
        address _usdcToken,
        address _celoToken,
        address _arbToken,
        address _backendSigner
    ) Ownable(msg.sender) {
        ecionToken = IERC20(_ecionToken);
        usdcToken = IERC20(_usdcToken);
        celoToken = IERC20(_celoToken);
        arbToken = IERC20(_arbToken);
        backendSigner = _backendSigner;
        
        // Initialize reward ranges
        _initializeRewardRanges();
    }
    
    function _initializeRewardRanges() internal {
        // Day 1: 1-69 ECION + $0.02-$0.06 USDC
        dayRewards[1] = RewardRange({
            ecionMin: 1 * 1e18,
            ecionMax: 69 * 1e18,
            usdcMin: 20000,   // $0.02 (6 decimals)
            usdcMax: 60000,   // $0.06
            celoMin: 0,
            celoMax: 0,
            arbMin: 0,
            arbMax: 0
        });
        
        // Day 2: 69-1000 ECION + 0.05-0.15 CELO + 0.05-0.15 ARB
        dayRewards[2] = RewardRange({
            ecionMin: 69 * 1e18,
            ecionMax: 1000 * 1e18,
            usdcMin: 0,
            usdcMax: 0,
            celoMin: 50000000000000000,   // 0.05 CELO (18 decimals)
            celoMax: 150000000000000000,  // 0.15 CELO
            arbMin: 50000000000000000,    // 0.05 ARB (18 decimals)
            arbMax: 150000000000000000    // 0.15 ARB
        });
        
        // Day 3: 1000-5000 ECION + $0.02-$0.12 USDC
        dayRewards[3] = RewardRange({
            ecionMin: 1000 * 1e18,
            ecionMax: 5000 * 1e18,
            usdcMin: 20000,
            usdcMax: 120000,
            celoMin: 0,
            celoMax: 0,
            arbMin: 0,
            arbMax: 0
        });
        
        // Day 4: 5000-10000 ECION + 0.05-0.15 CELO
        dayRewards[4] = RewardRange({
            ecionMin: 5000 * 1e18,
            ecionMax: 10000 * 1e18,
            usdcMin: 0,
            usdcMax: 0,
            celoMin: 50000000000000000,   // 0.05 CELO
            celoMax: 150000000000000000,  // 0.15 CELO
            arbMin: 0,
            arbMax: 0
        });
        
        // Day 5: 5000-10000 ECION + $0.02-$0.16 USDC + 0.05-0.15 ARB
        dayRewards[5] = RewardRange({
            ecionMin: 5000 * 1e18,
            ecionMax: 10000 * 1e18,
            usdcMin: 20000,
            usdcMax: 160000,
            celoMin: 0,
            celoMax: 0,
            arbMin: 50000000000000000,    // 0.05 ARB
            arbMax: 150000000000000000     // 0.15 ARB
        });
        
        // Day 6: 10000-20000 ECION + 0.05-0.15 CELO
        dayRewards[6] = RewardRange({
            ecionMin: 10000 * 1e18,
            ecionMax: 20000 * 1e18,
            usdcMin: 0,
            usdcMax: 0,
            celoMin: 50000000000000000,   // 0.05 CELO
            celoMax: 150000000000000000,  // 0.15 CELO
            arbMin: 0,
            arbMax: 0
        });
        
        // Day 7: 10000-20000 ECION + $0.02-$0.20 USDC + 0.05-0.15 CELO + 0.05-0.15 ARB
        dayRewards[7] = RewardRange({
            ecionMin: 10000 * 1e18,
            ecionMax: 20000 * 1e18,
            usdcMin: 20000,
            usdcMax: 200000,
            celoMin: 50000000000000000,   // 0.05 CELO
            celoMax: 150000000000000000,  // 0.15 CELO
            arbMin: 50000000000000000,     // 0.05 ARB
            arbMax: 150000000000000000     // 0.15 ARB
        });
    }
    
    /**
     * @dev Claim a specific token for a day
     * @param dayNumber Day number (1-7)
     * @param tokenType Token type to claim
     * @param amount Amount to claim (must match backend signature)
     * @param isFollowing Whether user follows @doteth
     * @param expiry Signature expiry timestamp
     * @param signature Backend signature
     */
    function claimToken(
        uint8 dayNumber,
        TokenType tokenType,
        uint256 amount,
        bool isFollowing,
        uint256 expiry,
        bytes calldata signature
    ) external nonReentrant {
        if (dayNumber < 1 || dayNumber > 7) revert InvalidDayNumber();
        if (block.timestamp > expiry) revert SignatureExpired();
        if (!isFollowing) revert MustFollowDoteth();
        
        // Check if token already claimed for this day
        if (claimedTokens[msg.sender][dayNumber][tokenType]) revert TokenAlreadyClaimed();
        
        // Verify signature
        _verifySignature(dayNumber, tokenType, amount, isFollowing, expiry, signature);
        
        // Validate amount and process claim
        _processTokenClaim(dayNumber, tokenType, amount);
    }
    
    /**
     * @dev Internal function to verify signature
     */
    function _verifySignature(
        uint8 dayNumber,
        TokenType tokenType,
        uint256 amount,
        bool isFollowing,
        uint256 expiry,
        bytes calldata signature
    ) internal {
        bytes32 messageHash = keccak256(abi.encodePacked(
            msg.sender,
            dayNumber,
            uint8(tokenType),
            amount,
            isFollowing,
            nonces[msg.sender],
            expiry,
            block.chainid
        ));
        
        bytes32 ethSignedHash = messageHash.toEthSignedMessageHash();
        address signer = ethSignedHash.recover(signature);
        if (signer != backendSigner) revert InvalidSignature();
        
        // Increment nonce
        nonces[msg.sender]++;
    }
    
    /**
     * @dev Internal function to process token claim
     */
    function _processTokenClaim(
        uint8 dayNumber,
        TokenType tokenType,
        uint256 amount
    ) internal {
        RewardRange storage range = dayRewards[dayNumber];
        
        // Validate amount is within range
        bool validAmount = false;
        IERC20 token;
        
        if (tokenType == TokenType.ECION) {
            validAmount = amount >= range.ecionMin && amount <= range.ecionMax;
            token = ecionToken;
            if (range.ecionMax == 0) revert NoRewardForThisDay();
        } else if (tokenType == TokenType.USDC) {
            validAmount = amount >= range.usdcMin && amount <= range.usdcMax;
            token = usdcToken;
            if (range.usdcMax == 0) revert NoRewardForThisDay();
        } else if (tokenType == TokenType.CELO) {
            validAmount = amount >= range.celoMin && amount <= range.celoMax;
            token = celoToken;
            if (range.celoMax == 0) revert NoRewardForThisDay();
        } else if (tokenType == TokenType.ARB) {
            validAmount = amount >= range.arbMin && amount <= range.arbMax;
            token = arbToken;
            if (range.arbMax == 0) revert NoRewardForThisDay();
        } else {
            revert InvalidTokenType();
        }
        
        if (!validAmount) revert AmountOutOfRange();
        
        // Mark as claimed
        claimedTokens[msg.sender][dayNumber][tokenType] = true;
        
        // Update user data
        UserData storage user = userData[msg.sender];
        uint256 currentDay = block.timestamp / 86400;
        
        // Update streak if this is the first claim for this day
        bool isFirstClaimForDay = true;
        for (uint8 i = 0; i < 4; i++) {
            if (i != uint8(tokenType) && claimedTokens[msg.sender][dayNumber][TokenType(i)]) {
                isFirstClaimForDay = false;
                break;
            }
        }
        
        if (isFirstClaimForDay) {
            if (user.lastCheckInDay == 0 || currentDay > user.lastCheckInDay + 1) {
                user.currentStreak = 1;
            } else if (currentDay == user.lastCheckInDay + 1) {
                uint8 nextDay = user.currentStreak + 1;
                user.currentStreak = nextDay > 7 ? 1 : nextDay;
            }
            user.lastCheckInDay = currentDay;
        }
        
        // Update totals
        if (tokenType == TokenType.ECION) {
            user.totalEcionEarned += amount;
        } else if (tokenType == TokenType.USDC) {
            user.totalUsdcEarned += amount;
        } else if (tokenType == TokenType.CELO) {
            user.totalCeloEarned += amount;
        } else if (tokenType == TokenType.ARB) {
            user.totalArbEarned += amount;
        }
        
        // Transfer token
        if (!token.transfer(msg.sender, amount)) revert TransferFailed();
        
        emit TokenClaimed(msg.sender, dayNumber, tokenType, amount, user.currentStreak, block.timestamp);
    }
    
    /**
     * @dev Get user's claim status for a day
     */
    function getDayClaimStatus(address user, uint8 dayNumber) external view returns (
        bool ecionClaimed,
        bool usdcClaimed,
        bool celoClaimed,
        bool arbClaimed
    ) {
        ecionClaimed = claimedTokens[user][dayNumber][TokenType.ECION];
        usdcClaimed = claimedTokens[user][dayNumber][TokenType.USDC];
        celoClaimed = claimedTokens[user][dayNumber][TokenType.CELO];
        arbClaimed = claimedTokens[user][dayNumber][TokenType.ARB];
    }
    
    /**
     * @dev Get reward range for a specific day
     */
    function getRewardRange(uint8 dayNumber) external view returns (RewardRange memory) {
        if (dayNumber < 1 || dayNumber > 7) revert InvalidDayNumber();
        return dayRewards[dayNumber];
    }
    
    // ============ Admin Functions ============
    
    function setBackendSigner(address newSigner) external onlyOwner {
        require(newSigner != address(0), "Invalid address");
        address oldSigner = backendSigner;
        backendSigner = newSigner;
        emit BackendSignerUpdated(oldSigner, newSigner);
    }
    
    function setRewardRange(uint8 dayNumber, RewardRange calldata range) external onlyOwner {
        if (dayNumber < 1 || dayNumber > 7) revert InvalidDayNumber();
        dayRewards[dayNumber] = range;
        emit RewardRangeUpdated(dayNumber, range);
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
    
    function getContractBalances() external view returns (
        uint256 ecionBalance,
        uint256 usdcBalance,
        uint256 celoBalance,
        uint256 arbBalance
    ) {
        ecionBalance = ecionToken.balanceOf(address(this));
        usdcBalance = usdcToken.balanceOf(address(this));
        celoBalance = celoToken.balanceOf(address(this));
        arbBalance = arbToken.balanceOf(address(this));
    }
}
