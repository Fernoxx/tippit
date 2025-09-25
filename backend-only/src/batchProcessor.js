const { ethers } = require('ethers');
const database = require('./database');
const { getFollowerCount, checkAudienceCriteria, getUserData } = require('./neynar');

class BatchProcessor {
  constructor() {
    this.provider = new ethers.JsonRpcProvider(process.env.BASE_RPC_URL);
    this.wallet = new ethers.Wallet(process.env.BACKEND_WALLET_PRIVATE_KEY, this.provider);
    this.batchIntervalMs = (process.env.BATCH_INTERVAL_MINUTES || 1) * 60 * 1000;
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

    const batch = pendingTips.splice(0); // Process ALL pending tips
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

        // Get user data (follower count + Neynar score in one API call)
        const userData = await getUserData(tip.interactorFid);
        
        // Check follower count - MUST meet minimum
        if (userData.followerCount < authorConfig.minFollowerCount) {
          console.log(`❌ FOLLOWER CHECK FAILED: Interactor ${tip.interactorFid} has ${userData.followerCount} followers, but caster requires ${authorConfig.minFollowerCount} followers minimum`);
          continue;
        }
        console.log(`✅ FOLLOWER CHECK PASSED: Interactor ${tip.interactorFid} has ${userData.followerCount} followers (required: ${authorConfig.minFollowerCount})`);

        // Check Neynar score - MUST meet minimum
        if (userData.neynarScore < authorConfig.minNeynarScore) {
          console.log(`❌ NEYNAR SCORE CHECK FAILED: Interactor ${tip.interactorFid} has Neynar score ${userData.neynarScore}, but caster requires ${authorConfig.minNeynarScore} minimum`);
          continue;
        }
        console.log(`✅ NEYNAR SCORE CHECK PASSED: Interactor ${tip.interactorFid} has Neynar score ${userData.neynarScore} (required: ${authorConfig.minNeynarScore})`);

        // Check audience criteria - MUST be in allowed audience
        const meetsAudience = await checkAudienceCriteria(tip.authorFid, tip.interactorFid, authorConfig.audience);
        if (!meetsAudience) {
          const audienceText = authorConfig.audience === 0 ? 'Following' : authorConfig.audience === 1 ? 'Followers' : 'Anyone';
          console.log(`❌ AUDIENCE CHECK FAILED: Interactor ${tip.interactorFid} is not in caster's ${audienceText} list`);
          continue;
        }
        const audienceText = authorConfig.audience === 0 ? 'Following' : authorConfig.audience === 1 ? 'Followers' : 'Anyone';
        console.log(`✅ AUDIENCE CHECK PASSED: Interactor ${tip.interactorFid} is in caster's ${audienceText} list`);

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

        // Check backend has enough tokens AND user allowance
        const backendBalance = await this.getBackendTokenBalance(authorConfig.tokenAddress);
        const userAllowance = await this.getUserTokenAllowance(tip.authorAddress, authorConfig.tokenAddress);
        
        if (backendBalance < amount) {
          console.log(`Backend has insufficient ${authorConfig.tokenAddress} tokens`);
          continue;
        }
        
        if (userAllowance < amount) {
          console.log(`User ${tip.authorAddress} has insufficient allowance: ${userAllowance} < ${amount}`);
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
      // Get token contract - USDC and most tokens support multiTransfer
      const tokenContract = new ethers.Contract(tokenAddress, [
        "function transfer(address to, uint256 amount) returns (bool)",
        "function multiTransfer(address[] calldata recipients, uint256[] calldata amounts) returns (bool)"
      ], this.wallet);

      console.log(`💸 Processing ${tips.length} tips for token ${tokenAddress} in ONE transaction (like Noice)`);

      // Prepare batch data exactly like Noice
      const recipients = tips.map(tip => tip.interactorAddress);
      const amounts = tips.map(tip => ethers.parseUnits(tip.amount, 6)); // USDC has 6 decimals

      try {
        // Use multiTransfer function (like Noice uses)
        const tx = await tokenContract.multiTransfer(recipients, amounts, {
          gasLimit: 3800000 // Same gas limit as Noice
        });
        
        console.log(`⏳ Transaction submitted: ${tx.hash}`);
        const receipt = await tx.wait();
        
        console.log(`✅ Batch transfer successful: ${tips.length} tips in 1 transaction`);
        console.log(`   📊 Gas used: ${receipt.gasUsed.toString()}`);
        console.log(`   💰 Transaction hash: ${tx.hash}`);

        // Update all user spending
        for (const tip of tips) {
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
        }

        processed = tips.length;

      } catch (multiTransferError) {
        console.log('⚠️ multiTransfer not supported, trying individual transfers...');
        
        // Fallback to individual transfers
        for (const tip of tips) {
          try {
            const tx = await tokenContract.transfer(tip.interactorAddress, ethers.parseUnits(tip.amount, 6));
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
            console.log(`✅ Individual tip sent: ${tip.amount} ${tokenAddress} to ${tip.interactorAddress}`);

          } catch (error) {
            console.error(`❌ Failed to send tip to ${tip.interactorAddress}:`, error.message);
            failed++;
          }
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

  async getUserTokenAllowance(userAddress, tokenAddress) {
    try {
      const tokenContract = new ethers.Contract(tokenAddress, [
        "function allowance(address owner, address spender) view returns (uint256)"
      ], this.provider);
      
      const allowance = await tokenContract.allowance(userAddress, this.wallet.address);
      return parseFloat(ethers.formatUnits(allowance, 6)); // Assuming 6 decimals for USDC
    } catch (error) {
      console.error('Error getting user allowance:', error);
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