const { ethers } = require('ethers');
const { contracts } = require('./contracts');

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
      // Prepare batch data
      const postAuthors = batch.map(i => i.authorAddress);
      const interactors = batch.map(i => i.interactorAddress);
      const actionTypes = batch.map(i => i.interactionType);
      const castHashes = batch.map(i => i.castHash || '0x0000000000000000000000000000000000000000000000000000000000000000');
      const interactionHashes = batch.map(i => i.interactionHash);

      console.log(`📤 Sending batch to contract: ${batch.length} interactions`);
      
      // Call contract batch function
      const tx = await contracts.pitTipping.batchProcessTips(
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
      console.log(`   📊 Interactions: ${batch.length}`);
      console.log(`   ⛽ Gas used: ${gasUsed}`);
      console.log(`   💰 Gas cost: ${gasCost.toString()} ETH (~$${parseFloat(gasCost.toString()) * 3000})`);
      console.log(`   💸 Cost per tip: ~$${parseFloat(gasCost.toString()) * 3000 / batch.length}`);
      
      processed = batch.length;
      
    } catch (error) {
      console.error('❌ Batch processing failed:', error);
      
      // Try individual processing as fallback
      console.log('🔄 Attempting individual processing as fallback...');
      
      for (const interaction of batch) {
        try {
          const tx = await contracts.pitTipping.processTip(
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