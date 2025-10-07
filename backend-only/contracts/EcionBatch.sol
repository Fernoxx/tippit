// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";

contract EcionBatch is Ownable {
    using EnumerableSet for EnumerableSet.AddressSet;

    mapping(address => EnumerableSet.AddressSet) private _castTippers;
    EnumerableSet.AddressSet private _tippers;
    EnumerableSet.AddressSet private _executors;

    IERC20 public constant USDC = IERC20(0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913);

    modifier onlyExecutor() {
        require(_executors.contains(msg.sender), "Only executors");
        _;
    }

    event Tip(
        address indexed from,
        address indexed to,
        address indexed cast,
        uint quantity,
        uint timestamp
    );

    event BatchTipExecuted(
        uint totalTransfers,
        uint gasUsed
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
        
        bool[] memory success = new bool[](froms.length);
        
        for (uint i = 0; i < froms.length; i++) {
            success[i] = _tip(froms[i], tos[i], casts[i], usdcAmounts[i]);
        }
        
        uint256 gasUsed = gasStart - gasleft();
        
        emit BatchTipExecuted(froms.length, gasUsed);
        
        return success;
    }

    function tip(
        address from, 
        address to, 
        address cast, 
        uint usdcAmount
    ) external onlyExecutor returns (bool) {
        return _tip(from, to, cast, usdcAmount);
    }

    function _tip(
        address from, 
        address to, 
        address cast, 
        uint usdcAmount
    ) internal returns (bool) {
        // Only process the tip for the first time
        if (_castTippers[cast].contains(from)) {
            return false;
        }

        // Attempt to charge USDC
        if (usdcAmount > 0) {
            try USDC.transferFrom(from, to, usdcAmount) {
                // Tip successful
                _tippers.add(from);
                _castTippers[cast].add(from);

                emit Tip(from, to, cast, usdcAmount, block.timestamp);
                return true;
            } catch {
                return false;
            }
        }

        return false;
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

    /**
     * @dev Emergency withdraw function for stuck tokens
     */
    function emergencyWithdraw(address token, uint256 amount) external onlyOwner {
        if (token == address(0)) {
            payable(owner()).transfer(amount);
        } else {
            IERC20(token).transfer(owner(), amount);
        }
    }
}