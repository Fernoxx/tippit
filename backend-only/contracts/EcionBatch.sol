// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract EcionBatch is Ownable {
    mapping(address => bool) private _executors;

    modifier onlyExecutor() {
        require(_executors[msg.sender], "Only executors");
        _;
    }

    constructor() Ownable(msg.sender) {}

    function batchTip(
        address[] calldata froms, 
        address[] calldata tos, 
        address[] calldata tokens,
        uint[] calldata amounts
    ) external onlyExecutor returns (bool[] memory) {
        uint256 length = froms.length;
        bool[] memory success = new bool[](length);
        
        for (uint i = 0; i < length; ) {
            if (amounts[i] > 0 && tokens[i] != address(0)) {
                try IERC20(tokens[i]).transferFrom(froms[i], tos[i], amounts[i]) {
                    success[i] = true;
                } catch {
                    success[i] = false;
                }
            } else {
                success[i] = false;
            }
            unchecked { ++i; }
        }
        
        return success;
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

    function emergencyWithdraw(address token, uint256 amount) external onlyOwner {
        if (token == address(0)) {
            payable(owner()).transfer(amount);
        } else {
            IERC20(token).transfer(owner(), amount);
        }
    }
}