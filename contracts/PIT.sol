// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract PIT is Ownable {
    IERC20 public usdc;

    struct User {
        uint256 spendingLimit;
        mapping(string => uint256) tipAmounts; // e.g., "like" => amount
        bool isActive;
    }

    struct TipRecord {
        address tipper;
        address tippee;
        string interactionType;
        uint256 amount;
        uint256 timestamp;
    }

    mapping(address => User) public users;
    mapping(address => uint256) public totalTipsReceived;
    TipRecord[] public tipHistory;

    event SpendingLimitSet(address indexed user, uint256 limit);
    event TipAmountSet(address indexed user, string interactionType, uint256 amount);
    event TipSent(address indexed from, address indexed to, string interactionType, uint256 amount);

    constructor(address _usdc) {
        usdc = IERC20(_usdc);
    }

    function setSpendingLimit(uint256 _limit) external {
        users[msg.sender].spendingLimit = _limit;
        users[msg.sender].isActive = true;
        emit SpendingLimitSet(msg.sender, _limit);
    }

    function setTipAmount(string memory _interactionType, uint256 _amount) external {
        users[msg.sender].tipAmounts[_interactionType] = _amount;
        emit TipAmountSet(msg.sender, _interactionType, _amount);
    }

    function approveSpending() external {
        // User approves USDC spending for the contract
        usdc.approve(address(this), users[msg.sender].spendingLimit);
    }

    function triggerTip(address _tippee, string memory _interactionType) external {
        User storage tipper = users[msg.sender];
        require(tipper.isActive, "User not active");
        uint256 amount = tipper.tipAmounts[_interactionType];
        require(usdc.balanceOf(msg.sender) >= amount, "Insufficient balance");
        require(usdc.allowance(msg.sender, address(this)) >= amount, "Insufficient allowance");

        usdc.transferFrom(msg.sender, _tippee, amount);
        totalTipsReceived[_tippee] += amount;
        tipHistory.push(TipRecord(msg.sender, _tippee, _interactionType, amount, block.timestamp));
        emit TipSent(msg.sender, _tippee, _interactionType, amount);
    }

    function getTipHistory() external view returns (TipRecord[] memory) {
        return tipHistory;
    }

    function revokeAccess() external {
        users[msg.sender].isActive = false;
        // Reset allowance (in practice, use OpenZeppelin's revoke functions)
    }
}