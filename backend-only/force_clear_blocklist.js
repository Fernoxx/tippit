// Force clear the blocklist by calling the clearBlocklist method
const BlocklistService = require('./src/blocklistService');
const { ethers } = require('ethers');

async function forceClearBlocklist() {
  try {
    console.log('🧹 Force clearing blocklist...');
    
    // Create a minimal database mock
    const mockDatabase = {
      getBlocklist: () => Promise.resolve([]),
      getUserConfig: () => Promise.resolve(null),
      addToBlocklist: () => Promise.resolve(),
      removeFromBlocklist: () => Promise.resolve()
    };
    
    // Create provider
    const rpcUrl = process.env.BASE_RPC_URL || 'https://mainnet.base.org';
    const provider = new ethers.JsonRpcProvider(rpcUrl);
    
    // Create BlocklistService instance
    const blocklistService = new BlocklistService(provider, mockDatabase);
    
    // Wait a moment for initialization
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Clear the blocklist
    blocklistService.clearBlocklist();
    
    console.log(`✅ Blocklist cleared! Current size: ${blocklistService.getBlocklistSize()}`);
    
  } catch (error) {
    console.error('❌ Error clearing blocklist:', error);
  }
}

forceClearBlocklist();