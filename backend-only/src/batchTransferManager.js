const { ethers } = require('ethers');
const BatchTipManager = require('./batchTipManager');
const EcionBatchManager = require('./ecionBatchManager');
const { getProvider, executeWithFallback } = require('./rpcProvider');

// Token decimals mapping (to avoid circular dependency) - all lowercase keys
const TOKEN_DECIMALS = {
  '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913': 6, // USDC
  '0x4200000000000000000000000000000000000006': 18, // WETH
  '0x50c5725949a6f0c72e6c4a641f24049a917db0cb': 18, // DAI
  '0x940181a94a35a4569e4529a3cdfb74e38fd98631': 18, // AERO
};

function getTokenDecimals(tokenAddress) {
  return TOKEN_DECIMALS[tokenAddress.toLowerCase()] || 18; // Default to 18 decimals
}

// Use PostgreSQL database if available, fallback to file storage
let database;
try {
  if (process.env.DATABASE_URL) {
    database = require('./database-pg');
  } else {
    database = require('./database');
  }
} catch (error) {
  database = require('./database');
}

class BatchTransferManager {
  constructor() {
    // Initialize provider with fallback support (will be set async)
    this.provider = null;
    this.wallet = null;
    this.batchTipManager = null;
    this.ecionBatchManager = null;
    
    // Initialize provider asynchronously
    this.initializeProviders();
    
    // Batch configuration
    this.batchIntervalMs = 60000; // 1 minute batches like Noice
    this.maxBatchSize = 100; // Maximum tips per batch
    this.minBatchSize = 1; // Minimum tips to trigger batch
    
    // Pending tips queue
    this.pendingTips = [];
    
    this.isProcessing = false;
  }
  
  async initializeProviders() {
    try {
      // Get provider with fallback support
      this.provider = await getProvider();
      
      if (process.env.NODE_ENV === 'debug') {
        this.wallet = null;
      } else {
        this.wallet = new ethers.Wallet(process.env.BACKEND_WALLET_PRIVATE_KEY, this.provider);
      }
      
      // Initialize batch managers with provider
      this.batchTipManager = new BatchTipManager(this.provider, this.wallet);
      this.ecionBatchManager = new EcionBatchManager(this.provider, this.wallet);
      
      // Start batch processing timer after providers are ready
      this.startBatchTimer();
      
      console.log('✅ BatchTransferManager providers initialized');
    } catch (error) {
      console.error('❌ Failed to initialize providers:', error);
      // Retry after 5 seconds
      setTimeout(() => this.initializeProviders(), 5000);
    }
  }

  // Start the batch processing timer
  startBatchTimer() {
    console.log(`⏰ Starting batch timer - will process every 60 seconds`);
    // Process batch every 60 seconds exactly
    setInterval(async () => {
      const timestamp = new Date().toISOString();
      console.log(`⏰ [${timestamp}] Batch timer triggered - pendingTips: ${this.pendingTips.length}`);
      if (this.pendingTips.length > 0) {
        console.log(`⏰ Batch timer triggered - processing ${this.pendingTips.length} pending tips`);
        await this.processBatch();
      } else {
        console.log(`⏰ Batch timer triggered - no pending tips to process`);
      }
    }, 60000); // Exactly 60 seconds = 60000ms
    
    console.log(`⏰ Batch timer started - processing every 60 seconds exactly`);
  }

  // NEW: Check allowance from database (NO API CALLS)
  async checkDatabaseAllowance(userAddress, authorConfig) {
    try {
      const userConfig = await database.getUserConfig(userAddress);
      if (!userConfig) {
        return { canAfford: false, allowanceAmount: 0, minTipAmount: 0 };
      }
      
      // Get REAL blockchain allowance (most accurate) with fallback provider
      const { ethers } = require('ethers');
      const provider = await getProvider(); // Use provider with fallback
      const ecionBatchAddress = process.env.ECION_BATCH_CONTRACT_ADDRESS || '0x2f47bcc17665663d1b63e8d882faa0a366907bb8';
      
      // Force USDC token address for now to fix decimal issue
      const tokenAddress = userConfig.tokenAddress || '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
      const tokenContract = new ethers.Contract(tokenAddress, [
        "function allowance(address owner, address spender) view returns (uint256)"
      ], provider);
      
      const allowance = await tokenContract.allowance(userAddress, ecionBatchAddress);
      const tokenDecimals = getTokenDecimals(tokenAddress);
      const allowanceAmount = parseFloat(ethers.formatUnits(allowance, tokenDecimals));
      
      // Calculate total tip amount (like + recast + reply)
      const likeAmount = parseFloat(authorConfig.likeAmount || '0');
      const recastAmount = parseFloat(authorConfig.recastAmount || '0');
      const replyAmount = parseFloat(authorConfig.replyAmount || '0');
      const minTipAmount = likeAmount + recastAmount + replyAmount;
      
      console.log(`💾 Database allowance check: ${userAddress} - allowance: ${allowanceAmount}, total tip: ${minTipAmount} (like: ${likeAmount}, recast: ${recastAmount}, reply: ${replyAmount})`);
      
      return {
        canAfford: allowanceAmount >= minTipAmount,
        allowanceAmount,
        minTipAmount
      };
    } catch (error) {
      console.error('❌ Error checking database allowance:', error);
      return { canAfford: false, allowanceAmount: 0, minTipAmount: 0 };
    }
  }

  // NEW: Check allowance directly from blockchain (most accurate)
  async checkBlockchainAllowance(userAddress, authorConfig) {
    try {
      const userConfig = await database.getUserConfig(userAddress);
      if (!userConfig) {
        return { canAfford: false, allowanceAmount: 0, minTipAmount: 0 };
      }
      
      // Get allowance directly from blockchain
      const { ethers } = require('ethers');
      const provider = await getProvider(); // Use provider with fallback
      const ecionBatchAddress = process.env.ECION_BATCH_CONTRACT_ADDRESS || '0x2f47bcc17665663d1b63e8d882faa0a366907bb8';
      
      // Force USDC token address for now to fix decimal issue
      const tokenAddress = userConfig.tokenAddress || '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
      const tokenContract = new ethers.Contract(tokenAddress, [
        "function allowance(address owner, address spender) view returns (uint256)"
      ], provider);
      
      const allowance = await tokenContract.allowance(userAddress, ecionBatchAddress);
      const tokenDecimals = getTokenDecimals(tokenAddress);
      
      console.log(`🔍 DEBUG checkBlockchainAllowance for ${userAddress}:`);
      console.log(`  - Token address: ${tokenAddress}`);
      console.log(`  - Token address (lowercase): ${tokenAddress.toLowerCase()}`);
      console.log(`  - Raw allowance: ${allowance.toString()}`);
      console.log(`  - Token decimals: ${tokenDecimals}`);
      console.log(`  - TOKEN_DECIMALS map:`, TOKEN_DECIMALS);
      console.log(`  - TOKEN_DECIMALS lookup result:`, TOKEN_DECIMALS[tokenAddress.toLowerCase()]);
      
      // Manual calculation to debug
      const rawAllowance = allowance.toString();
      const divisor = Math.pow(10, tokenDecimals);
      const manualCalculation = parseFloat(rawAllowance) / divisor;
      
      console.log(`  - Manual calculation: ${rawAllowance} / ${divisor} = ${manualCalculation}`);
      
      // Use ethers.formatUnits like the working frontend code
      const allowanceAmount = parseFloat(ethers.formatUnits(allowance, tokenDecimals));
      console.log(`  - ethers.formatUnits result: ${ethers.formatUnits(allowance, tokenDecimals)}`);
      console.log(`  - Final parsed allowance (manual): ${allowanceAmount}`);
      
      // Calculate total tip amount (like + recast + reply)
      const likeAmount = parseFloat(authorConfig.likeAmount || '0');
      const recastAmount = parseFloat(authorConfig.recastAmount || '0');
      const replyAmount = parseFloat(authorConfig.replyAmount || '0');
      const minTipAmount = likeAmount + recastAmount + replyAmount;
      
      console.log(`💰 Blockchain allowance check: ${userAddress} - allowance: ${allowanceAmount}, total tip: ${minTipAmount} (like: ${likeAmount}, recast: ${recastAmount}, reply: ${replyAmount})`);
      
      return {
        canAfford: allowanceAmount >= minTipAmount,
        allowanceAmount: allowanceAmount,
        minTipAmount: minTipAmount
      };
    } catch (error) {
      console.error(`❌ Error checking blockchain allowance for ${userAddress}:`, error);
      return { canAfford: false, allowanceAmount: 0, minTipAmount: 0 };
    }
  }


  // NEW: Check both allowance and balance in one blockchain call
  async checkAllowanceAndBalance(userAddress, tokenAddress, requiredAmount) {
    try {
      console.log(`🔍 Checking allowance and balance for ${userAddress} - token: ${tokenAddress}, required: ${requiredAmount}`);
      
      const { ethers } = require('ethers');
      const provider = await getProvider(); // Use provider with fallback
      const ecionBatchAddress = process.env.ECION_BATCH_CONTRACT_ADDRESS || '0x2f47bcc17665663d1b63e8d882faa0a366907bb8';
      
      const tokenContract = new ethers.Contract(tokenAddress, [
        "function allowance(address owner, address spender) view returns (uint256)",
        "function balanceOf(address owner) view returns (uint256)"
      ], provider);
      
      // Get both allowance and balance in parallel
      const [allowance, balance] = await Promise.all([
        tokenContract.allowance(userAddress, ecionBatchAddress),
        tokenContract.balanceOf(userAddress)
      ]);
      
      const tokenDecimals = getTokenDecimals(tokenAddress);
      const allowanceAmount = parseFloat(ethers.formatUnits(allowance, tokenDecimals));
      const balanceAmount = parseFloat(ethers.formatUnits(balance, tokenDecimals));
      
      const hasSufficientAllowance = allowanceAmount >= requiredAmount;
      const hasSufficientBalance = balanceAmount >= requiredAmount;
      const canAfford = hasSufficientAllowance && hasSufficientBalance;
      
      console.log(`💰 Allowance & Balance check: ${userAddress}`);
      console.log(`  - Allowance: ${allowanceAmount} (required: ${requiredAmount}) - ${hasSufficientAllowance ? '✅' : '❌'}`);
      console.log(`  - Balance: ${balanceAmount} (required: ${requiredAmount}) - ${hasSufficientBalance ? '✅' : '❌'}`);
      console.log(`  - Can afford: ${canAfford ? '✅' : '❌'}`);
      
      return {
        canAfford,
        allowanceAmount,
        balanceAmount,
        requiredAmount,
        hasSufficientAllowance,
        hasSufficientBalance
      };
    } catch (error) {
      console.error(`❌ Error checking allowance and balance for ${userAddress}:`, error.message);
      return { 
        canAfford: false, 
        allowanceAmount: 0, 
        balanceAmount: 0, 
        requiredAmount,
        hasSufficientAllowance: false,
        hasSufficientBalance: false
      };
    }
  }

  async validateTip(interaction, authorConfig) {
    try {
      // Check if interactor has a verified address
      if (!interaction.interactorAddress) {
        return { valid: false, reason: 'Interactor has no verified address' };
      }

      // Check if author has config
      if (!authorConfig) {
        return { valid: false, reason: 'No tipping configuration' };
      }
      
      // If user is in webhook (follow.created), they're active - allow tips
      // isActive might be false for new users, but being in webhook means they're active
      // Use interaction.authorFid directly (from webhook event) instead of looking it up
      const trackedFids = await database.getTrackedFids();
      const authorFid = interaction.authorFid; // Already available from webhook parsing
      const isInWebhook = authorFid ? trackedFids.includes(authorFid) : false;
      
      if (!isInWebhook) {
        console.log(`❌ Author FID ${authorFid} (address: ${interaction.authorAddress}) is not in trackedFids. Tracked FIDs: ${trackedFids.slice(0, 10).join(', ')}${trackedFids.length > 10 ? '...' : ''}`);
        return { valid: false, reason: 'Author is not an active user (not in webhook)' };
      }
      
      // Auto-set isActive if user is in webhook but isActive is false
      if (!authorConfig.isActive && isInWebhook) {
        console.log(`⚠️ Author ${interaction.authorAddress} is in webhook but isActive=false - setting to true`);
        authorConfig.isActive = true;
        await database.setUserConfig(interaction.authorAddress, authorConfig);
      }

      // Get user data for validation
      const userData = await this.getUserData(interaction.interactorFid);
      if (!userData) {
        return { valid: false, reason: 'Could not fetch user data' };
      }

      // Check follower count with detailed logging
      const interactorFollowerCount = Number(userData.followerCount) || 0;
      const requiredFollowerCount = Number(authorConfig.minFollowerCount) || 0;
      
      console.log(`🔍 FOLLOWER COUNT VALIDATION:`, {
        interactorFid: interaction.interactorFid,
        interactorFollowerCount: interactorFollowerCount,
        requiredFollowerCount: requiredFollowerCount,
        comparison: `${interactorFollowerCount} < ${requiredFollowerCount}`,
        passes: interactorFollowerCount >= requiredFollowerCount
      });
      
      if (interactorFollowerCount < requiredFollowerCount) {
        console.log(`❌ FOLLOWER COUNT CHECK FAILED: Interactor ${interaction.interactorFid} has ${interactorFollowerCount} followers (required: ${requiredFollowerCount})`);
        return { valid: false, reason: 'Insufficient follower count' };
      }
      
      console.log(`✅ FOLLOWER COUNT CHECK PASSED: Interactor ${interaction.interactorFid} has ${interactorFollowerCount} followers (required: ${requiredFollowerCount})`);

      // Check Neynar score
      if (userData.neynarScore < authorConfig.minNeynarScore) {
        return { valid: false, reason: 'Insufficient Neynar score' };
      }

      // Check spam label requirement (Level 2 check)
      if (interaction.interactorFid && authorConfig.minSpamLabel !== undefined && authorConfig.minSpamLabel > 0) {
        const { meetsSpamLabelRequirement } = require('./spamLabelChecker');
        const meetsRequirement = await meetsSpamLabelRequirement(interaction.interactorFid, authorConfig.minSpamLabel);
        
        if (!meetsRequirement) {
          return { valid: false, reason: `Interactor does not meet spam label requirement (minimum Level ${authorConfig.minSpamLabel})` };
        }
      }

      // Check audience criteria (skip for follow events)
      if (interaction.interactionType !== 'follow') {
        const meetsAudience = await this.checkAudienceCriteria(interaction.authorFid, interaction.interactorFid, authorConfig.audience);
        if (!meetsAudience) {
          const audienceText = authorConfig.audience === 0 ? 'Following' : authorConfig.audience === 1 ? 'Followers' : 'Anyone';
          return { valid: false, reason: `Not in ${audienceText} list` };
        }
      }

      // Get tip amount
      const amount = this.getTipAmount(authorConfig, interaction.interactionType);
      if (amount <= 0) {
        return { valid: false, reason: 'No tip amount set' };
      }

      // Check if user has already been tipped for this cast and action type
      const hasBeenTipped = await database.hasUserBeenTippedForCast(
        interaction.authorAddress, 
        interaction.interactorAddress, 
        interaction.castHash, 
        interaction.interactionType
      );
      
      if (hasBeenTipped) {
        return { valid: false, reason: 'Already tipped for this cast' };
      }

      // Check spending limit
      if (authorConfig.totalSpent + amount > authorConfig.spendingLimit) {
        return { valid: false, reason: 'Spending limit reached' };
      }

      // Check user allowance AND balance in one blockchain call
      const allowanceBalanceCheck = await this.checkAllowanceAndBalance(interaction.authorAddress, authorConfig.tokenAddress, amount);
      if (!allowanceBalanceCheck.canAfford) {
        let reason = 'Insufficient funds';
        if (!allowanceBalanceCheck.hasSufficientAllowance) {
          reason = 'Insufficient allowance';
        } else if (!allowanceBalanceCheck.hasSufficientBalance) {
          reason = 'Insufficient balance';
        }
        return { valid: false, reason: reason };
      }

      return { valid: true, amount: amount };

    } catch (error) {
      console.error('Tip validation error:', error);
      return { valid: false, reason: error.message };
    }
  }

  async processBatch() {
    console.log(`🔄 processBatch() called - isProcessing: ${this.isProcessing}, pendingTips: ${this.pendingTips.length}`);
    
    if (this.isProcessing || this.pendingTips.length === 0) {
      console.log(`⏭️ Batch processing skipped: isProcessing=${this.isProcessing}, pendingTips=${this.pendingTips.length}`);
      return;
    }
    
    // Ensure provider is initialized
    if (!this.provider || !this.ecionBatchManager) {
      console.log(`⏳ Waiting for provider initialization...`);
      console.log(`🔍 Provider status: ${this.provider ? 'exists' : 'null'}, EcionBatchManager: ${this.ecionBatchManager ? 'exists' : 'null'}`);
      await this.initializeProviders();
      // Wait a bit for provider to be ready
      let retries = 0;
      while ((!this.provider || !this.ecionBatchManager) && retries < 10) {
        await new Promise(resolve => setTimeout(resolve, 500));
        retries++;
      }
      if (!this.provider || !this.ecionBatchManager) {
        console.log(`❌ Provider not initialized - skipping batch`);
        console.log(`🔍 Final check - Provider: ${this.provider ? 'exists' : 'null'}, EcionBatchManager: ${this.ecionBatchManager ? 'exists' : 'null'}`);
        return;
      }
    }

    this.isProcessing = true;
    console.log(`🔄 Processing batch of ${this.pendingTips.length} tips in ONE transaction...`);
    console.log(`📋 Tips in batch:`, this.pendingTips.map(tip => ({
      from: tip.interaction.authorAddress,
      to: tip.interaction.interactorAddress,
      amount: tip.amount,
      type: tip.interaction.interactionType,
      timestamp: new Date(tip.timestamp).toISOString()
    })));
    console.log(`🔍 Wallet status before executeBatchTransfer: ${this.wallet ? `Initialized (${this.wallet.address})` : 'NOT INITIALIZED'}`);

    try {
      // Store tips before processing for webhook status update
      const tipsToProcess = [...this.pendingTips];
      
      // Process ALL tips in ONE transaction (even with different tokens)
      // Add retry logic for transient RPC errors (503, network issues)
      let retryCount = 0;
      const maxRetries = 3;
      let result = null;
      
      while (retryCount < maxRetries) {
        try {
          result = await this.executeBatchTransfer(tipsToProcess);
          
          // Clear processed tips only on success
          this.pendingTips = [];
          
          console.log(`✅ Batch processing complete: ${result.processed} processed, ${result.failed} failed`);
          break; // Success, exit retry loop
          
        } catch (error) {
          retryCount++;
          const isTransientError = error.message.includes('503') || 
                                   error.message.includes('Service Unavailable') ||
                                   error.message?.includes('network') ||
                                   error.message.includes('SERVER_ERROR');
          
          if (isTransientError && retryCount < maxRetries) {
            console.log(`⚠️ Transient RPC error on attempt ${retryCount}/${maxRetries}: ${error.message}`);
            console.log(`⏳ Waiting ${retryCount * 2} seconds before retry...`);
            await new Promise(resolve => setTimeout(resolve, 2000 * retryCount));
            // Tips remain in queue for retry
          } else {
            // Non-transient error or max retries reached
            console.error(`❌ Batch processing error after ${retryCount} attempts:`, error);
            // Keep tips in queue for next batch cycle (don't clear pendingTips)
            throw error;
          }
        }
      }
      
      // Webhook status updates are handled automatically when users approve/revoke allowances

    } catch (error) {
      console.error('❌ Batch processing error (tips remain in queue for next cycle):', error);
      // Don't clear pendingTips - they'll be retried in the next batch cycle
    } finally {
      this.isProcessing = false;
    }
  }


  /**
   * Check backend wallet allowance and balance in one call
   * @param {bigint} requiredAmount - Required amount in wei
   * @returns {Promise<{allowance: bigint, balance: bigint, needsApproval: boolean}>}
   */
  async checkBackendWalletAllowanceAndBalance(requiredAmount) {
    try {
      if (!this.wallet || !this.provider) {
        throw new Error('Wallet or provider not initialized');
      }

      const ecionRewardSystem = require('./ecionRewardSystem');
      const ECION_TOKEN_ADDRESS = ecionRewardSystem.ECION_TOKEN_ADDRESS;
      const ecionBatchAddress = process.env.ECION_BATCH_CONTRACT_ADDRESS || '0x2f47bcc17665663d1b63e8d882faa0a366907bb8';
      
      // Create token contract instance
      const tokenContract = new ethers.Contract(
        ECION_TOKEN_ADDRESS,
        [
          "function allowance(address owner, address spender) view returns (uint256)",
          "function balanceOf(address owner) view returns (uint256)"
        ],
        this.provider
      );

      // Check both allowance and balance in parallel
      const [allowance, balance] = await Promise.all([
        tokenContract.allowance(this.wallet.address, ecionBatchAddress),
        tokenContract.balanceOf(this.wallet.address)
      ]);

      const needsApproval = allowance < requiredAmount;

      return {
        allowance,
        balance,
        needsApproval
      };
    } catch (error) {
      console.error(`❌ Error checking backend wallet allowance/balance:`, error.message);
      throw error;
    }
  }

  /**
   * Ensure backend wallet has approved EcionBatch contract to spend ECION tokens
   * Approves 10M tokens when allowance gets low
   * @param {bigint} requiredAmount - Required amount in wei for current batch
   * @returns {Promise<boolean>} - true if approved (or approval succeeded)
   */
  async ensureBackendWalletApproval(requiredAmount = 0n) {
    try {
      if (!this.wallet || !this.provider) {
        console.error('❌ Cannot ensure approval: wallet or provider not initialized');
        return false;
      }

      const ecionRewardSystem = require('./ecionRewardSystem');
      const ECION_TOKEN_ADDRESS = ecionRewardSystem.ECION_TOKEN_ADDRESS;
      const ecionBatchAddress = process.env.ECION_BATCH_CONTRACT_ADDRESS || '0x2f47bcc17665663d1b63e8d882faa0a366907bb8';
      
      console.log(`🔍 Checking ECION token approval:`);
      console.log(`  - Backend wallet: ${this.wallet.address}`);
      console.log(`  - ECION token: ${ECION_TOKEN_ADDRESS}`);
      console.log(`  - EcionBatch contract: ${ecionBatchAddress}`);
      console.log(`  - Required amount: ${ethers.formatEther(requiredAmount)} tokens`);
      
      // Check allowance and balance together
      const { allowance, balance, needsApproval } = await this.checkBackendWalletAllowanceAndBalance(requiredAmount);
      
      console.log(`💰 Backend wallet ECION balance: ${ethers.formatEther(balance)} tokens`);
      console.log(`📊 Current allowance: ${ethers.formatEther(allowance)} tokens`);
      
      if (balance === 0n) {
        console.error(`❌ Backend wallet has 0 ECION tokens - cannot send rewards`);
        return false;
      }

      // If allowance is sufficient, we're good
      if (!needsApproval) {
        console.log(`✅ Backend wallet has sufficient allowance (${ethers.formatEther(allowance)} tokens)`);
        return true;
      }

      // Approve 10M tokens (10,000,000 tokens with 18 decimals)
      const APPROVAL_AMOUNT = ethers.parseEther('10000000'); // 10M tokens
      console.log(`🔐 Backend wallet needs approval - approving 10M ECION tokens to EcionBatch contract...`);
      console.log(`   Approval amount: ${ethers.formatEther(APPROVAL_AMOUNT)} tokens`);
      
      // Create token contract instance with wallet for signing
      const tokenContract = new ethers.Contract(
        ECION_TOKEN_ADDRESS,
        [
          "function approve(address spender, uint256 amount) returns (bool)"
        ],
        this.wallet
      );
      
      const approveTx = await tokenContract.approve(ecionBatchAddress, APPROVAL_AMOUNT);
      console.log(`⏳ Approval transaction submitted: ${approveTx.hash}`);
      console.log(`   View on BaseScan: https://basescan.org/tx/${approveTx.hash}`);
      
      // Wait for confirmation
      const receipt = await approveTx.wait();
      console.log(`✅ Backend wallet approved 10M ECION tokens to EcionBatch contract`);
      console.log(`   Transaction confirmed: ${approveTx.hash} (gas used: ${receipt.gasUsed.toString()})`);
      
      // Verify approval (use provider-based contract for read-only call)
      const readTokenContract = new ethers.Contract(
        ECION_TOKEN_ADDRESS,
        [
          "function allowance(address owner, address spender) view returns (uint256)"
        ],
        this.provider
      );
      const newAllowance = await readTokenContract.allowance(this.wallet.address, ecionBatchAddress);
      console.log(`✅ Verified new allowance: ${ethers.formatEther(newAllowance)} tokens`);
      
      return true;
    } catch (error) {
      console.error(`❌ Error ensuring backend wallet approval:`, error.message);
      console.error(`❌ Error stack:`, error.stack);
      return false;
    }
  }

  async executeBatchTransfer(tips) {
    let processed = 0;
    let failed = 0;

    try {
      console.log(`🎯 EXECUTING ${tips.length} TIPS USING ONLY ECIONBATCH CONTRACT: 0x2f47bcc17665663d1b63e8d882faa0a366907bb8`);
      console.log(`🔍 Wallet status: ${this.wallet ? `Initialized (${this.wallet.address})` : 'NOT INITIALIZED'}`);
      
      // Prepare tip transfer data for EcionBatch
      const tipTransfers = tips.map(tip => ({
        tokenAddress: tip.tokenAddress,
        from: tip.interaction.authorAddress,
        to: tip.interaction.interactorAddress,
        amount: tip.amount
      }));
      console.log(`📝 Prepared ${tipTransfers.length} tip transfers for batch`);

      // Process ECION rewards BEFORE batch execution to get transfer data
      const ecionRewardSystem = require('./ecionRewardSystem');
      const rewardTransfers = [];
      const rewardResults = new Map(); // Map tip index to reward result
      
      if (this.wallet) {
        console.log(`🎁 Starting ECION reward processing for ${tips.length} tips...`);
        for (let i = 0; i < tips.length; i++) {
          const tip = tips[i];
          console.log(`🎁 Processing ECION rewards for tip ${i + 1}/${tips.length}: Tipper FID ${tip.interaction.authorFid} → Engager FID ${tip.interaction.interactorFid}`);
          
          try {
            const rewardResult = await ecionRewardSystem.processTipRewards(
              this.wallet.address,
              tip.interaction.authorFid,
              tip.interaction.interactorFid,
              tip.interaction.authorAddress,
              tip.interaction.interactorAddress
            );
            
            rewardResults.set(i, rewardResult);
            
            if (rewardResult.success && rewardResult.transfers && rewardResult.transfers.length > 0) {
              rewardTransfers.push(...rewardResult.transfers);
              console.log(`✅ Prepared ${rewardResult.transfers.length} ECION reward transfers for batch inclusion`);
            } else if (rewardResult.skipped) {
              console.log(`ℹ️ ECION rewards skipped: ${rewardResult.reason || 'No rewards'}`);
            } else if (rewardResult.error) {
              console.error(`⚠️ ECION reward preparation failed: ${rewardResult.error}`);
            }
          } catch (rewardError) {
            console.error(`⚠️ ECION reward system error:`, rewardError.message);
            rewardResults.set(i, { success: false, error: rewardError.message });
          }
        }
        console.log(`🎁 ECION reward processing complete: ${rewardTransfers.length} reward transfers prepared`);
        
        // Calculate total reward amount needed
        const totalRewardAmount = rewardTransfers.reduce((sum, transfer) => sum + transfer.amount, 0n);
        
        // Ensure backend wallet has approved EcionBatch for ECION tokens (only if rewards needed)
        if (totalRewardAmount > 0n) {
          console.log(`🔐 Ensuring backend wallet approval for ECION tokens...`);
          console.log(`   Total reward amount needed: ${ethers.formatEther(totalRewardAmount)} tokens`);
          const approvalResult = await this.ensureBackendWalletApproval(totalRewardAmount);
          if (!approvalResult) {
            console.error(`❌ CRITICAL: Backend wallet approval failed - ECION rewards will fail!`);
            console.error(`❌ Continuing with batch but reward transfers will likely fail`);
          }
        } else {
          console.log(`ℹ️ No ECION rewards needed - skipping approval check`);
        }
      } else {
        console.log(`⚠️ Backend wallet not initialized - skipping ECION reward processing`);
        console.log(`⚠️ ECION rewards will fail without wallet initialization`);
      }

      // Combine tip transfers + reward transfers into one batch
      const allTransfers = [...tipTransfers, ...rewardTransfers];
      console.log(`📦 Combined batch: ${tipTransfers.length} tip transfers + ${rewardTransfers.length} reward transfers = ${allTransfers.length} total transfers`);
      console.log(`📋 Transfer breakdown:`);
      tipTransfers.forEach((transfer, i) => {
        console.log(`  Tip ${i + 1}: ${transfer.from} → ${transfer.to} (${transfer.amount} ${transfer.tokenAddress})`);
      });
      rewardTransfers.forEach((transfer, i) => {
        console.log(`  Reward ${i + 1}: ${transfer.from} → ${transfer.to} (${ethers.formatEther(transfer.amount)} ECION)`);
      });

      const tipData = this.ecionBatchManager.prepareTokenTips(allTransfers);
      const results = await this.ecionBatchManager.executeBatchTips(tipData);
      
      console.log(`✅ EcionBatch successful: ${results.successfulCount || results.results.length} transfers processed`);
      if (results.failedCount > 0) {
        console.log(`❌ EcionBatch had ${results.failedCount} failed transfers`);
        console.log(`📊 Results breakdown:`);
        console.log(`  - Total results: ${results.results.length}`);
        console.log(`  - Successful: ${results.successfulCount}`);
        console.log(`  - Failed: ${results.failedCount}`);
        console.log(`  - Tips (first ${tipTransfers.length}): ${results.results.slice(0, tipTransfers.length).filter(r => r.success).length} successful`);
        console.log(`  - Rewards (last ${rewardTransfers.length}): ${results.results.slice(tipTransfers.length).filter(r => r.success).length} successful`);
      }
      
      // Update database for successful tips only (not rewards - those are handled separately)
      const tipResults = results.results.slice(0, tipTransfers.length); // First N results are tips
      const rewardResultsFromBatch = results.results.slice(tipTransfers.length); // Remaining are rewards
      
      // Log reward transfer results
      if (rewardTransfers.length > 0) {
        console.log(`🎁 ECION reward transfer results from batch:`);
        rewardResultsFromBatch.forEach((result, i) => {
          const rewardTransfer = rewardTransfers[i];
          if (result.success) {
            console.log(`  ✅ Reward ${i + 1}: ${rewardTransfer.from} → ${rewardTransfer.to} (${ethers.formatEther(rewardTransfer.amount)} ECION) - SUCCESS`);
          } else {
            console.log(`  ❌ Reward ${i + 1}: ${rewardTransfer.from} → ${rewardTransfer.to} (${ethers.formatEther(rewardTransfer.amount)} ECION) - FAILED`);
          }
        });
      }
      for (let i = 0; i < tipResults.length; i++) {
        const result = tipResults[i];
        if (result.success) {
          const tip = tips[i];
          if (tip) {
            await this.updateUserSpending(tip.interaction.authorAddress, tip.amount);
            await database.addTipHistory({
              authorFid: tip.interaction.authorFid,
              interactorFid: tip.interaction.interactorFid,
              tokenSymbol: tip.tokenSymbol,
              fromAddress: tip.interaction.authorAddress,
              toAddress: tip.interaction.interactorAddress,
              tokenAddress: tip.tokenAddress,
              amount: tip.amount.toString(),
              actionType: tip.interaction.interactionType,
              castHash: tip.interaction.castHash,
              transactionHash: results.hash
            });
            
            // Log reward status for this tip
            const rewardResult = rewardResults.get(i);
            if (rewardResult) {
              if (rewardResult.success && rewardResult.transfers && rewardResult.transfers.length > 0) {
                console.log(`✅ ECION rewards included in batch for tip ${i + 1}: ${rewardResult.transferCount} transfers`);
              } else if (rewardResult.skipped) {
                console.log(`ℹ️ ECION rewards skipped for tip ${i + 1}: ${rewardResult.reason || 'No rewards'}`);
              } else if (rewardResult.error) {
                console.error(`⚠️ ECION reward preparation failed for tip ${i + 1}: ${rewardResult.error}`);
              }
            }
            
            // Update lastActivity and allowance for the user
            const userConfig = await database.getUserConfig(tip.interaction.authorAddress);
            if (userConfig) {
              userConfig.lastActivity = Date.now();
              
              // Get current blockchain allowance and update database with it (using fallback provider)
              const { ethers } = require('ethers');
              const provider = await getProvider(); // Use provider with fallback
              const ecionBatchAddress = process.env.ECION_BATCH_CONTRACT_ADDRESS || '0x2f47bcc17665663d1b63e8d882faa0a366907bb8';
              
              const tokenContract = new ethers.Contract(tip.tokenAddress, [
                "function allowance(address owner, address spender) view returns (uint256)"
              ], provider);
              
              const allowance = await tokenContract.allowance(tip.interaction.authorAddress, ecionBatchAddress);
              // Use correct decimals: USDC = 6, other tokens = 18
              const isUSDC = tip.tokenAddress.toLowerCase() === '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913';
              const tokenDecimals = isUSDC ? 6 : 18;
              const currentBlockchainAllowance = parseFloat(ethers.formatUnits(allowance, tokenDecimals));
              
              userConfig.lastAllowance = currentBlockchainAllowance.toFixed(isUSDC ? 6 : 18);
              userConfig.lastAllowanceCheck = Date.now();
              
              await database.setUserConfig(tip.interaction.authorAddress, userConfig);
              console.log(`💾 Updated allowance for ${tip.interaction.authorAddress}: ${parseFloat(userConfig.lastAllowance || 0)} → ${currentBlockchainAllowance} (from blockchain, ${tokenDecimals} decimals)`);
              
              // Check if user should be removed from webhook
              const likeAmount = parseFloat(userConfig.likeAmount || '0');
              const recastAmount = parseFloat(userConfig.recastAmount || '0');
              const replyAmount = parseFloat(userConfig.replyAmount || '0');
              const minTipAmount = likeAmount + recastAmount + replyAmount;
              
              // Check if user still has sufficient allowance + balance after tip
              const finalCheck = await this.checkAllowanceAndBalance(tip.interaction.authorAddress, tip.tokenAddress, minTipAmount);
              
              // Update homepage cache with new allowance after tip
              try {
                const { refreshActiveCastEntry, computeMinTipFromConfig } = require('./index');
                const userFid = tip.interaction.authorFid;
                if (userFid) {
                  await refreshActiveCastEntry({
                    fid: userFid,
                    userAddress: tip.interaction.authorAddress,
                    config: userConfig,
                    tokenAddress: tip.tokenAddress,
                    allowance: currentBlockchainAllowance,
                    balance: finalCheck.balanceAmount || currentBlockchainAllowance,
                    minTip: computeMinTipFromConfig(userConfig)
                  });
                  console.log(`✅ Updated homepage cache for ${tip.interaction.authorAddress} with new allowance: ${currentBlockchainAllowance}`);
                }
              } catch (cacheError) {
                console.log(`⚠️ Error updating homepage cache after tip: ${cacheError.message}`);
              }
              
              if (!finalCheck.canAfford) {
                let reason = 'Insufficient funds';
                if (!finalCheck.hasSufficientAllowance) {
                  reason = 'Insufficient allowance';
                } else if (!finalCheck.hasSufficientBalance) {
                  reason = 'Insufficient balance';
                }
                
                console.log(`🚫 User ${tip.interaction.authorAddress} ${reason} after tip - removing from webhook`);
                
                // Remove FID from webhook follow.created (active users) to prevent future tip processing
                // Use interaction.authorFid directly (already from webhook) - no need to look up from database
                const { removeFidFromWebhook, sendNeynarNotification } = require('./index');
                const userFid = tip.interaction.authorFid; // Already available from webhook event
                if (userFid) {
                  await removeFidFromWebhook(userFid, reason === 'Insufficient allowance' ? 'insufficient_allowance' : 'insufficient_funds');
                  console.log(`🚫 Removed FID ${userFid} from webhook follow.created - ${reason} after tip`);
                  
                  // Update isActive to false in user config
                  const userConfig = await database.getUserConfig(tip.interaction.authorAddress);
                  if (userConfig) {
                    userConfig.isActive = false;
                    await database.setUserConfig(tip.interaction.authorAddress, userConfig);
                    console.log(`✅ Set isActive=false for ${tip.interaction.authorAddress} (insufficient funds after tip)`);
                  }
                  
                  // Send notification if balance is insufficient (user needs to add tokens)
                  if (!finalCheck.hasSufficientBalance) {
                    try {
                      await sendNeynarNotification(
                        userFid,
                        "Insufficient Balance",
                        `Your token balance is too low to continue tipping. Please add more tokens to continue earning tips!`,
                        "https://ecion.vercel.app"
                      );
                      console.log(`📧 Sent low balance notification to FID ${userFid}`);
                    } catch (notifError) {
                      console.log(`⚠️ Error sending notification: ${notifError.message}`);
                    }
                  }
                }
                
                // Note: We cannot auto-revoke allowances without user's wallet access
                // User must manually revoke via frontend if they want to
                // We just remove them from active users (follow.created) so they stop receiving tips
              } else {
                // User has sufficient allowance AND balance - no action needed (should already be in webhook)
                console.log(`✅ User ${tip.interaction.authorAddress} still has sufficient funds after tip - no webhook action needed`);
              }
              
              // Send earned tip notification to recipient (skip to avoid unnecessary API calls)
              // Note: Notifications are handled by the frontend when users check their earnings
            }
            processed++;
          }
        } else {
          failed++;
        }
      }

    } catch (error) {
      console.error('❌ EcionBatch transfer failed:', error);
      failed = tips.length; // All tips failed if EcionBatch fails
    }

    console.log(`✅ Batch processing complete: ${processed} processed, ${failed} failed`);
    return { processed, failed };
  }

  async executeIndividualTransfers(tokenAddress, tips) {
    const tokenContract = new ethers.Contract(tokenAddress, [
      "function transferFrom(address from, address to, uint256 amount) returns (bool)"
    ], this.wallet);

    let processed = 0;
    let failed = 0;

    try {
      console.log(`🔄 Executing ${tips.length} individual transfers for token ${tokenAddress}...`);
      
      // Group tips by author address to handle nonce management
      const tipsByAuthor = {};
      for (const tip of tips) {
        const authorAddress = tip.interaction.authorAddress.toLowerCase();
        if (!tipsByAuthor[authorAddress]) {
          tipsByAuthor[authorAddress] = [];
        }
        tipsByAuthor[authorAddress].push(tip);
      }
      
        // Process each author's tips sequentially
        for (const [authorAddress, authorTips] of Object.entries(tipsByAuthor)) {
          console.log(`👤 Processing ${authorTips.length} tips for author ${authorAddress}`);

          for (let i = 0; i < authorTips.length; i++) {
            const tip = authorTips[i];
            try {
              console.log(`📤 Transfer ${i + 1}/${authorTips.length}: ${tip.amount} tokens to ${tip.interaction.interactorAddress}`);
              
              // Add a small delay to ensure nonce is fresh
              if (i > 0) {
                await this.delay(2000);
              }
              
              // Get fresh nonce right before the transaction
              const finalNonce = await this.provider.getTransactionCount(authorAddress, 'pending');
              console.log(`🔢 Using nonce ${finalNonce} for author ${authorAddress}`);
            
            // Final check before transfer - both allowance and balance
            const finalCheck = await this.checkAllowanceAndBalance(tip.interaction.authorAddress, tip.tokenAddress, tip.amount);
            if (!finalCheck.canAfford) {
              let reason = 'Insufficient funds';
              if (!finalCheck.hasSufficientAllowance) {
                reason = 'Insufficient allowance';
              } else if (!finalCheck.hasSufficientBalance) {
                reason = 'Insufficient balance';
              }
              console.log(`❌ Transfer failed - user ${tip.interaction.authorAddress} - ${reason}`);
              failed++;
              continue;
            }
            
            // Debug logging for amount calculation
            console.log(`📊 Amount breakdown for tip ${i + 1}:`);
            console.log(`  - Author: ${tip.interaction.authorAddress}`);
            console.log(`  - Raw amount: ${tip.amount}`);
            console.log(`  - After parseUnits(6): ${ethers.parseUnits(tip.amount.toString(), 6)}`);
            console.log(`  - Final check: Allowance: ${finalCheck.allowanceAmount}, Balance: ${finalCheck.balanceAmount}`);
            
            // Get dynamic gas price for Base network
            const gasPrice = await this.provider.getGasPrice();
            const increasedGasPrice = gasPrice * 110n / 100n; // 10% higher for reliability
            
            const tx = await tokenContract.transferFrom(
              tip.interaction.authorAddress,
              tip.interaction.interactorAddress,
              ethers.parseUnits(tip.amount.toString(), 6),
              { 
                gasLimit: 200000, // Increased gas limit for Base
                gasPrice: increasedGasPrice,
                nonce: finalNonce
              }
            );
            
            console.log(`✅ Transfer ${i + 1} submitted: ${tx.hash}`);
            
            // Check if transaction was actually submitted
            if (!tx.hash) {
              throw new Error(`Transfer ${i + 1} failed: no transaction hash returned`);
            }
            
            // Wait for confirmation with polling approach
            console.log(`⏳ Waiting for confirmation of ${tx.hash}...`);
            let confirmed = false;
            let attempts = 0;
            const maxAttempts = 15; // 15 attempts = 15 seconds
            
            while (!confirmed && attempts < maxAttempts) {
              try {
                const receipt = await this.provider.getTransactionReceipt(tx.hash);
                if (receipt) {
                  if (receipt.status === 1) {
                    console.log(`✅ Transfer ${i + 1} confirmed: ${tx.hash} (Gas: ${receipt.gasUsed.toString()})`);
                    confirmed = true;
                  } else if (receipt.status === 0) {
                    throw new Error(`Transfer ${i + 1} failed: transaction reverted`);
                  }
                } else {
                  // Transaction not mined yet, wait 1 second
                  console.log(`⏳ Transaction ${tx.hash} not mined yet, attempt ${attempts + 1}/${maxAttempts}...`);
                  await this.delay(1000);
                  attempts++;
                }
              } catch (error) {
                console.error(`❌ Error checking receipt:`, error.message);
                throw new Error(`Transfer ${i + 1} failed: ${error.message}`);
              }
            }
            
            if (!confirmed) {
              throw new Error(`Transfer ${i + 1} failed: confirmation timeout after ${maxAttempts} seconds`);
            }
            
            // Update database
            await this.updateUserSpending(tip.interaction.authorAddress, tip.amount);
            await database.addTipHistory({
              authorFid: tip.interaction.authorFid,
              interactorFid: tip.interaction.interactorFid,
              tokenSymbol: tip.tokenSymbol,
              fromAddress: tip.interaction.authorAddress,
              toAddress: tip.interaction.interactorAddress,
              tokenAddress: tip.tokenAddress,
              amount: tip.amount.toString(),
              actionType: tip.interaction.interactionType,
              castHash: tip.interaction.castHash,
              transactionHash: tx.hash,
              timestamp: Date.now()
            });
            
            processed++;
            
            // Small delay between transactions from same author to ensure proper sequencing
            if (i < authorTips.length - 1) {
              console.log(`⏳ Waiting 2 seconds before next transaction...`);
              await this.delay(2000); // 2 second delay
            }
            
          } catch (error) {
            console.error(`❌ Transfer ${i + 1} failed:`, error.message);
            failed++;
            
            // If it's a nonce error, wait a bit and retry
            if (error.code === 'NONCE_EXPIRED' || error.code === 'REPLACEMENT_UNDERPRICED') {
              console.log(`⏳ Nonce error, waiting 2 seconds before retry...`);
              await this.delay(2000);
            }
          }
        }
      }

    } catch (error) {
      console.error('❌ Individual transfers failed:', error);
      console.error('❌ Error details:', error.message);
      console.error('❌ Error code:', error.code);
      failed = tips.length;
    }

    return { processed, failed };
  }


  async getUserData(fid) {
    try {
      console.log(`🔍 Fetching user data for FID ${fid}...`);
      const response = await fetch(`https://api.neynar.com/v2/farcaster/user/bulk?fids=${fid}`, {
        headers: { 'x-api-key': process.env.NEYNAR_API_KEY }
      });
      
      if (!response.ok) {
        console.error(`❌ Failed to fetch user data for FID ${fid}: ${response.status}`);
        const errorText = await response.text();
        console.error(`❌ Error response:`, errorText);
        return null;
      }
      
      const data = await response.json();
      console.log(`📊 API response for FID ${fid}:`, JSON.stringify(data, null, 2));
      
      if (!data.users || !Array.isArray(data.users) || data.users.length === 0) {
        console.error(`❌ No users found in API response for FID ${fid}`);
        return null;
      }
      
      const user = data.users[0];
      if (!user) {
        console.error(`❌ User data is null/undefined for FID ${fid}`);
        return null;
      }
      
      // Ensure proper type conversion - handle both string and number
      const rawFollowerCount = user.follower_count;
      const followerCount = rawFollowerCount !== null && rawFollowerCount !== undefined 
        ? Number(rawFollowerCount) 
        : 0;
      
      const rawNeynarScore = user.score;
      const neynarScore = rawNeynarScore !== null && rawNeynarScore !== undefined 
        ? Number(rawNeynarScore) 
        : 0;
      
      console.log(`✅ User data for FID ${fid}:`, {
        followerCount: followerCount,
        rawFollowerCount: rawFollowerCount,
        followerCountType: typeof rawFollowerCount,
        neynarScore: neynarScore,
        username: user.username || 'N/A'
      });
      
      return {
        followerCount: followerCount,
        neynarScore: neynarScore
      };
    } catch (error) {
      console.error(`❌ Error fetching user data for FID ${fid}:`, error);
      return null;
    }
  }

  async checkAudienceCriteria(authorFid, interactorFid, audience) {
    try {
      if (audience === 2) {
        return true; // Anyone
      }
      
      const response = await fetch(`https://api.neynar.com/v2/farcaster/user/bulk?fids=${interactorFid}&viewer_fid=${authorFid}`, {
        headers: { 'x-api-key': process.env.NEYNAR_API_KEY }
      });
      
      if (!response.ok) {
        console.error(`Failed to fetch user relationship for FID ${interactorFid}: ${response.status}`);
        return false;
      }
      
      const data = await response.json();
      const user = data.users[0];
      
      if (audience === 0) {
        return user.viewer_context?.following || false; // Following
      } else if (audience === 1) {
        return user.viewer_context?.followed_by || false; // Followers
      }
      
      return false;
    } catch (error) {
      console.error(`Error checking audience criteria:`, error);
      return false;
    }
  }

  getTipAmount(config, actionType) {
    switch (actionType) {
      case 'like': return parseFloat(config.likeAmount);
      case 'reply': return parseFloat(config.replyAmount);
      case 'recast': return parseFloat(config.recastAmount);
      case 'follow': return parseFloat(config.followAmount);
      default: return 0;
    }
  }

  async getUserTokenAllowance(userAddress, tokenAddress) {
    try {
      // Use provider with fallback
      const provider = await getProvider();
      const tokenContract = new ethers.Contract(tokenAddress, [
        "function allowance(address owner, address spender) view returns (uint256)"
      ], provider);
      
      // Check allowance for ECION BATCH CONTRACT, not backend wallet!
      const ecionBatchAddress = process.env.ECION_BATCH_CONTRACT_ADDRESS || '0x2f47bcc17665663d1b63e8d882faa0a366907bb8';
      
      const allowance = await tokenContract.allowance(userAddress, ecionBatchAddress);
      const formattedAllowance = parseFloat(ethers.formatUnits(allowance, 6)); // USDC has 6 decimals
      
      // Also get balance for logging
      const balance = await tokenContract.balanceOf(userAddress);
      const formattedBalance = parseFloat(ethers.formatUnits(balance, 6));
      
      console.log(`💰 Allowance check: User ${userAddress} has ${formattedAllowance} approved and ${formattedBalance} balance for contract ${ecionBatchAddress}`);
      
      return formattedAllowance;
    } catch (error) {
      console.error('Error fetching token allowance:', error);
      return 0;
    }
  }

  async updateUserSpending(userAddress, amount) {
    const config = await database.getUserConfig(userAddress);
    if (config) {
      config.totalSpent = (parseFloat(config.totalSpent) + parseFloat(amount)).toString();
      await database.setUserConfig(userAddress, config);
    }
  }

  // Auto-revoke allowance to 0 when user has insufficient balance
  async autoRevokeAllowance(userAddress, tokenAddress) {
    try {
      console.log(`🔄 Auto-revoking allowance for ${userAddress} - token: ${tokenAddress}`);
      
      const { ethers } = require('ethers');
      const provider = await getProvider(); // Use provider with fallback
      const ecionBatchAddress = process.env.ECION_BATCH_CONTRACT_ADDRESS || '0x2f47bcc17665663d1b63e8d882faa0a366907bb8';
      
      const tokenContract = new ethers.Contract(tokenAddress, [
        "function approve(address spender, uint256 amount) returns (bool)"
      ], provider);
      
      // Revoke allowance by setting it to 0
      const tx = await tokenContract.approve(ecionBatchAddress, 0);
      console.log(`📝 Revoke transaction sent: ${tx.hash}`);
      
      // Wait for confirmation
      await tx.wait();
      console.log(`✅ Allowance revoked for ${userAddress}`);
      
      return true;
    } catch (error) {
      console.error(`❌ Error auto-revoking allowance for ${userAddress}:`, error);
      return false;
    }
  }

  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // Get batch status for debugging
  getBatchStatus() {
    return {
      pendingTips: this.pendingTips.length,
      isProcessing: this.isProcessing,
      batchIntervalMs: this.batchIntervalMs,
      maxBatchSize: this.maxBatchSize,
      nextBatchIn: this.isProcessing ? 'Processing...' : `${Math.max(0, this.batchIntervalMs - (Date.now() % this.batchIntervalMs))}ms`
    };
  }

  // Force process current batch (for testing)
  async forceProcessBatch() {
    if (this.pendingTips.length > 0) {
      console.log('🚀 Force processing batch...');
      await this.processBatch();
    } else {
      console.log('📭 No pending tips to process');
    }
  }

  // Update webhook status for users after tip processing
  async updateWebhookStatusForProcessedTips(tips) {
    try {
      console.log('🔄 Updating webhook status for processed tips...');
      
      // Get unique user addresses from processed tips
      const uniqueUsers = [...new Set(tips.map(tip => tip.interaction.authorAddress))];
      
      let processedCount = 0;
      let errorCount = 0;
      
      for (const userAddress of uniqueUsers) {
        try {
          // Validate address format
          if (!userAddress || !userAddress.startsWith('0x') || userAddress.length !== 42) {
            console.log(`⚠️ Invalid address format in webhook update: ${userAddress} - skipping`);
            continue;
          }
          
          // Webhook status updates are handled automatically when users approve/revoke allowances
          processedCount++;
          
        } catch (error) {
          console.error(`❌ Error updating webhook status for ${userAddress}:`, error);
          errorCount++;
        }
      }
      
      console.log(`✅ Webhook status update completed - processed: ${processedCount}, errors: ${errorCount}`);
    } catch (error) {
      console.error(`❌ Error updating webhook status:`, error);
    }
  }

  // Add tip to batch queue
  async addTipToBatch(interaction, authorConfig) {
    try {
      // Ensure provider is initialized
      if (!this.provider) {
        await this.initializeProviders();
        // Wait a bit for provider to be ready
        let retries = 0;
        while (!this.provider && retries < 5) {
          await new Promise(resolve => setTimeout(resolve, 500));
          retries++;
        }
        if (!this.provider) {
          console.log(`❌ Provider not initialized after retries`);
          return { success: false, reason: 'Provider not ready' };
        }
      }
      
      // Validate tip
      const validation = await this.validateTip(interaction, authorConfig);
      if (!validation.valid) {
        console.log(`❌ Tip validation failed: ${validation.reason}`);
        return { success: false, reason: validation.reason };
      }

      // Create tip object
      const tip = {
        interaction,
        authorConfig,
        tokenAddress: authorConfig.tokenAddress || '0x833589fCD6eDb6E08f4c7C32D4f71b54bDA02913',
        tokenSymbol: authorConfig.tokenSymbol || 'USDC',
        amount: this.calculateTipAmount(interaction, authorConfig),
        timestamp: Date.now()
      };

      // Add to pending tips
      this.pendingTips.push(tip);
      console.log(`📝 Tip added to batch queue. Queue size: ${this.pendingTips.length}`);

      // Process immediately if batch is full
      if (this.pendingTips.length >= this.maxBatchSize) {
        console.log(`🚀 Batch size reached (${this.maxBatchSize}), processing immediately`);
        await this.processBatch();
      } else {
        console.log(`⏳ Tip queued. Processing in ${this.batchIntervalMs / 1000} seconds or when batch is full`);
      }

      return { 
        success: true, 
        queued: true, 
        batchSize: this.pendingTips.length 
      };

    } catch (error) {
      console.error('❌ Error adding tip to batch:', error);
      return { success: false, reason: error.message };
    }
  }

  // Calculate tip amount based on interaction type
  calculateTipAmount(interaction, authorConfig) {
    const { interactionType } = interaction;
    
    switch (interactionType) {
      case 'like':
        return parseFloat(authorConfig.likeAmount || '0');
      case 'recast':
        return parseFloat(authorConfig.recastAmount || '0');
      case 'reply':
        return parseFloat(authorConfig.replyAmount || '0');
      case 'follow':
        return parseFloat(authorConfig.followAmount || '0');
      default:
        return 0;
    }
  }

  // Force process current batch immediately
  async forceProcessBatch() {
    if (this.pendingTips.length === 0) {
      console.log('⏭️ No pending tips to process');
      return { success: false, reason: 'No pending tips' };
    }

    console.log(`🚀 Force processing ${this.pendingTips.length} pending tips immediately`);
    await this.processBatch();
    return { success: true, processed: this.pendingTips.length };
  }

  // Get current batch status
  getBatchStatus() {
    return {
      pendingTips: this.pendingTips.length,
      isProcessing: this.isProcessing,
      batchIntervalMs: this.batchIntervalMs,
      maxBatchSize: this.maxBatchSize
    };
  }
}

module.exports = new BatchTransferManager();
