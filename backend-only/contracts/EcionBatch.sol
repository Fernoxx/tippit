// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

contract EcionBatch {
    event BatchTransferExecuted(uint256 totalTransfers, uint256 gasUsed);
    
    struct TransferCall {
        address token;
        uint256 amount;
        bytes callData;
    }
    
    address public owner;
    
    modifier onlyOwner() {
        require(msg.sender == owner, "Not the owner");
        _;
    }
    
    constructor() {
        owner = msg.sender;
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
            
            // Execute the transferFrom using low-level call
            (bool success, ) = token.call(
                abi.encodeWithSignature(
                    "transferFrom(address,address,uint256)",
                    from,
                    to,
                    transferAmount
                )
            );
            require(success, "Transfer failed");
            
            totalTransfers++;
        }
        
        uint256 gasUsed = gasStart - gasleft();
        emit BatchTransferExecuted(totalTransfers, gasUsed);
    }
    
    // Emergency function to withdraw stuck tokens
    function emergencyWithdraw(address token, uint256 amount) external onlyOwner {
        (bool success, ) = token.call(
            abi.encodeWithSignature(
                "transfer(address,uint256)",
                owner,
                amount
            )
        );
        require(success, "Withdraw failed");
    }
}