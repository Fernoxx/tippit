// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts@4.9.5/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts@4.9.5/access/Ownable.sol";

contract EcionBatch is Ownable {
    mapping(address => mapping(address => bool)) private _castTippers;
    mapping(address => bool) private _tippers;
    mapping(address => bool) private _executors;

    modifier onlyExecutor() {
        require(_executors[msg.sender], "Only executors");
        _;
    }

    event Tip(
        address indexed from,
        address indexed to,
        address indexed cast,
        address token,
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
        address[] calldata tokens,
        uint[] calldata amounts,
        bytes[] calldata data
    ) external onlyExecutor returns (bool[] memory) {
        uint256 gasStart = gasleft();
        
        bool[] memory success = new bool[](froms.length);
        
        for (uint i = 0; i < froms.length; i++) {
            success[i] = _tip(froms[i], tos[i], casts[i], tokens[i], amounts[i]);
        }
        
        uint256 gasUsed = gasStart - gasleft();
        
        emit BatchTipExecuted(froms.length, gasUsed);
        
        return success;
    }

    function tip(
        address from, 
        address to, 
        address cast, 
        address token,
        uint amount
    ) external onlyExecutor returns (bool) {
        return _tip(from, to, cast, token, amount);
    }

    function _tip(
        address from, 
        address to, 
        address cast, 
        address token,
        uint amount
    ) internal returns (bool) {
        // Only process the tip for the first time
        if (_castTippers[cast][from]) {
            return false;
        }

        // Attempt to transfer any ERC20 token
        if (amount > 0 && token != address(0)) {
            try IERC20(token).transferFrom(from, to, amount) {
                // Tip successful
                _tippers[from] = true;
                _castTippers[cast][from] = true;

                emit Tip(from, to, cast, token, amount, block.timestamp);
                return true;
            } catch {
                return false;
            }
        }

        return false;
    }

    function addExecutor(address executor) external onlyOwner {
        _executors[executor] = true;
    }
    
    function removeExecutor(address executor) external onlyOwner {
        _executors[executor] = false;
    }
    
    function isExecutor(address executor) external view returns (bool) {
        return _executors[executor];
    }

    function isTipper(address user) external view returns (bool) {
        return _tippers[user];
    }

    function isCastTipper(address cast, address user) external view returns (bool) {
        return _castTippers[cast][user];
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