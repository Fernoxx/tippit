const { ethers } = require('ethers');

// Contract ABI (simplified version)
const PITTIPPING_ABI = [
  {
    "inputs": [
      { "internalType": "address", "name": "_token", "type": "address" },
      { "internalType": "uint256", "name": "_likeAmount", "type": "uint256" },
      { "internalType": "uint256", "name": "_replyAmount", "type": "uint256" },
      { "internalType": "uint256", "name": "_recastAmount", "type": "uint256" },
      { "internalType": "uint256", "name": "_quoteAmount", "type": "uint256" },
      { "internalType": "uint256", "name": "_followAmount", "type": "uint256" },
      { "internalType": "uint256", "name": "_spendingLimit", "type": "uint256" }
    ],
    "name": "setTippingConfig",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      { "internalType": "address", "name": "_postAuthor", "type": "address" },
      { "internalType": "address", "name": "_interactor", "type": "address" },
      { "internalType": "string", "name": "_actionType", "type": "string" },
      { "internalType": "bytes32", "name": "_farcasterCastHash", "type": "bytes32" },
      { "internalType": "bytes32", "name": "_interactionHash", "type": "bytes32" }
    ],
    "name": "processTip",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      { "internalType": "address[]", "name": "_postAuthors", "type": "address[]" },
      { "internalType": "address[]", "name": "_interactors", "type": "address[]" },
      { "internalType": "string[]", "name": "_actionTypes", "type": "string[]" },
      { "internalType": "bytes32[]", "name": "_castHashes", "type": "bytes32[]" },
      { "internalType": "bytes32[]", "name": "_interactionHashes", "type": "bytes32[]" }
    ],
    "name": "batchProcessTips",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [{ "internalType": "address", "name": "_user", "type": "address" }],
    "name": "userConfigs",
    "outputs": [
      { "internalType": "address", "name": "token", "type": "address" },
      { "internalType": "uint256", "name": "likeAmount", "type": "uint256" },
      { "internalType": "uint256", "name": "replyAmount", "type": "uint256" },
      { "internalType": "uint256", "name": "recastAmount", "type": "uint256" },
      { "internalType": "uint256", "name": "quoteAmount", "type": "uint256" },
      { "internalType": "uint256", "name": "followAmount", "type": "uint256" },
      { "internalType": "uint256", "name": "spendingLimit", "type": "uint256" },
      { "internalType": "uint256", "name": "totalSpent", "type": "uint256" },
      { "internalType": "bool", "name": "isActive", "type": "bool" }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [{ "internalType": "address", "name": "_user", "type": "address" }],
    "name": "getUserAvailableBalance",
    "outputs": [
      { "internalType": "address", "name": "token", "type": "address" },
      { "internalType": "uint256", "name": "balance", "type": "uint256" },
      { "internalType": "uint256", "name": "allowance", "type": "uint256" },
      { "internalType": "uint256", "name": "availableToTip", "type": "uint256" }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      { "internalType": "uint256", "name": "offset", "type": "uint256" },
      { "internalType": "uint256", "name": "limit", "type": "uint256" }
    ],
    "name": "getUsersByLikeAmount",
    "outputs": [
      { "internalType": "address[]", "name": "users", "type": "address[]" },
      { "internalType": "uint256[]", "name": "amounts", "type": "uint256[]" }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      { "internalType": "uint256", "name": "offset", "type": "uint256" },
      { "internalType": "uint256", "name": "limit", "type": "uint256" }
    ],
    "name": "getLeaderboard",
    "outputs": [
      { "internalType": "address[]", "name": "users", "type": "address[]" },
      { "internalType": "uint256[]", "name": "amounts", "type": "uint256[]" }
    ],
    "stateMutability": "view",
    "type": "function"
  }
];

let contracts = {};

async function initializeContracts() {
  try {
    // Initialize provider
    const provider = new ethers.JsonRpcProvider(process.env.BASE_RPC_URL);
    
    // Initialize signer
    const signer = new ethers.Wallet(process.env.PRIVATE_KEY, provider);
    
    // Initialize contract
    const contractAddress = process.env.CONTRACT_ADDRESS;
    if (!contractAddress || contractAddress === '0x0000000000000000000000000000000000000000') {
      // Use deployed proxy address as default
      const defaultAddress = '0x5546973c5b38652db0920bb916fe2bc77d678af4';
      console.log(`Using default contract address: ${defaultAddress}`);
      contracts.pitTipping = new ethers.Contract(defaultAddress, PITTIPPING_ABI, signer);
    } else {
      contracts.pitTipping = new ethers.Contract(contractAddress, PITTIPPING_ABI, signer);
    }
    
    // Verify contract is deployed
    const finalAddress = contracts.pitTipping.address;
    const code = await provider.getCode(finalAddress);
    if (code === '0x') {
      throw new Error(`No contract found at address ${finalAddress}`);
    }
    
    console.log(`✅ Contract initialized at ${finalAddress}`);
    
    // Test connection
    try {
      const protocolFee = await contracts.pitTipping.protocolFeeBps();
      console.log(`✅ Contract connection verified. Protocol fee: ${protocolFee} bps`);
    } catch (error) {
      console.warn('⚠️ Could not verify contract connection:', error.message);
    }
    
  } catch (error) {
    console.error('❌ Failed to initialize contracts:', error);
    throw error;
  }
}

module.exports = {
  contracts,
  initializeContracts
};