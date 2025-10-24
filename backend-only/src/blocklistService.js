const { ethers } = require('ethers');

// ERC20 ABI for allowance checking
const ERC20_ABI = [
  "function allowance(address owner, address spender) view returns (uint256)",
  "function decimals() view returns (uint8)"
];

class BlocklistService {
  constructor(provider, database) {
    this.provider = provider;
    this.database = database;
    this.blockedUsers = new Set();
    this.allowanceCache = new Map(); // Cache allowances to reduce API calls
    this.cacheTimeout = 30000; // 30 seconds cache
    this.ecionBatchContractAddress = process.env.ECION_BATCH_CONTRACT_ADDRESS || '0x0000000000000000000000000000000000000000';
    
    // Initialize on startup
    this.initialize();
  }

  async initialize() {
    try {
      await this.loadFromDatabase();
      console.log(`📋 BlocklistService initialized with ${this.blockedUsers.size} blocked users`);
    } catch (error) {
      console.error('❌ Failed to initialize BlocklistService:', error);
    }
  }

  // Check if user should be blocked based on current allowance AND balance
  async shouldBeBlocked(userAddress) {
    try {
      const userConfig = await this.database.getUserConfig(userAddress);
      if (!userConfig || !userConfig.isActive) {
        console.log(`🚫 User ${userAddress} should be blocked - no active config`);
        return true;
      }

      const minTipAmount = this.calculateMinTipAmount(userConfig);
      if (minTipAmount <= 0) {
        console.log(`🚫 User ${userAddress} should be blocked - no tip amounts configured`);
        return true;
      }

      // Check both allowance AND balance in one blockchain call
      const allowanceBalanceCheck = await this.checkAllowanceAndBalance(userAddress, userConfig.tokenAddress, minTipAmount);
      const shouldBlock = !allowanceBalanceCheck.canAfford;
      
      console.log(`🔍 Allowance/Balance check for ${userAddress}: Allowance=${allowanceBalanceCheck.allowanceAmount}, Balance=${allowanceBalanceCheck.balanceAmount}, MinTip=${minTipAmount}, ShouldBlock=${shouldBlock}`);
      return shouldBlock;
    } catch (error) {
      console.error(`❌ Error checking if user ${userAddress} should be blocked:`, error);
      return true; // Block on error for safety
    }
  }

  // Check both allowance and balance in one blockchain call
  async checkAllowanceAndBalance(userAddress, tokenAddress, requiredAmount) {
    try {
      console.log(`🔍 Checking allowance and balance for ${userAddress} - token: ${tokenAddress}, required: ${requiredAmount}`);
      
      const tokenContract = new ethers.Contract(tokenAddress, [
        "function allowance(address owner, address spender) view returns (uint256)",
        "function balanceOf(address owner) view returns (uint256)",
        "function decimals() view returns (uint8)"
      ], this.provider);
      
      // Get both allowance and balance in parallel
      const [allowance, balance, decimals] = await Promise.all([
        tokenContract.allowance(userAddress, this.ecionBatchContractAddress),
        tokenContract.balanceOf(userAddress),
        tokenContract.decimals()
      ]);
      
      const allowanceAmount = parseFloat(ethers.formatUnits(allowance, decimals));
      const balanceAmount = parseFloat(ethers.formatUnits(balance, decimals));
      
      const hasSufficientAllowance = allowanceAmount >= requiredAmount;
      const hasSufficientBalance = balanceAmount >= requiredAmount;
      const canAfford = hasSufficientAllowance && hasSufficientBalance;
      
      console.log(`💰 Allowance: ${allowanceAmount}, Balance: ${balanceAmount}, Required: ${requiredAmount}, CanAfford: ${canAfford}`);
      
      return {
        canAfford,
        allowanceAmount,
        balanceAmount,
        hasSufficientAllowance,
        hasSufficientBalance
      };
    } catch (error) {
      console.error(`❌ Error checking allowance and balance for ${userAddress}:`, error.message);
      return { 
        canAfford: false, 
        allowanceAmount: 0, 
        balanceAmount: 0,
        hasSufficientAllowance: false,
        hasSufficientBalance: false
      };
    }
  }

  // Get current allowance with caching
  async getCurrentAllowance(userAddress, tokenAddress) {
    const cacheKey = `${userAddress.toLowerCase()}-${tokenAddress.toLowerCase()}`;
    
    // Check cache first
    if (this.allowanceCache.has(cacheKey)) {
      const cached = this.allowanceCache.get(cacheKey);
      if (Date.now() - cached.timestamp < this.cacheTimeout) {
        console.log(`📦 Using cached allowance for ${userAddress}: ${cached.allowance}`);
        return cached.allowance;
      }
    }

    try {
      // Fetch from blockchain
      const tokenContract = new ethers.Contract(tokenAddress, ERC20_ABI, this.provider);
      const allowance = await tokenContract.allowance(userAddress, this.ecionBatchContractAddress);
      const decimals = await tokenContract.decimals();
      
      // Convert to human readable format
      const formattedAllowance = ethers.formatUnits(allowance, decimals);
      
      // Cache the result
      this.allowanceCache.set(cacheKey, {
        allowance: formattedAllowance,
        timestamp: Date.now()
      });

      console.log(`🔗 Fetched allowance for ${userAddress}: ${formattedAllowance} (${decimals} decimals)`);
      return formattedAllowance;
    } catch (error) {
      console.error(`❌ Error fetching allowance for ${userAddress}:`, error);
      return '0'; // Return 0 on error
    }
  }

  // Calculate minimum tip amount from user config
  calculateMinTipAmount(userConfig) {
    let minAmount = 0;
    
    if (userConfig.likeEnabled && userConfig.likeAmount && parseFloat(userConfig.likeAmount) > 0) {
      minAmount = Math.max(minAmount, parseFloat(userConfig.likeAmount));
    }
    if (userConfig.replyEnabled && userConfig.replyAmount && parseFloat(userConfig.replyAmount) > 0) {
      minAmount = Math.max(minAmount, parseFloat(userConfig.replyAmount));
    }
    if (userConfig.recastEnabled && userConfig.recastAmount && parseFloat(userConfig.recastAmount) > 0) {
      minAmount = Math.max(minAmount, parseFloat(userConfig.recastAmount));
    }
    if (userConfig.followEnabled && userConfig.followAmount && parseFloat(userConfig.followAmount) > 0) {
      minAmount = Math.max(minAmount, parseFloat(userConfig.followAmount));
    }
    
    console.log(`💰 Calculated min tip amount for user: ${minAmount}`);
    return minAmount;
  }

  // Update blocklist status for a user
  async updateUserBlocklistStatus(userAddress) {
    try {
      console.log(`🔄 Updating blocklist status for ${userAddress}`);
      
      const shouldBeBlocked = await this.shouldBeBlocked(userAddress);
      const isCurrentlyBlocked = this.blockedUsers.has(userAddress.toLowerCase());

      console.log(`📊 Status check: shouldBeBlocked=${shouldBeBlocked}, isCurrentlyBlocked=${isCurrentlyBlocked}`);

      if (shouldBeBlocked && !isCurrentlyBlocked) {
        // Add to blocklist
        await this.addToBlocklist(userAddress);
        console.log(`🚫 Added ${userAddress} to blocklist - insufficient funds`);
        return { action: 'added', reason: 'insufficient funds' };
      } else if (!shouldBeBlocked && isCurrentlyBlocked) {
        // Remove from blocklist
        await this.removeFromBlocklist(userAddress);
        console.log(`✅ Removed ${userAddress} from blocklist - sufficient funds`);
        return { action: 'removed', reason: 'sufficient funds' };
      } else {
        console.log(`ℹ️ No change needed for ${userAddress}`);
        return { action: 'no_change', reason: 'status unchanged' };
      }
    } catch (error) {
      console.error(`❌ Error updating blocklist status for ${userAddress}:`, error);
      return { action: 'error', reason: error.message };
    }
  }

  // Add to blocklist
  async addToBlocklist(userAddress, reason = 'insufficient_allowance') {
    const normalizedAddress = userAddress.toLowerCase();
    
    if (!this.blockedUsers.has(normalizedAddress)) {
      this.blockedUsers.add(normalizedAddress);
      await this.database.addToBlocklist(normalizedAddress);
      console.log(`📝 Added ${normalizedAddress} to blocklist - ${reason}`);
      
      // Also remove FID from webhook when adding to blocklist
      try {
        const userProfile = await this.database.pool.query(
          'SELECT fid FROM user_profiles WHERE user_address = $1',
          [normalizedAddress]
        );
        
        if (userProfile.rows.length > 0) {
          const fid = userProfile.rows[0].fid;
          console.log(`🔗 Removing FID ${fid} from webhook (user added to blocklist)`);
          
          // Remove FID from webhook directly
          await this.removeFidFromWebhook(fid);
          console.log(`✅ Removed FID ${fid} from webhook`);
        }
      } catch (error) {
        console.error(`❌ Error removing FID from webhook for ${normalizedAddress}:`, error);
      }
    } else {
      console.log(`ℹ️ User ${normalizedAddress} already in blocklist`);
    }
  }

  // Remove from blocklist
  async removeFromBlocklist(userAddress) {
    const normalizedAddress = userAddress.toLowerCase();
    
    if (this.blockedUsers.has(normalizedAddress)) {
      this.blockedUsers.delete(normalizedAddress);
      await this.database.removeFromBlocklist(normalizedAddress);
      console.log(`📝 Removed ${normalizedAddress} from blocklist`);
    } else {
      console.log(`ℹ️ User ${normalizedAddress} not in blocklist`);
    }
  }

  // Check if user is blocked
  isBlocked(userAddress) {
    const normalizedAddress = userAddress.toLowerCase();
    const isBlocked = this.blockedUsers.has(normalizedAddress);
    console.log(`🔍 Checking if ${normalizedAddress} is blocked: ${isBlocked}`);
    return isBlocked;
  }

  // Get all blocked users
  getBlockedUsers() {
    return Array.from(this.blockedUsers);
  }

  // Get blocklist size
  getBlocklistSize() {
    return this.blockedUsers.size;
  }

  // Load blocklist from database on startup
  async loadFromDatabase() {
    try {
      const dbBlocklist = await this.database.getBlocklist();
      this.blockedUsers = new Set(dbBlocklist.map(addr => addr.toLowerCase()));
      console.log(`📋 Loaded ${this.blockedUsers.size} users from database blocklist`);
    } catch (error) {
      console.error('❌ Error loading blocklist from database:', error);
      this.blockedUsers = new Set();
    }
  }

  // Clear allowance cache
  clearAllowanceCache() {
    this.allowanceCache.clear();
    console.log('🧹 Cleared allowance cache');
  }

  // Force refresh allowance for a user
  async refreshUserAllowance(userAddress, tokenAddress) {
    const cacheKey = `${userAddress.toLowerCase()}-${tokenAddress.toLowerCase()}`;
    this.allowanceCache.delete(cacheKey);
    return await this.getCurrentAllowance(userAddress, tokenAddress);
  }

  // Batch update multiple users
  async batchUpdateUsers(userAddresses) {
    const results = [];
    for (const userAddress of userAddresses) {
      const result = await this.updateUserBlocklistStatus(userAddress);
      results.push({ userAddress, ...result });
    }
    return results;
  }

  // Clear all blocklist entries
  clearBlocklist() {
    this.blockedUsers.clear();
    console.log('🧹 BlocklistService: Cleared all blocked users');
  }

  // Get blocklist size
  getBlocklistSize() {
    return this.blockedUsers.size;
  }

  // Remove FID from webhook
  async removeFidFromWebhook(fid) {
    try {
      const webhookId = await this.database.getWebhookId();
      if (!webhookId) {
        console.log('❌ No webhook ID found');
        return false;
      }
      
      const trackedFids = await this.database.getTrackedFids();
      if (!trackedFids.includes(fid)) {
        console.log(`✅ FID ${fid} not in webhook filter`);
        return true;
      }
      
      const updatedFids = trackedFids.filter(f => f !== fid);
      
      const webhookResponse = await fetch(`https://api.neynar.com/v2/farcaster/webhook`, {
        method: 'PUT',
        headers: {
          'x-api-key': process.env.NEYNAR_API_KEY,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          webhook_id: webhookId,
          name: "Ecion Farcaster Events Webhook",
          subscription: {
            "cast.created": { 
              author_fids: updatedFids,
              parent_author_fids: updatedFids
            },
            "reaction.created": { 
              target_fids: updatedFids
            },
            "follow.created": { 
              target_fids: updatedFids
            }
          }
        })
      });
      
      if (webhookResponse.ok) {
        await this.database.setTrackedFids(updatedFids);
        console.log(`✅ Removed FID ${fid} from webhook filter`);
        return true;
      } else {
        console.error('❌ Failed to remove FID from webhook:', await webhookResponse.text());
        return false;
      }
    } catch (error) {
      console.error('❌ Error removing FID from webhook:', error);
      return false;
    }
  }
}

module.exports = BlocklistService;
