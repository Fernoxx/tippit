// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

contract EcionBatch {
    event BatchTransferExecuted(uint256 totalTransfers, uint256 gasUsed);
    
    address public owner;
    
    modifier onlyOwner() {
        require(msg.sender == owner, "Not the owner");
        _;
    }
    
    constructor() {
        owner = msg.sender;
    }
    
    // This is exactly like Noice's executeBatch function
    // Function signature: 0x34fcd5be
    function executeBatch(address[] calldata targets, uint256[] calldata values, bytes[] calldata datas) external onlyOwner {
        uint256 gasStart = gasleft();
        uint256 totalTransfers = 0;
        
        for (uint256 i = 0; i < targets.length; i++) {
            address target = targets[i];
            uint256 value = values[i];
            bytes memory data = datas[i];
            
            // Execute the call using low-level call
            // The caller (owner/backend wallet) must have approval to spend tokens
            // Users approve the backend wallet (owner), not this contract
            // We need to call transferFrom using the backend wallet as the caller
            (bool success, ) = target.call{value: value}(data);
            require(success, "Transfer failed");
            
            totalTransfers++;
        }
        
        uint256 gasUsed = gasStart - gasleft();
        emit BatchTransferExecuted(totalTransfers, gasUsed);
    }
    
    // Transfer ownership to a new owner
    function transferOwnership(address newOwner) external onlyOwner {
        require(newOwner != address(0), "New owner cannot be zero address");
        owner = newOwner;
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