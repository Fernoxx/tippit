const { ethers } = require('ethers');
const { contracts } = require('./contracts');

// Helper function to check if action is enabled
function isActionEnabled(config, actionType) {
  switch (actionType) {
    case 'like': return config.likeEnabled;
    case 'reply': return config.replyEnabled;
    case 'recast': return config.recastEnabled;
    case 'quote': return config.quoteEnabled;
    case 'follow': return config.followEnabled;
    default: return false;
  }
}

// Helper function to get follower count from Neynar API
async function getFollowerCount(fid) {
  try {
    const response = await fetch(`https://api.neynar.com/v2/farcaster/user/bulk?fids=${fid}`, {
      headers: {
        'api_key': process.env.NEYNAR_API_KEY,
      },
    });
    
    const data = await response.json();
    if (data.users && data.users[0]) {
      return data.users[0].follower_count || 0;
    }
    return 0;
  } catch (error) {
    console.error('Error fetching follower count:', error);
    return 0;
  }
}

// Helper function to check audience criteria
async function checkAudienceCriteria(authorFid, interactorFid, audience) {
  try {
    if (audience === 2) { // Anyone
      return true;
    }
    
    const response = await fetch(`https://api.neynar.com/v2/farcaster/follows?fid=${authorFid}`, {
      headers: {
        'api_key': process.env.NEYNAR_API_KEY,
      },
    });
    
    const data = await response.json();
    
    if (audience === 0) { // Following - check if interactor is in author's following
      return data.following?.some(user => user.fid === interactorFid) || false;
    } else if (audience === 1) { // Followers - check if interactor is in author's followers
      return data.followers?.some(user => user.fid === interactorFid) || false;
    }
    
    return false;
  } catch (error) {
    console.error('Error checking audience criteria:', error);
    return false;
  }
}

class BatchProcessor {
  constructor() {
    this.pendingInteractions = [];
    this.processedHashes = new Set();
    this.maxBatchSize = parseInt(process.env.MAX_BATCH_SIZE) || 100; // Can handle 100+ interactions
    this.batchIntervalMs = (parseInt(process.env.BATCH_INTERVAL_MINUTES) || 1) * 60 * 1000; // 1 minute default
    this.lastBatchTime = 0;
  }

  // Add interaction to batch
  async addInteraction(interaction) {
    // Create unique hash for this interaction
    const interactionHash = ethers.keccak256(
      ethers.AbiCoder.defaultAbiCoder().encode(
        ['uint256', 'uint256', 'string', 'bytes32', 'uint256'],
        [
          interaction.authorFid,
          interaction.interactorFid,
          interaction.interactionType,
          interaction.castHash || '0x0000000000000000000000000000000000000000000000000000000000000000',
          Math.floor(interaction.timestamp / 1000)
        ]
      )
    );

    // Check if already processed
    if (this.processedHashes.has(interactionHash)) {
      console.log('⚠️ Interaction already processed:', interactionHash);
      return false;
    }

    // Add to pending batch
    this.pendingInteractions.push({
      ...interaction,
      interactionHash
    });

    this.processedHashes.add(interactionHash);
    console.log(`📝 Queued interaction: ${interaction.interactionType} (${this.pendingInteractions.length} pending)`);
    
    return true;
  }

  // Process batch of interactions (Like Noice - every 1 minute)
  async processBatch() {
    const now = Date.now();
    const timeSinceLastBatch = now - this.lastBatchTime;
    
    // Only process if we have interactions and enough time has passed
    if (this.pendingInteractions.length === 0) {
      console.log('📭 No interactions to process');
      return { processed: 0, failed: 0 };
    }

    // Process if we have enough interactions OR enough time has passed
    if (this.pendingInteractions.length < 10 && timeSinceLastBatch < this.batchIntervalMs) {
      console.log(`⏳ Waiting for more interactions or time to pass... (${this.pendingInteractions.length} pending, ${Math.round((this.batchIntervalMs - timeSinceLastBatch) / 1000)}s remaining)`);
      return { processed: 0, failed: 0 };
    }

    const batch = this.pendingInteractions.splice(0, this.maxBatchSize);
    this.lastBatchTime = now;
    
    console.log(`🔄 Processing batch of ${batch.length} interactions (${Math.round(timeSinceLastBatch / 1000)}s since last batch)...`);

    let processed = 0;
    let failed = 0;

    try {
      // Validate interactions before processing
      const validInteractions = [];
      
      for (const interaction of batch) {
        try {
          // Check if author has active config
          const authorConfig = await contracts.ecion.creatorConfigs(interaction.authorAddress);
          if (!authorConfig.isActive) {
            console.log(`Author ${interaction.authorAddress} does not have active config`);
            continue;
          }

          // Check if action type is enabled
          if (!isActionEnabled(authorConfig, interaction.interactionType)) {
            console.log(`Action type ${interaction.interactionType} is not enabled for author ${interaction.authorAddress}`);
            continue;
          }

          // Check follower count requirement
          const followerCount = await getFollowerCount(interaction.interactorFid);
          if (followerCount < authorConfig.minFollowerCount) {
            console.log(`Interactor ${interaction.interactorFid} has ${followerCount} followers, required: ${authorConfig.minFollowerCount}`);
            continue;
          }

          // Check audience criteria
          const meetsAudienceCriteria = await checkAudienceCriteria(interaction.authorFid, interaction.interactorFid, authorConfig.audience);
          if (!meetsAudienceCriteria) {
            console.log(`Interactor ${interaction.interactorFid} does not meet audience criteria for author ${interaction.authorFid}`);
            continue;
          }

          validInteractions.push(interaction);
        } catch (error) {
          console.error(`Error validating interaction:`, error);
          continue;
        }
      }

      if (validInteractions.length === 0) {
        console.log('❌ No valid interactions to process');
        return { processed: 0, failed: batch.length };
      }

      console.log(`✅ Validated ${validInteractions.length}/${batch.length} interactions`);

      // Prepare batch data
      const postAuthors = validInteractions.map(i => i.authorAddress);
      const interactors = validInteractions.map(i => i.interactorAddress);
      const actionTypes = validInteractions.map(i => i.interactionType);
      const castHashes = validInteractions.map(i => i.castHash || '0x0000000000000000000000000000000000000000000000000000000000000000');
      const interactionHashes = validInteractions.map(i => i.interactionHash);

      console.log(`📤 Sending batch to contract: ${validInteractions.length} interactions`);
      
      // Call contract batch function
      const tx = await contracts.ecion.batchProcessTips(
        postAuthors,
        interactors,
        actionTypes,
        castHashes,
        interactionHashes
      );

      console.log(`⏳ Transaction submitted: ${tx.hash}`);
      
      // Wait for confirmation
      const receipt = await tx.wait();
      const gasUsed = receipt.gasUsed.toString();
      const gasPrice = receipt.gasPrice?.toString() || '0';
      const gasCost = (BigInt(gasUsed) * BigInt(gasPrice)) / BigInt(10**18);
      
      console.log(`✅ Batch processed successfully!`);
      console.log(`   📊 Interactions: ${validInteractions.length}`);
      console.log(`   ⛽ Gas used: ${gasUsed}`);
      console.log(`   💰 Gas cost: ${gasCost.toString()} ETH (~$${parseFloat(gasCost.toString()) * 3000})`);
      console.log(`   💸 Cost per tip: ~$${parseFloat(gasCost.toString()) * 3000 / validInteractions.length}`);
      
      processed = validInteractions.length;
      
    } catch (error) {
      console.error('❌ Batch processing failed:', error);
      
      // Try individual processing as fallback
      console.log('🔄 Attempting individual processing as fallback...');
      
      for (const interaction of validInteractions) {
        try {
          const tx = await contracts.ecion.processTip(
            interaction.authorAddress,
            interaction.interactorAddress,
            interaction.interactionType,
            interaction.castHash || '0x0000000000000000000000000000000000000000000000000000000000000000',
            interaction.interactionHash
          );
          
          await tx.wait();
          processed++;
          console.log(`✅ Individual tip processed: ${interaction.interactionType}`);
          
        } catch (individualError) {
          console.error(`❌ Individual tip failed:`, individualError.message);
          failed++;
          
          // Re-queue failed interaction (remove from processed hashes)
          this.processedHashes.delete(interaction.interactionHash);
          this.pendingInteractions.unshift(interaction);
        }
      }
    }

    console.log(`📊 Batch complete: ${processed} processed, ${failed} failed`);
    return { processed, failed };
  }

  // Get pending interactions
  getPendingInteractions() {
    return this.pendingInteractions;
  }

  // Clear processed hashes (for testing)
  clearProcessedHashes() {
    this.processedHashes.clear();
  }
}

module.exports = new BatchProcessor();