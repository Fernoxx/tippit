// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IERC20 {
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function transfer(address to, uint256 amount) external returns (bool);
}

abstract contract Ownable {
    address private _owner;

    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);

    constructor() {
        _transferOwnership(msg.sender);
    }

    modifier onlyOwner() {
        _checkOwner();
        _;
    }

    function owner() public view virtual returns (address) {
        return _owner;
    }

    function _checkOwner() internal view virtual {
        require(owner() == msg.sender, "Ownable: caller is not the owner");
    }

    function _transferOwnership(address newOwner) internal virtual {
        address oldOwner = _owner;
        _owner = newOwner;
        emit OwnershipTransferred(oldOwner, newOwner);
    }
}

contract EcionBatch is Ownable {
    mapping(address => bool) private _executors;
    mapping(address => mapping(address => bool)) private _castTippers;
    mapping(address => bool) private _tippers;

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

    constructor() Ownable() {}

    function batchTip(
        address[] calldata froms, 
        address[] calldata tos, 
        address[] calldata casts,
        address[] calldata tokens,
        uint[] calldata amounts,
        bytes[] calldata data
    ) external onlyExecutor returns (bool[] memory) {
        uint256 gasStart = gasleft();
        uint256 length = froms.length;
        bool[] memory success = new bool[](length);
        
        for (uint i = 0; i < length; ) {
            success[i] = _tip(froms[i], tos[i], casts[i], tokens[i], amounts[i]);
            unchecked { ++i; }
        }
        
        uint256 gasUsed = gasStart - gasleft();
        emit BatchTipExecuted(length, gasUsed);
        
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
        // Prevent duplicate tips for same cast
        if (_castTippers[cast][from]) {
            return false;
        }

        // Attempt to transfer any ERC20 token
        if (amount > 0 && token != address(0)) {
            try IERC20(token).transferFrom(from, to, amount) {
                // Mark as tipped
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

    function emergencyWithdraw(address token, uint256 amount) external onlyOwner {
        if (token == address(0)) {
            payable(owner()).transfer(amount);
        } else {
            IERC20(token).transfer(owner(), amount);
        }
    }
}