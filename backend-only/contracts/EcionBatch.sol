// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract EcionBatch is Ownable {
    event BatchTransferExecuted(uint256 totalTransfers, uint256 gasUsed);
    
    struct TransferCall {
        address token;
        uint256 amount;
        bytes callData;
    }
    
    // This is exactly like Noice's executeBatch function
    function executeBatch(TransferCall[] calldata calls) external onlyOwner {
        uint256 gasStart = gasleft();
        uint256 totalTransfers = 0;
        
        for (uint256 i = 0; i < calls.length; i++) {
            TransferCall memory call = calls[i];
            address token = call.token;
            bytes memory callData = call.callData;
            
            // Decode the transferFrom call data
            (address from, address to, uint256 transferAmount) = abi.decode(callData[4:], (address, address, uint256));
            
            // Execute the transferFrom
            IERC20(token).transferFrom(from, to, transferAmount);
            
            totalTransfers++;
        }
        
        uint256 gasUsed = gasStart - gasleft();
        emit BatchTransferExecuted(totalTransfers, gasUsed);
    }
    
    // Emergency function to withdraw stuck tokens
    function emergencyWithdraw(address token, uint256 amount) external onlyOwner {
        IERC20(token).transfer(owner(), amount);
    }
}