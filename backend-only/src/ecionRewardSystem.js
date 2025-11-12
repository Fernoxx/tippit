// ECION Token Reward System
// Rewards tipper and engager based on their ECION token holdings

const ECION_TOKEN_ADDRESS = process.env.ECION_TOKEN_ADDRESS || '0x946a173ad73cbb942b9877e9029fa4c4dc7f2b07'; // Test token
const ECION_TOKEN_DECIMALS = 18; // Assuming 18 decimals
const BASE_NETWORK = 'base';

console.log(`🎁 ECION Reward System initialized with token: ${ECION_TOKEN_ADDRESS}`);

/**
 * Check token balance for a user using Neynar API
 * @param {number} fid - Farcaster FID
 * @param {string} tokenAddress - Token contract address to check
 * @returns {Promise<number>} - Balance in tokens (not wei)
 */
async function getTokenBalanceFromNeynar(fid, tokenAddress) {
  try {
    const normalizedTokenAddress = tokenAddress.toLowerCase();
    
    const response = await fetch(
      `https://api.neynar.com/v2/farcaster/user/balance/?fid=${fid}&networks=${BASE_NETWORK}`,
      {
        headers: {
          'x-api-key': process.env.NEYNAR_API_KEY
        }
      }
    );

    if (!response.ok) {
      console.error(`❌ Balance check failed for FID ${fid}: ${response.status}`);
      return 0;
    }

    const data = await response.json();
    
    // Loop through all address balances - find our token only
    if (data.user_balance?.address_balances) {
      for (const addressBalance of data.user_balance.address_balances) {
        if (addressBalance.token_balances) {
          for (const tokenBalance of addressBalance.token_balances) {
            const token = tokenBalance.token;
            const contractAddress = token.contract_address?.toLowerCase();
            
            // Check if this is the token we're looking for
            if (contractAddress === normalizedTokenAddress) {
              const balance = parseFloat(tokenBalance.balance?.in_token || 0);
              // Only log if balance > 0 to reduce noise
              if (balance > 0) {
                console.log(`✅ FID ${fid} holds ${(balance / 1_000_000).toFixed(2)}M ECION`);
              }
              return balance;
            }
          }
        }
      }
    }

    // No balance found - don't log (too verbose)
    return 0;
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
    // Check balances for both parties
    const [tipperBalance, engagerBalance] = await Promise.all([
      getTokenBalanceFromNeynar(tipperFid, ECION_TOKEN_ADDRESS),
      getTokenBalanceFromNeynar(engagerFid, ECION_TOKEN_ADDRESS)
    ]);

    // Calculate rewards
    const rewards = calculateTipRewards(tipperBalance, engagerBalance);

    // Only send rewards if at least one party holds 1M+ tokens
    if (rewards.totalReward > 0) {
      const tipperM = (tipperBalance / 1_000_000).toFixed(2);
      const engagerM = (engagerBalance / 1_000_000).toFixed(2);
      console.log(`🎁 ECION rewards: ${rewards.tipperReward} tokens each (Tipper: ${tipperM}M, Engager: ${engagerM}M)`);
      const result = await sendEcionRewards(
        tipperAddress,
        engagerAddress,
        rewards.tipperReward,
        rewards.engagerReward
      );
      
      if (result.success && !result.skipped) {
        console.log(`✅ ECION rewards sent: ${result.transferCount || 0} transfers`);
      } else if (result.error) {
        console.error(`⚠️ ECION reward error: ${result.error}`);
      }
      
      return {
        success: true,
        rewards: rewards,
        balances: { tipper: tipperBalance, engager: engagerBalance },
        ...result
      };
    }
    
    // No rewards - don't log (too verbose)
    return {
      success: true,
      rewards: rewards,
      balances: { tipper: tipperBalance, engager: engagerBalance },
      skipped: true,
      reason: 'Insufficient token holdings'
    };
  } catch (error) {
    console.error(`❌ ECION reward error:`, error.message);
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
