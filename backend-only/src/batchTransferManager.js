const { ethers } = require('ethers');
const MulticallContract = require('./multicallContract');
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
    this.provider = new ethers.JsonRpcProvider(process.env.BASE_RPC_URL);
    this.wallet = new ethers.Wallet(process.env.BACKEND_WALLET_PRIVATE_KEY, this.provider);
    
    // Batch configuration
    this.batchIntervalMs = 60000; // 1 minute batches like Noice
    this.maxBatchSize = 100; // Maximum tips per batch
    this.minBatchSize = 1; // Minimum tips to trigger batch
    
    // Pending tips queue
    this.pendingTips = [];
    this.isProcessing = false;
    
    // Initialize multicall contract for gas-efficient batch transfers
    this.multicallContract = new MulticallContract(this.provider, this.wallet);
    
    // Start batch processing timer
    this.startBatchTimer();
    
    console.log(`🔄 Batch Transfer Manager initialized`);
    console.log(`💰 Backend wallet address: ${this.wallet.address}`);
    console.log(`⏰ Batch interval: ${this.batchIntervalMs / 1000} seconds`);
  }

  startBatchTimer() {
    setInterval(async () => {
      if (!this.isProcessing && this.pendingTips.length > 0) {
        await this.processBatch();
      }
    }, this.batchIntervalMs);
    
    console.log(`⏰ Batch timer started - processing every ${this.batchIntervalMs / 1000} seconds`);
  }

  async addTipToBatch(interaction, authorConfig) {
    const userKey = interaction.authorAddress.toLowerCase();
    
    // Validate the tip first
    const validation = await this.validateTip(interaction, authorConfig);
    if (!validation.valid) {
      console.log(`❌ Tip validation failed: ${validation.reason}`);
      return { success: false, reason: validation.reason };
    }

    // Add to pending tips
    const tipData = {
      interaction,
      authorConfig,
      amount: validation.amount,
      tokenAddress: authorConfig.tokenAddress,
      timestamp: Date.now(),
      id: `${userKey}_${interaction.interactorAddress}_${interaction.castHash}_${interaction.interactionType}_${Date.now()}`
    };

    this.pendingTips.push(tipData);
    console.log(`📝 Added tip to batch. Total pending: ${this.pendingTips.length}`);

    // Process immediately if batch is full
    if (this.pendingTips.length >= this.maxBatchSize) {
      console.log(`🚀 Batch size reached (${this.maxBatchSize}), processing immediately`);
      await this.processBatch();
    }

    return { success: true, queued: true, batchSize: this.pendingTips.length };
  }

  async validateTip(interaction, authorConfig) {
    try {
      // Check if interactor has a verified address
      if (!interaction.interactorAddress) {
        return { valid: false, reason: 'Interactor has no verified address' };
      }

      // Check if author has active config
      if (!authorConfig || !authorConfig.isActive) {
        return { valid: false, reason: 'No active configuration' };
      }

      // Get user data for validation
      const userData = await this.getUserData(interaction.interactorFid);
      if (!userData) {
        return { valid: false, reason: 'Could not fetch user data' };
      }

      // Check follower count
      if (userData.followerCount < authorConfig.minFollowerCount) {
        return { valid: false, reason: 'Insufficient follower count' };
      }

      // Check Neynar score
      if (userData.neynarScore < authorConfig.minNeynarScore) {
        return { valid: false, reason: 'Insufficient Neynar score' };
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

      // Check user allowance
      const userAllowance = await this.getUserTokenAllowance(interaction.authorAddress, authorConfig.tokenAddress);
      if (userAllowance < amount) {
        return { valid: false, reason: 'Insufficient allowance' };
      }

      return { valid: true, amount: amount };

    } catch (error) {
      console.error('Tip validation error:', error);
      return { valid: false, reason: error.message };
    }
  }

  async processBatch() {
    if (this.isProcessing || this.pendingTips.length === 0) {
      return;
    }

    this.isProcessing = true;
    console.log(`🔄 Processing batch of ${this.pendingTips.length} tips...`);

    try {
      // Group tips by token address for efficient batching
      const tipsByToken = this.groupTipsByToken(this.pendingTips);
      
      let totalProcessed = 0;
      let totalFailed = 0;

      // Process each token batch
      for (const [tokenAddress, tips] of Object.entries(tipsByToken)) {
        console.log(`💸 Processing ${tips.length} tips for token ${tokenAddress}`);
        
        try {
          const result = await this.executeBatchTransfer(tokenAddress, tips);
          totalProcessed += result.processed;
          totalFailed += result.failed;
        } catch (error) {
          console.error(`❌ Batch transfer failed for token ${tokenAddress}:`, error);
          totalFailed += tips.length;
        }
      }

      // Clear processed tips
      this.pendingTips = [];
      
      console.log(`✅ Batch processing complete: ${totalProcessed} processed, ${totalFailed} failed`);

    } catch (error) {
      console.error('❌ Batch processing error:', error);
    } finally {
      this.isProcessing = false;
    }
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

  async executeBatchTransfer(tokenAddress, tips) {
    let processed = 0;
    let failed = 0;

    try {
      console.log(`💸 Executing ${tips.length} transfers for token ${tokenAddress} using multicall...`);
      
      // Prepare transfer data for multicall
      const transfers = tips.map(tip => ({
        tokenAddress: tip.tokenAddress,
        from: tip.interaction.authorAddress,
        to: tip.interaction.interactorAddress,
        amount: ethers.parseUnits(tip.amount.toString(), 6) // USDC has 6 decimals
      }));

      // Calculate gas savings
      const gasSavings = this.multicallContract.calculateGasSavings(tips.length);
      console.log(`💰 Gas savings: ${gasSavings.savingsPercent.toFixed(1)}% (${gasSavings.savings} gas saved)`);

      // Execute batch transfer using multicall (like Noice)
      const results = await this.multicallContract.executeBatchTransfers(transfers);
      
      console.log(`✅ Multicall batch successful: ${results.length} token batches processed`);
      
      // Update database for all successful tips
      for (const result of results) {
        if (result.success) {
          // Find tips for this token
          const tokenTips = tips.filter(tip => tip.tokenAddress === result.tokenAddress);
          
          for (const tip of tokenTips) {
            await this.updateUserSpending(tip.interaction.authorAddress, tip.amount);
            await database.addTipHistory({
              fromAddress: tip.interaction.authorAddress,
              toAddress: tip.interaction.interactorAddress,
              tokenAddress: tip.tokenAddress,
              amount: tip.amount.toString(),
              actionType: tip.interaction.interactionType,
              castHash: tip.interaction.castHash,
              transactionHash: result.transactionHash,
              timestamp: Date.now()
            });
          }
          
          processed += tokenTips.length;
        }
      }

    } catch (error) {
      console.error('❌ Multicall batch transfer failed:', error);
      
      // Fallback to individual transfers if multicall fails
      console.log('🔄 Falling back to individual transfers...');
      return await this.executeIndividualTransfers(tokenAddress, tips);
    }

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
            
            // Get current nonce for this author
            const nonce = await this.provider.getTransactionCount(tip.interaction.authorAddress, 'pending');
            console.log(`🔢 Using nonce ${nonce} for author ${tip.interaction.authorAddress}`);
            
            const tx = await tokenContract.transferFrom(
              tip.interaction.authorAddress,
              tip.interaction.interactorAddress,
              ethers.parseUnits(tip.amount.toString(), 6),
              { 
                gasLimit: 100000,
                nonce: nonce + i // Increment nonce for each transaction from same author
              }
            );
            
            console.log(`✅ Transfer ${i + 1} submitted: ${tx.hash}`);
            
            // Wait for confirmation with timeout
            try {
              const receipt = await tx.wait(3); // Wait for 3 confirmations
              console.log(`✅ Transfer ${i + 1} confirmed: ${tx.hash} (Gas: ${receipt.gasUsed.toString()})`);
            } catch (waitError) {
              console.log(`⏳ Transfer ${i + 1} timeout, checking status...`);
              // Check if transaction was mined
              const receipt = await this.provider.getTransactionReceipt(tx.hash);
              if (receipt && receipt.status === 1) {
                console.log(`✅ Transfer ${i + 1} confirmed: ${tx.hash}`);
              } else {
                throw new Error(`Transfer ${i + 1} failed or not confirmed`);
              }
            }
            
            // Update database
            await this.updateUserSpending(tip.interaction.authorAddress, tip.amount);
            await database.addTipHistory({
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
            
            // Small delay between transactions from same author to avoid nonce conflicts
            if (i < authorTips.length - 1) {
              await this.delay(1000); // 1 second delay
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
      const response = await fetch(`https://api.neynar.com/v2/farcaster/user/bulk?fids=${fid}`, {
        headers: { 'x-api-key': process.env.NEYNAR_API_KEY }
      });
      
      if (!response.ok) {
        console.error(`Failed to fetch user data for FID ${fid}: ${response.status}`);
        return null;
      }
      
      const data = await response.json();
      const user = data.users[0];
      
      return {
        followerCount: user.follower_count || 0,
        neynarScore: user.score || 0
      };
    } catch (error) {
      console.error(`Error fetching user data for FID ${fid}:`, error);
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
      case 'quote': return parseFloat(config.quoteAmount);
      case 'follow': return parseFloat(config.followAmount);
      default: return 0;
    }
  }

  async getUserTokenAllowance(userAddress, tokenAddress) {
    try {
      const tokenContract = new ethers.Contract(tokenAddress, [
        "function allowance(address owner, address spender) view returns (uint256)"
      ], this.provider);
      
      const allowance = await tokenContract.allowance(userAddress, this.wallet.address);
      return parseFloat(ethers.formatUnits(allowance, 6)); // USDC has 6 decimals
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
}

module.exports = new BatchTransferManager();
