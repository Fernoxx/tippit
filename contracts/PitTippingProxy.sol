// SPDX-License-Identifier: MIT
pragma solidity 0.6.12;

/**
 * @title PitTippingProxy
 * @dev Proxy contract for PitTippingImplementation
 * NO OpenZeppelin imports - pure Solidity like Noice
 */
contract PitTippingProxy {
    // Storage layout must match implementation
    address public owner;
    address public feeRecipient;
    address public backendVerifier;
    
    // Implementation address
    address public implementation;
    
    // Events
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);
    
    constructor(address _implementation) public {
        owner = msg.sender;
        implementation = _implementation;
    }
    
    modifier onlyOwner() {
        require(msg.sender == owner, "Only owner can call");
        _;
    }
    
    // Delegate all calls to implementation
    fallback() external payable {
        address _impl = implementation;
        assembly {
            let ptr := mload(0x40)
            calldatacopy(ptr, 0, calldatasize())
            let result := delegatecall(gas(), _impl, ptr, calldatasize(), 0, 0)
            let size := returndatasize()
            returndatacopy(ptr, 0, size)
            
            switch result
            case 0 { revert(ptr, size) }
            default { return(ptr, size) }
        }
    }
    
    receive() external payable {
        // Allow receiving ETH
    }
    
    function upgradeImplementation(address _newImplementation) external onlyOwner {
        implementation = _newImplementation;
    }
    
    function transferOwnership(address _newOwner) external onlyOwner {
        require(_newOwner != address(0), "Invalid new owner");
        emit OwnershipTransferred(owner, _newOwner);
        owner = _newOwner;
    }
}