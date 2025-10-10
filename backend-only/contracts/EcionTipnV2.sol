// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";

contract EcionTipnV2 is Ownable {
    using EnumerableSet for EnumerableSet.AddressSet;

    mapping(uint => uint) private _epochFees;
    mapping(address => uint) private _userEarnings;
    mapping(address => mapping(uint => uint)) private _userEpochFees;
    mapping(address => EnumerableSet.AddressSet) private _castTippers;
    EnumerableSet.AddressSet private _tippers;
    EnumerableSet.AddressSet private _executors;
    EnumerableSet.AddressSet private _claimants;
    
    uint private _feeRate = 500; // 5%
    uint private _maxFee = 5000; // $0.005 (in USDC units)
    uint private _minFee = 500; // $0.0005 (in USDC units)

    IERC20 public constant USDC = IERC20(0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913);

    modifier onlyClaimant() {
        require(_claimants.contains(msg.sender), "Only claimants");
        _;
    }

    modifier onlyExecutor() {
        require(_executors.contains(msg.sender), "Only executors");
        _;
    }

    event Tip(
        address indexed from,
        address indexed to,
        address indexed cast,
        address action,
        uint quantity,
        uint fee,
        uint timestamp
    );

    event BatchTipExecuted(
        uint totalTransfers,
        uint gasUsed,
        uint totalFees
    );

    constructor() Ownable(msg.sender) {}

    function batchTip(
        address[] calldata froms, 
        address[] calldata tos, 
        address[] calldata casts, 
        address[] calldata actions, 
        uint[] calldata usdcAmounts,
        bytes[] calldata data
    ) external onlyExecutor returns (bool[] memory) {
        uint256 gasStart = gasleft();
        uint256 totalFees = 0;
        
        bool[] memory success = new bool[](froms.length);
        
        for (uint i = 0; i < froms.length; i++) {
            success[i] = _tip(froms[i], tos[i], casts[i], actions[i], usdcAmounts[i], data[i]);
            if (success[i]) {
                uint256 fee = _calculateFee(usdcAmounts[i]);
                totalFees += fee;
            }
        }
        
        uint256 gasUsed = gasStart - gasleft();
        
        emit BatchTipExecuted(froms.length, gasUsed, totalFees);
        
        return success;
    }

    function tip(
        address from, 
        address to, 
        address cast, 
        address action, 
        uint usdcAmount,
        bytes calldata data
    ) external onlyExecutor returns (bool) {
        return _tip(from, to, cast, action, usdcAmount, data);
    }

    function _tip(
        address from, 
        address to, 
        address cast, 
        address action,
        uint usdcAmount,
        bytes calldata data
    ) internal returns (bool) {
        bool isAction = action != address(0);
        uint usdcFee = _calculateFee(usdcAmount);

        // Only process the tip for the first time
        if (_castTippers[cast].contains(from)) {
            return false;
        }

        // Attempt to charge USDC, if applicable
        if (usdcAmount > 0) {
            try USDC.transferFrom(from, isAction ? action : to, usdcAmount) {
                _userEarnings[to] += usdcAmount;
            } catch {
                return false;
            }
        }

        // Tip successful
        _tippers.add(from);
        _castTippers[cast].add(from);

        // Process Action, if applicable
        if (action != address(0)) {
            // For now, just emit event - can be extended for other tokens
            // try IAction(action).onTip(from, to, cast, usdcAmount, data) { }
            // catch { }
        }

        // Process fee, if applicable
        if (usdcFee > 0) {
            try USDC.transferFrom(from, address(this), usdcFee) {
                _userEpochFees[from][getCurrentEpoch()] += usdcFee;
                _epochFees[getCurrentEpoch()] += usdcFee;
            } catch {
                usdcFee = 0;
            }
        }

        emit Tip(from, to, cast, action, usdcAmount, usdcFee, block.timestamp);

        return true;
    }

    function _calculateFee(uint usdcAmount) internal view returns (uint) {
        uint usdcFee = usdcAmount * _feeRate / 10000;
        if (usdcFee > _maxFee) {
            usdcFee = _maxFee;
        }
        if (usdcFee < _minFee) {
            usdcFee = _minFee;
        }
        return usdcFee;
    }

    function getEpoch(uint timestamp) public pure returns (uint) {
        return timestamp / 86400; // Epoch = 1 day
    }

    function getCurrentEpoch() public view returns (uint) {
        return getEpoch(block.timestamp);
    }

    function getFeeRate() external view returns (uint) {
        return _feeRate;
    }

    function getMaxFee() external view returns (uint) {
        return _maxFee;
    }

    function getMinFee() external view returns (uint) {
        return _minFee;
    }

    function setFeeRate(uint feeRate) external onlyOwner {
        require(feeRate <= 2000, "Fee must be <= 20%");
        _feeRate = feeRate;
    }

    function setMaxFee(uint maxFee) external onlyOwner {
        require(maxFee >= _minFee, "Max fee must equal or exceed min fee");
        _maxFee = maxFee;
    }

    function setMinFee(uint minFee) external onlyOwner {
        require(minFee <= _maxFee, "Min fee can not exceed max fee");
        _minFee = minFee;
    }

    function addExecutor(address executor) external onlyOwner {
        _executors.add(executor);
    }
    
    function removeExecutor(address executor) external onlyOwner {
        _executors.remove(executor);
    }
    
    function isExecutor(address executor) external view returns (bool) {
        return _executors.contains(executor);
    }

    function getExecutors() external view returns (address[] memory) {
        return _executors.values();
    }

    function addClaimant(address claimant) external onlyOwner {
        _claimants.add(claimant);
    }
    
    function removeClaimant(address claimant) external onlyOwner {
        _claimants.remove(claimant);
    }
    
    function isClaimant(address claimant) external view returns (bool) {
        return _claimants.contains(claimant);
    }

    function claimFees(address to, uint quantity) external onlyClaimant {
        USDC.transfer(to, quantity);
    }

    function getTippers() external view returns (address[] memory) {
        return _tippers.values();
    }
    
    function isTipper(address user) external view returns (bool) {
        return _tippers.contains(user);
    }

    function getCastTippers(address cast) external view returns (address[] memory) {
        return _castTippers[cast].values();
    }
    
    function isCastTipper(address cast, address user) external view returns (bool) {
        return _castTippers[cast].contains(user);
    }

    function getUserEarnings(address user) external view returns (uint) {
        return _userEarnings[user];
    }

    function getEpochFees(uint epoch) external view returns (uint) {
        return _epochFees[epoch];
    }

    function getUserEpochFees(address user, uint epoch) external view returns (uint) {
        return _userEpochFees[user][epoch];
    }
}