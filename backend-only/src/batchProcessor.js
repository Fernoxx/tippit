const { ethers } = require('ethers');
const database = require('./database');
const { getFollowerCount, checkAudienceCriteria } = require('./neynar');

class BatchProcessor {
  constructor() {
    this.provider = new ethers.JsonRpcProvider(process.env.BASE_RPC_URL);
    this.wallet = new ethers.Wallet(process.env.BACKEND_WALLET_PRIVATE_KEY, this.provider);
    this.batchIntervalMs = (process.env.BATCH_INTERVAL_MINUTES || 1) * 60 * 1000;
    this.maxBatchSize = parseInt(process.env.MAX_BATCH_SIZE) || 100;
    this.lastBatchTime = 0;
    
    // Start batch processing
    this.startBatchProcessing();
  }

  startBatchProcessing() {
    setInterval(async () => {
      await this.processBatch();
    }, this.batchIntervalMs);
    
    console.log(`🔄 Batch processor started - processing every ${this.batchIntervalMs / 1000}s`);
  }

  async processBatch() {
    const now = Date.now();
    const timeSinceLastBatch = now - this.lastBatchTime;
    
    const pendingTips = await database.getPendingTips();
    
    if (pendingTips.length === 0) {
      console.log('📭 No tips to process');
      return { processed: 0, failed: 0 };
    }

    // Process if we have enough tips OR enough time has passed
    if (pendingTips.length < 10 && timeSinceLastBatch < this.batchIntervalMs) {
      console.log(`⏳ Waiting... (${pendingTips.length} pending, ${Math.round((this.batchIntervalMs - timeSinceLastBatch) / 1000)}s remaining)`);
      return { processed: 0, failed: 0 };
    }

    const batch = pendingTips.splice(0, this.maxBatchSize);
    this.lastBatchTime = now;
    
    console.log(`🔄 Processing batch of ${batch.length} tips...`);

    let processed = 0;
    let failed = 0;

    try {
      // Validate and filter tips
      const validTips = await this.validateTips(batch);
      
      if (validTips.length === 0) {
        console.log('❌ No valid tips to process');
        await database.clearPendingTips();
        return { processed: 0, failed: batch.length };
      }

      console.log(`✅ Validated ${validTips.length}/${batch.length} tips`);

      // Process tips in batches by token
      const tipsByToken = this.groupTipsByToken(validTips);
      
      for (const [tokenAddress, tips] of Object.entries(tipsByToken)) {
        const result = await this.processTokenBatch(tokenAddress, tips);
        processed += result.processed;
        failed += result.failed;
      }

      // Clear processed tips
      await database.clearPendingTips();
      
      // Add remaining tips back to pending
      const remainingTips = batch.slice(validTips.length);
      for (const tip of remainingTips) {
        await database.addPendingTip(tip);
      }

    } catch (error) {
      console.error('❌ Batch processing failed:', error);
      failed = batch.length;
    }

    console.log(`📊 Batch complete: ${processed} processed, ${failed} failed`);
    return { processed, failed };
  }

  async validateTips(tips) {
    const validTips = [];
    
    for (const tip of tips) {
      try {
        // Get author config
        const authorConfig = await database.getUserConfig(tip.authorAddress);
        if (!authorConfig || !authorConfig.isActive) {
          console.log(`Author ${tip.authorAddress} has no active config`);
          continue;
        }

        // Check if action is enabled
        if (!this.isActionEnabled(authorConfig, tip.actionType)) {
          console.log(`Action ${tip.actionType} not enabled for ${tip.authorAddress}`);
          continue;
        }

        // Check follower count
        const followerCount = await getFollowerCount(tip.interactorFid);
        if (followerCount < authorConfig.minFollowerCount) {
          console.log(`Interactor ${tip.interactorFid} has ${followerCount} followers, required: ${authorConfig.minFollowerCount}`);
          continue;
        }

        // Check audience criteria
        const meetsAudience = await checkAudienceCriteria(tip.authorFid, tip.interactorFid, authorConfig.audience);
        if (!meetsAudience) {
          console.log(`Interactor ${tip.interactorFid} doesn't meet audience criteria`);
          continue;
        }

        // Get tip amount
        const amount = this.getTipAmount(authorConfig, tip.actionType);
        if (amount <= 0) {
          console.log(`No tip amount set for ${tip.actionType}`);
          continue;
        }

        // Check spending limit
        if (authorConfig.totalSpent + amount > authorConfig.spendingLimit) {
          console.log(`Spending limit reached for ${tip.authorAddress}`);
          continue;
        }

        // Check backend has enough tokens
        const backendBalance = await this.getBackendTokenBalance(authorConfig.tokenAddress);
        if (backendBalance < amount) {
          console.log(`Backend has insufficient ${authorConfig.tokenAddress} tokens`);
          continue;
        }

        validTips.push({
          ...tip,
          amount: amount.toString(),
          tokenAddress: authorConfig.tokenAddress
        });

      } catch (error) {
        console.error(`Error validating tip:`, error);
        continue;
      }
    }

    return validTips;
  }

  groupTipsByToken(tips) {
    const grouped = {};
    for (const tip of tips) {
      if (!grouped[tip.tokenAddress]) {
        grouped[tip.tokenAddress] = [];
      }
      grouped[tip.tokenAddress].push(tip);
    }
    return grouped;
  }

  async processTokenBatch(tokenAddress, tips) {
    let processed = 0;
    let failed = 0;

    try {
      // Get token contract
      const tokenContract = new ethers.Contract(tokenAddress, [
        "function transfer(address to, uint256 amount) returns (bool)"
      ], this.wallet);

      console.log(`💸 Processing ${tips.length} tips for token ${tokenAddress}`);

      // Send all transfers
      for (const tip of tips) {
        try {
          const tx = await tokenContract.transfer(tip.interactorAddress, tip.amount);
          await tx.wait();
          
          // Update user spending
          await this.updateUserSpending(tip.authorAddress, tip.amount);
          
          // Add to history
          await database.addTipHistory({
            fromAddress: tip.authorAddress,
            toAddress: tip.interactorAddress,
            tokenAddress: tip.tokenAddress,
            amount: tip.amount,
            actionType: tip.actionType,
            castHash: tip.castHash,
            transactionHash: tx.hash,
            timestamp: Date.now()
          });

          processed++;
          console.log(`✅ Tip sent: ${tip.amount} ${tokenAddress} to ${tip.interactorAddress}`);

        } catch (error) {
          console.error(`❌ Failed to send tip to ${tip.interactorAddress}:`, error.message);
          failed++;
        }
      }

    } catch (error) {
      console.error(`❌ Token batch processing failed for ${tokenAddress}:`, error);
      failed = tips.length;
    }

    return { processed, failed };
  }

  async updateUserSpending(userAddress, amount) {
    const config = await database.getUserConfig(userAddress);
    if (config) {
      config.totalSpent = (parseFloat(config.totalSpent) + parseFloat(amount)).toString();
      await database.setUserConfig(userAddress, config);
    }
  }

  async getBackendTokenBalance(tokenAddress) {
    try {
      const tokenContract = new ethers.Contract(tokenAddress, [
        "function balanceOf(address account) view returns (uint256)"
      ], this.provider);
      
      const balance = await tokenContract.balanceOf(this.wallet.address);
      return parseFloat(ethers.formatUnits(balance, 6)); // Assuming 6 decimals for USDC
    } catch (error) {
      console.error('Error getting backend balance:', error);
      return 0;
    }
  }

  isActionEnabled(config, actionType) {
    switch (actionType) {
      case 'like': return config.likeEnabled;
      case 'reply': return config.replyEnabled;
      case 'recast': return config.recastEnabled;
      case 'quote': return config.quoteEnabled;
      case 'follow': return config.followEnabled;
      default: return false;
    }
  }

  getTipAmount(config, actionType) {
    switch (actionType) {
      case 'like': return parseFloat(config.likeAmount);
      case 'reply': return parseFloat(config.replyAmount);
      case 'recast': return parseFloat(config.recastAmount);
      case 'quote': return parseFloat(config.quoteAmount);
      case 'follow': return parseFloat(config.followAmount);
      default: return 0;
    }
  }
}

module.exports = BatchProcessor;