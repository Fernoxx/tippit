export const CONTRACTS = {
  PITTipping: {
    address: '0x0000000000000000000000000000000000000000', // To be deployed
    abi: [
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
        "inputs": [{ "internalType": "uint256", "name": "_newLimit", "type": "uint256" }],
        "name": "updateSpendingLimit",
        "outputs": [],
        "stateMutability": "nonpayable",
        "type": "function"
      },
      {
        "inputs": [],
        "name": "revokeConfig",
        "outputs": [],
        "stateMutability": "nonpayable",
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
      },
      {
        "inputs": [{ "internalType": "address", "name": "user", "type": "address" }],
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
        "inputs": [
          { "internalType": "address", "name": "_token", "type": "address" },
          { "internalType": "address", "name": "_to", "type": "address" }
        ],
        "name": "emergencyWithdraw",
        "outputs": [],
        "stateMutability": "nonpayable",
        "type": "function"
      }
    ]
  },
  FarcasterOracle: {
    address: '0x0000000000000000000000000000000000000000', // To be deployed
    abi: [
      {
        "inputs": [
          { "internalType": "uint256", "name": "_fid", "type": "uint256" },
          { "internalType": "address", "name": "_ethAddress", "type": "address" }
        ],
        "name": "mapFIDToAddress",
        "outputs": [],
        "stateMutability": "nonpayable",
        "type": "function"
      }
    ]
  },
  USDC: {
    address: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', // USDC on Base
    decimals: 6,
    abi: [
      {
        "inputs": [
          { "internalType": "address", "name": "spender", "type": "address" },
          { "internalType": "uint256", "name": "amount", "type": "uint256" }
        ],
        "name": "approve",
        "outputs": [{ "internalType": "bool", "name": "", "type": "bool" }],
        "stateMutability": "nonpayable",
        "type": "function"
      },
      {
        "inputs": [{ "internalType": "address", "name": "account", "type": "address" }],
        "name": "balanceOf",
        "outputs": [{ "internalType": "uint256", "name": "", "type": "uint256" }],
        "stateMutability": "view",
        "type": "function"
      },
      {
        "inputs": [
          { "internalType": "address", "name": "owner", "type": "address" },
          { "internalType": "address", "name": "spender", "type": "address" }
        ],
        "name": "allowance",
        "outputs": [{ "internalType": "uint256", "name": "", "type": "uint256" }],
        "stateMutability": "view",
        "type": "function"
      }
    ]
  }
};

export const CHAIN_ID = 8453; // Base mainnet

export const formatAmount = (amount: bigint, decimals: number = 6): string => {
  const divisor = BigInt(10 ** decimals);
  const beforeDecimal = amount / divisor;
  const afterDecimal = amount % divisor;
  const afterDecimalStr = afterDecimal.toString().padStart(decimals, '0');
  const trimmed = afterDecimalStr.replace(/0+$/, '');
  return trimmed ? `${beforeDecimal}.${trimmed}` : beforeDecimal.toString();
};