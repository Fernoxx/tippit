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
 * Send ECION token rewards to both tipper and engager using direct transfers
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
 * Process rewards for a tip interaction
 * @param {number} tipperFid - Tipper's Farcaster FID
 * @param {number} engagerFid - Engager's Farcaster FID
 * @param {string} tipperAddress - Tipper's wallet address
 * @param {string} engagerAddress - Engager's wallet address
 * @returns {Promise<Object>} - Reward processing result
 */
async function processTipRewards(tipperFid, engagerFid, tipperAddress, engagerAddress) {
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

    // Only send rewards if at least one party holds 1M+ tokens
    if (rewards.totalReward > 0) {
      console.log(`💰 Calculated rewards: ${rewards.tipperReward} ECION tokens each (Tipper multiplier: ${rewards.tipperReward - calculateRewardMultiplier(engagerBalance)}, Engager multiplier: ${rewards.tipperReward - calculateRewardMultiplier(tipperBalance)})`);
      const result = await sendEcionRewards(
        tipperAddress,
        engagerAddress,
        rewards.tipperReward,
        rewards.engagerReward
      );
      
      if (result.success && !result.skipped) {
        console.log(`✅ ECION rewards sent successfully: ${result.transferCount || 0} transfers to tipper and engager`);
      } else if (result.error) {
        console.error(`⚠️ ECION reward transfer error: ${result.error}`);
      }
      
      return {
        success: true,
        rewards: rewards,
        balances: { tipper: tipperBalance, engager: engagerBalance },
        ...result
      };
    } else {
      console.log(`ℹ️ No ECION rewards (both hold < 1M tokens)`);
      return {
        success: true,
        rewards: rewards,
        balances: { tipper: tipperBalance, engager: engagerBalance },
        skipped: true,
        reason: 'Insufficient token holdings'
      };
    }
  } catch (error) {
    console.error(`❌ ECION reward processing error:`, error.message);
    return {
      success: false,
      error: error.message
    };
  }
}

module.exports = {
  getTokenBalanceFromNeynar,
  calculateRewardMultiplier,
  calculateTipRewards,
  sendEcionRewards,
  processTipRewards,
  ECION_TOKEN_ADDRESS
};
