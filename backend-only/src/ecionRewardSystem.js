// ECION Token Reward System
// Rewards tipper and engager based on their ECION token holdings

const ECION_TOKEN_ADDRESS = process.env.ECION_TOKEN_ADDRESS || '0x946a173ad73cbb942b9877e9029fa4c4dc7f2b07'; // Test token
const ECION_TOKEN_DECIMALS = 18; // Assuming 18 decimals
const BASE_NETWORK = 'base';

console.log(`🎁 ECION Reward System initialized with token: ${ECION_TOKEN_ADDRESS}`);

/**
 * Get wallet address from FID
 * @param {number} fid - Farcaster FID
 * @returns {Promise<string|null>} - Wallet address or null
 */
async function getWalletAddressFromFid(fid) {
  try {
    const { getUserByFid } = require('./neynar');
    const user = await getUserByFid(fid);
    if (!user) return null;
    
    const address = user.verified_addresses?.primary?.eth_address || 
                   user.verified_addresses?.eth_addresses?.[0];
    return address ? address.toLowerCase() : null;
  } catch (error) {
    console.error(`❌ Error getting address for FID ${fid}:`, error.message);
    return null;
  }
}

/**
 * Check token balance using Infura RPC (blockchain)
 * @param {string} walletAddress - Wallet address to check
 * @param {string} tokenAddress - Token contract address
 * @returns {Promise<number>} - Balance in tokens (not wei)
 */
async function getTokenBalanceFromBlockchain(walletAddress, tokenAddress) {
  try {
    const { ethers } = require('ethers');
    const { getProvider } = require('./rpcProvider');
    
    // Try Infura first if available
    let provider = null;
    if (process.env.INFURA_RPC_URL || process.env.INFURA_URL) {
      const infuraUrl = process.env.INFURA_RPC_URL || process.env.INFURA_URL;
      provider = new ethers.JsonRpcProvider(infuraUrl);
    } else {
      // Fallback to regular provider
      provider = await getProvider();
    }
    
    const normalizedTokenAddress = tokenAddress.toLowerCase();
    const normalizedWalletAddress = walletAddress.toLowerCase();
    
    // Create token contract instance
    const tokenContract = new ethers.Contract(
      normalizedTokenAddress,
      [
        "function balanceOf(address owner) view returns (uint256)",
        "function decimals() view returns (uint8)"
      ],
      provider
    );
    
    // Get balance and decimals
    const [balance, decimals] = await Promise.all([
      tokenContract.balanceOf(normalizedWalletAddress),
      tokenContract.decimals().catch(() => ECION_TOKEN_DECIMALS) // Fallback to 18 if decimals() fails
    ]);
    
    // Convert from wei to tokens
    const balanceInTokens = parseFloat(ethers.formatUnits(balance, decimals));
    
    return balanceInTokens;
  } catch (error) {
    console.error(`❌ Blockchain balance check error for ${walletAddress}:`, error.message);
    return 0;
  }
}

/**
 * Check token balance for a user using blockchain RPC (Infura)
 * @param {number} fid - Farcaster FID
 * @param {string} tokenAddress - Token contract address to check
 * @returns {Promise<number>} - Balance in tokens (not wei)
 */
async function getTokenBalanceFromNeynar(fid, tokenAddress) {
  try {
    // Get wallet address from FID first
    const walletAddress = await getWalletAddressFromFid(fid);
    if (!walletAddress) {
      console.error(`❌ No wallet address found for FID ${fid}`);
      return 0;
    }
    
    // Check balance using blockchain RPC (Infura)
    const balance = await getTokenBalanceFromBlockchain(walletAddress, tokenAddress);
    return balance;
  } catch (error) {
    console.error(`❌ Balance check error for FID ${fid}:`, error.message);
    return 0;
  }
}

/**
 * Calculate reward multiplier based on token balance
 * Formula: floor(balance_in_millions) * 10
 * @param {number} balance - Token balance
 * @returns {number} - Reward multiplier (tokens per person)
 */
function calculateRewardMultiplier(balance) {
  if (!balance || balance <= 0) {
    return 0;
  }
  
  // Convert balance to millions (assuming 18 decimals)
  const balanceInMillions = balance / 1_000_000;
  
  // Round down to nearest million
  const millionsHeld = Math.floor(balanceInMillions);
  
  // Base reward per million: 10 ECION tokens
  return millionsHeld * 10;
}

/**
 * Calculate rewards for both tipper and engager
 * Both get: (tipper_multiplier + engager_multiplier) tokens
 * @param {number} tipperBalance - Tipper's ECION token balance
 * @param {number} engagerBalance - Engager's ECION token balance
 * @returns {Object} - { tipperReward, engagerReward, totalReward }
 */
function calculateTipRewards(tipperBalance, engagerBalance) {
  const tipperMultiplier = calculateRewardMultiplier(tipperBalance);
  const engagerMultiplier = calculateRewardMultiplier(engagerBalance);
  
  // Both get the same amount: sum of both multipliers
  const rewardPerPerson = tipperMultiplier + engagerMultiplier;
  
  return {
    tipperReward: rewardPerPerson,
    engagerReward: rewardPerPerson,
    totalReward: rewardPerPerson * 2
  };
}

/**
 * Prepare ECION token reward transfers for batch inclusion
 * Returns transfer data that can be added to EcionBatch.batchTip()
 * @param {string} backendWalletAddress - Backend wallet address (from address)
 * @param {string} tipperAddress - Tipper's wallet address
 * @param {string} engagerAddress - Engager's wallet address
 * @param {number} tipperReward - Reward amount for tipper
 * @param {number} engagerReward - Reward amount for engager
 * @returns {Promise<Object>} - { success: boolean, transfers: Array, error?: string }
 */
async function prepareEcionRewardTransfers(backendWalletAddress, tipperAddress, engagerAddress, tipperReward, engagerReward) {
  const { ethers } = require('ethers');
  const { getProvider } = require('./rpcProvider');
  
  try {
    // Only prepare if rewards > 0
    if (tipperReward <= 0 && engagerReward <= 0) {
      return { success: true, transfers: [], skipped: true };
    }

    const provider = await getProvider();

    // Create token contract instance for balance check
    const tokenContract = new ethers.Contract(
      ECION_TOKEN_ADDRESS,
      [
        "function balanceOf(address owner) view returns (uint256)"
      ],
      provider
    );

    // Check backend wallet balance
    const backendBalance = await tokenContract.balanceOf(backendWalletAddress);
    const totalReward = tipperReward + engagerReward;
    const totalRewardWei = ethers.parseUnits(totalReward.toString(), ECION_TOKEN_DECIMALS);
    
    if (backendBalance < totalRewardWei) {
      throw new Error(`Insufficient ECION balance in backend wallet. Have: ${ethers.formatUnits(backendBalance, ECION_TOKEN_DECIMALS)}, Need: ${totalReward}`);
    }

    const transfers = [];
    
    // Prepare tipper reward transfer if > 0
    if (tipperReward > 0) {
      const amountWei = ethers.parseUnits(tipperReward.toString(), ECION_TOKEN_DECIMALS);
      transfers.push({
        from: backendWalletAddress.toLowerCase(),
        to: tipperAddress.toLowerCase(),
        tokenAddress: ECION_TOKEN_ADDRESS.toLowerCase(), // Use tokenAddress to match prepareTokenTips format
        amount: amountWei
      });
    }
    
    // Prepare engager reward transfer if > 0
    if (engagerReward > 0) {
      const amountWei = ethers.parseUnits(engagerReward.toString(), ECION_TOKEN_DECIMALS);
      transfers.push({
        from: backendWalletAddress.toLowerCase(),
        to: engagerAddress.toLowerCase(),
        tokenAddress: ECION_TOKEN_ADDRESS.toLowerCase(), // Use tokenAddress to match prepareTokenTips format
        amount: amountWei
      });
    }
    
    return { 
      success: true, 
      transfers: transfers,
      transferCount: transfers.length 
    };
  } catch (error) {
    console.error(`❌ Error preparing ECION reward transfers:`, error);
    return { success: false, error: error.message, transfers: [] };
  }
}

/**
 * Send ECION token rewards to both tipper and engager using direct transfers
 * @deprecated Use prepareEcionRewardTransfers instead to include in batch
 * @param {string} tipperAddress - Tipper's wallet address
 * @param {string} engagerAddress - Engager's wallet address
 * @param {number} tipperReward - Reward amount for tipper
 * @param {number} engagerReward - Reward amount for engager
 * @returns {Promise<Object>} - { success: boolean, transactionHash?: string, error?: string }
 */
async function sendEcionRewards(tipperAddress, engagerAddress, tipperReward, engagerReward) {
  const { ethers } = require('ethers');
  const { getProvider } = require('./rpcProvider');
  
  try {
    // Only send if rewards > 0
    if (tipperReward <= 0 && engagerReward <= 0) {
      console.log(`ℹ️ No rewards to send (tipper: ${tipperReward}, engager: ${engagerReward})`);
      return { success: true, skipped: true };
    }

    const provider = await getProvider();
    const backendWalletPrivateKey = process.env.BACKEND_REWARD_WALLET_PRIVATE_KEY || process.env.BACKEND_WALLET_PRIVATE_KEY;
    
    if (!backendWalletPrivateKey) {
      throw new Error('Backend reward wallet private key not configured (BACKEND_REWARD_WALLET_PRIVATE_KEY or BACKEND_WALLET_PRIVATE_KEY)');
    }

    const backendWallet = new ethers.Wallet(backendWalletPrivateKey, provider);

    // Create token contract instance
    const tokenContract = new ethers.Contract(
      ECION_TOKEN_ADDRESS,
      [
        "function transfer(address to, uint256 amount) returns (bool)",
        "function balanceOf(address owner) view returns (uint256)"
      ],
      backendWallet
    );

    // Check backend wallet balance
    const backendBalance = await tokenContract.balanceOf(backendWallet.address);
    const totalReward = tipperReward + engagerReward;
    const totalRewardWei = ethers.parseUnits(totalReward.toString(), ECION_TOKEN_DECIMALS);
    
    if (backendBalance < totalRewardWei) {
      throw new Error(`Insufficient ECION balance in backend wallet. Have: ${ethers.formatUnits(backendBalance, ECION_TOKEN_DECIMALS)}, Need: ${totalReward}`);
    }

    const transactionHashes = [];
    
    // Send tipper reward if > 0
    if (tipperReward > 0) {
      const amountWei = ethers.parseUnits(tipperReward.toString(), ECION_TOKEN_DECIMALS);
      const tx = await tokenContract.transfer(tipperAddress.toLowerCase(), amountWei);
      transactionHashes.push(tx.hash);
    }
    
    // Send engager reward if > 0
    if (engagerReward > 0) {
      const amountWei = ethers.parseUnits(engagerReward.toString(), ECION_TOKEN_DECIMALS);
      const tx = await tokenContract.transfer(engagerAddress.toLowerCase(), amountWei);
      transactionHashes.push(tx.hash);
    }
    
    if (transactionHashes.length > 0) {
      return { 
        success: true, 
        transactionHashes: transactionHashes,
        transferCount: transactionHashes.length 
      };
    }

    return { success: true, skipped: true };
  } catch (error) {
    console.error(`❌ Error sending ECION rewards:`, error);
    return { success: false, error: error.message };
  }
}

/**
 * Process rewards for a tip interaction and prepare transfer data for batch inclusion
 * @param {string} backendWalletAddress - Backend wallet address (from address for rewards)
 * @param {number} tipperFid - Tipper's Farcaster FID
 * @param {number} engagerFid - Engager's Farcaster FID
 * @param {string} tipperAddress - Tipper's wallet address
 * @param {string} engagerAddress - Engager's wallet address
 * @returns {Promise<Object>} - Reward processing result with transfer data
 */
async function processTipRewards(backendWalletAddress, tipperFid, engagerFid, tipperAddress, engagerAddress) {
  try {
    console.log(`🎁 Checking ECION balances via blockchain: Tipper ${tipperAddress}, Engager ${engagerAddress}`);
    
    // Check balances directly from blockchain using wallet addresses
    const [tipperBalance, engagerBalance] = await Promise.all([
      getTokenBalanceFromBlockchain(tipperAddress, ECION_TOKEN_ADDRESS),
      getTokenBalanceFromBlockchain(engagerAddress, ECION_TOKEN_ADDRESS)
    ]);

    const tipperM = tipperBalance > 0 ? (tipperBalance / 1_000_000).toFixed(2) : '0';
    const engagerM = engagerBalance > 0 ? (engagerBalance / 1_000_000).toFixed(2) : '0';
    console.log(`📊 ECION balances - Tipper: ${tipperM}M (${tipperBalance} tokens), Engager: ${engagerM}M (${engagerBalance} tokens)`);

    // Calculate rewards
    const rewards = calculateTipRewards(tipperBalance, engagerBalance);

    // Only prepare transfers if at least one party holds 1M+ tokens
    if (rewards.totalReward > 0) {
      const tipperMultiplier = calculateRewardMultiplier(tipperBalance);
      const engagerMultiplier = calculateRewardMultiplier(engagerBalance);
      console.log(`💰 Calculated rewards: ${rewards.tipperReward} ECION tokens each (Tipper multiplier: ${tipperMultiplier}, Engager multiplier: ${engagerMultiplier})`);
      
      // Prepare transfers for batch inclusion
      const transferResult = await prepareEcionRewardTransfers(
        backendWalletAddress,
        tipperAddress,
        engagerAddress,
        rewards.tipperReward,
        rewards.engagerReward
      );
      
      if (transferResult.success && transferResult.transfers.length > 0) {
        console.log(`✅ ECION reward transfers prepared: ${transferResult.transferCount || 0} transfers ready for batch`);
        return {
          success: true,
          rewards: rewards,
          balances: { tipper: tipperBalance, engager: engagerBalance },
          transfers: transferResult.transfers,
          transferCount: transferResult.transferCount
        };
      } else if (transferResult.error) {
        console.error(`⚠️ ECION reward transfer preparation error: ${transferResult.error}`);
        return {
          success: false,
          rewards: rewards,
          balances: { tipper: tipperBalance, engager: engagerBalance },
          error: transferResult.error,
          transfers: []
        };
      }
    } else {
      console.log(`ℹ️ No ECION rewards (both hold < 1M tokens)`);
      return {
        success: true,
        rewards: rewards,
        balances: { tipper: tipperBalance, engager: engagerBalance },
        skipped: true,
        reason: 'Insufficient token holdings',
        transfers: []
      };
    }
  } catch (error) {
    console.error(`❌ ECION reward processing error:`, error.message);
    return {
      success: false,
      error: error.message,
      transfers: []
    };
  }
}

module.exports = {
  getTokenBalanceFromNeynar,
  calculateRewardMultiplier,
  calculateTipRewards,
  sendEcionRewards,
  prepareEcionRewardTransfers,
  processTipRewards,
  ECION_TOKEN_ADDRESS
};
