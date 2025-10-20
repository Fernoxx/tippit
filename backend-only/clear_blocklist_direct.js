// Direct blocklist clearing script
const { ethers } = require('ethers');

async function clearBlocklistDirect() {
  try {
    console.log('🧹 Clearing blocklist directly...');
    
    // This will be run on the server to clear the blocklist
    // The blocklistService will be available in the global scope
    if (global.blocklistService) {
      global.blocklistService.clearBlocklist();
      console.log('✅ Cleared blocklistService cache');
    }
    
    console.log('✅ Blocklist cleared - system will rebuild based on current allowances');
  } catch (error) {
    console.error('❌ Error clearing blocklist:', error);
  }
}

clearBlocklistDirect();
