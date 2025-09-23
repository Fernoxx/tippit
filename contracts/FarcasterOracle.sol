// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/security/Pausable.sol";

interface IPITTipping {
    function processTip(
        address _postAuthor,
        address _interactor,
        string memory _actionType,
        bytes32 _farcasterCastHash
    ) external;
}

/**
 * @title FarcasterOracle
 * @dev Oracle contract to verify Farcaster interactions and trigger tips
 */
contract FarcasterOracle is AccessControl, Pausable {
    bytes32 public constant VERIFIER_ROLE = keccak256("VERIFIER_ROLE");
    
    IPITTipping public pitTipping;
    
    // Mapping to track processed interactions (prevent double tipping)
    mapping(bytes32 => bool) public processedInteractions;
    
    // Farcaster FID to Ethereum address mapping
    mapping(uint256 => address) public fidToAddress;
    mapping(address => uint256) public addressToFid;
    
    // Events
    event InteractionProcessed(
        bytes32 indexed interactionHash,
        address indexed postAuthor,
        address indexed interactor,
        string actionType,
        bytes32 castHash
    );
    
    event FIDMapped(uint256 indexed fid, address indexed ethAddress);
    
    constructor(address _pitTipping) {
        pitTipping = IPITTipping(_pitTipping);
        _setupRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _setupRole(VERIFIER_ROLE, msg.sender);
    }
    
    /**
     * @dev Process a verified Farcaster interaction
     * @param _postAuthorFid FID of the post author
     * @param _interactorFid FID of the user who interacted
     * @param _actionType Type of interaction (like, reply, recast, quote, follow)
     * @param _castHash Hash of the cast being interacted with
     * @param _interactionHash Unique hash of this interaction
     */
    function processInteraction(
        uint256 _postAuthorFid,
        uint256 _interactorFid,
        string memory _actionType,
        bytes32 _castHash,
        bytes32 _interactionHash
    ) external onlyRole(VERIFIER_ROLE) whenNotPaused {
        require(!processedInteractions[_interactionHash], "Interaction already processed");
        require(fidToAddress[_postAuthorFid] != address(0), "Post author not mapped");
        require(fidToAddress[_interactorFid] != address(0), "Interactor not mapped");
        require(_postAuthorFid != _interactorFid, "Cannot tip yourself");
        
        address postAuthor = fidToAddress[_postAuthorFid];
        address interactor = fidToAddress[_interactorFid];
        
        processedInteractions[_interactionHash] = true;
        
        // Call PIT tipping contract
        pitTipping.processTip(postAuthor, interactor, _actionType, _castHash);
        
        emit InteractionProcessed(
            _interactionHash,
            postAuthor,
            interactor,
            _actionType,
            _castHash
        );
    }
    
    /**
     * @dev Map a Farcaster FID to an Ethereum address
     * @param _fid Farcaster ID
     * @param _ethAddress Ethereum address
     */
    function mapFIDToAddress(uint256 _fid, address _ethAddress) external {
        require(_ethAddress != address(0), "Invalid address");
        require(_fid > 0, "Invalid FID");
        
        // Only allow users to map their own address or admin to map any
        require(
            msg.sender == _ethAddress || hasRole(DEFAULT_ADMIN_ROLE, msg.sender),
            "Unauthorized"
        );
        
        // Clear previous mapping if exists
        if (addressToFid[_ethAddress] != 0) {
            delete fidToAddress[addressToFid[_ethAddress]];
        }
        if (fidToAddress[_fid] != address(0)) {
            delete addressToFid[fidToAddress[_fid]];
        }
        
        fidToAddress[_fid] = _ethAddress;
        addressToFid[_ethAddress] = _fid;
        
        emit FIDMapped(_fid, _ethAddress);
    }
    
    /**
     * @dev Batch process multiple interactions
     */
    function batchProcessInteractions(
        uint256[] memory _postAuthorFids,
        uint256[] memory _interactorFids,
        string[] memory _actionTypes,
        bytes32[] memory _castHashes,
        bytes32[] memory _interactionHashes
    ) external onlyRole(VERIFIER_ROLE) whenNotPaused {
        require(
            _postAuthorFids.length == _interactorFids.length &&
            _postAuthorFids.length == _actionTypes.length &&
            _postAuthorFids.length == _castHashes.length &&
            _postAuthorFids.length == _interactionHashes.length,
            "Array length mismatch"
        );
        
        for (uint256 i = 0; i < _postAuthorFids.length; i++) {
            if (!processedInteractions[_interactionHashes[i]] &&
                fidToAddress[_postAuthorFids[i]] != address(0) &&
                fidToAddress[_interactorFids[i]] != address(0) &&
                _postAuthorFids[i] != _interactorFids[i]) {
                
                processedInteractions[_interactionHashes[i]] = true;
                
                try pitTipping.processTip(
                    fidToAddress[_postAuthorFids[i]],
                    fidToAddress[_interactorFids[i]],
                    _actionTypes[i],
                    _castHashes[i]
                ) {
                    emit InteractionProcessed(
                        _interactionHashes[i],
                        fidToAddress[_postAuthorFids[i]],
                        fidToAddress[_interactorFids[i]],
                        _actionTypes[i],
                        _castHashes[i]
                    );
                } catch {
                    // Continue processing other interactions
                    processedInteractions[_interactionHashes[i]] = false;
                }
            }
        }
    }
    
    /**
     * @dev Update PIT tipping contract address
     */
    function updatePITTipping(address _newPITTipping) external onlyRole(DEFAULT_ADMIN_ROLE) {
        pitTipping = IPITTipping(_newPITTipping);
    }
    
    /**
     * @dev Pause/unpause
     */
    function pause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _pause();
    }
    
    function unpause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _unpause();
    }
}