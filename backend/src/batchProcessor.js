const { ethers } = require('ethers');
const { contracts } = require('./contracts');

class BatchProcessor {
  constructor() {
    this.pendingInteractions = [];
    this.processedHashes = new Set();
    this.maxBatchSize = parseInt(process.env.MAX_BATCH_SIZE) || 50;
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

  // Process batch of interactions
  async processBatch() {
    if (this.pendingInteractions.length === 0) {
      console.log('📭 No interactions to process');
      return { processed: 0, failed: 0 };
    }

    const batch = this.pendingInteractions.splice(0, this.maxBatchSize);
    console.log(`🔄 Processing batch of ${batch.length} interactions...`);

    let processed = 0;
    let failed = 0;

    try {
      // Prepare batch data
      const postAuthors = batch.map(i => i.authorAddress);
      const interactors = batch.map(i => i.interactorAddress);
      const actionTypes = batch.map(i => i.interactionType);
      const castHashes = batch.map(i => i.castHash || '0x0000000000000000000000000000000000000000000000000000000000000000');
      const interactionHashes = batch.map(i => i.interactionHash);

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
      console.log(`✅ Batch processed successfully! Gas used: ${receipt.gasUsed.toString()}`);
      
      processed = batch.length;
      
    } catch (error) {
      console.error('❌ Batch processing failed:', error);
      
      // Try individual processing as fallback
      console.log('🔄 Attempting individual processing...');
      
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