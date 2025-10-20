const { ethers } = require('ethers');

// Token decimals mapping
const TOKEN_DECIMALS = {
  '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913': 6, // USDC
  '0x4200000000000000000000000000000000000006': 18, // WETH
  '0x50c5725949a6f0c72e6c4a641f24049a917db0cb': 18, // DAI
  '0x940181a94a35a4569e4529a3cdfb74e38fd98631': 18, // AERO
};

function getTokenDecimals(tokenAddress) {
  return TOKEN_DECIMALS[tokenAddress.toLowerCase()] || 18;
}

async function checkUserAllowance(userAddress, tokenAddress, requiredAmount) {
  try {
    const provider = new ethers.JsonRpcProvider(process.env.BASE_RPC_URL);
    const ecionBatchAddress = process.env.ECION_BATCH_CONTRACT_ADDRESS || '0x2f47bcc17665663d1b63e8d882faa0a366907bb8';
    
    const tokenContract = new ethers.Contract(tokenAddress, [
      "function allowance(address owner, address spender) view returns (uint256)"
    ], provider);
    
    const allowance = await tokenContract.allowance(userAddress, ecionBatchAddress);
    const tokenDecimals = getTokenDecimals(tokenAddress);
    const allowanceAmount = parseFloat(ethers.formatUnits(allowance, tokenDecimals));
    
    console.log(`🔍 ${userAddress}: allowance ${allowanceAmount}, required ${requiredAmount}`);
    return allowanceAmount >= requiredAmount;
  } catch (error) {
    console.error(`❌ Error checking allowance for ${userAddress}:`, error.message);
    return false;
  }
}

async function cleanupBlocklist() {
  console.log('🧹 Starting blocklist cleanup...');
  
  // Get current blocklist from API
  const response = await fetch('https://tippit-production.up.railway.app/api/debug/blocklist');
  const data = await response.json();
  
  if (!data.success) {
    console.error('❌ Failed to get blocklist:', data);
    return;
  }
  
  const blockedUsers = data.blockedUsers;
  console.log(`📋 Found ${blockedUsers.length} users in blocklist`);
  
  const usersToRemove = [];
  
  for (const userAddress of blockedUsers) {
    try {
      // Get user config to determine required amount
      const configResponse = await fetch(`https://tippit-production.up.railway.app/api/debug/user-config?userAddress=${userAddress}`);
      const configData = await configResponse.json();
      
      if (configData.success && configData.config) {
        const config = configData.config;
        const likeAmount = parseFloat(config.likeAmount || '0');
        const recastAmount = parseFloat(config.recastAmount || '0');
        const replyAmount = parseFloat(config.replyAmount || '0');
        const requiredAmount = likeAmount + recastAmount + replyAmount;
        
        if (requiredAmount > 0) {
          const tokenAddress = config.tokenAddress || '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
          const hasSufficientAllowance = await checkUserAllowance(userAddress, tokenAddress, requiredAmount);
          
          if (hasSufficientAllowance) {
            usersToRemove.push(userAddress);
            console.log(`✅ ${userAddress} has sufficient allowance (${requiredAmount}) - will remove from blocklist`);
          } else {
            console.log(`❌ ${userAddress} still has insufficient allowance (${requiredAmount}) - keeping in blocklist`);
          }
        } else {
          console.log(`⚠️ ${userAddress} has no tip amounts configured - keeping in blocklist`);
        }
      } else {
        console.log(`⚠️ ${userAddress} has no config - keeping in blocklist`);
      }
    } catch (error) {
      console.error(`❌ Error processing ${userAddress}:`, error.message);
    }
  }
  
  console.log(`\n📊 Cleanup Summary:`);
  console.log(`   Total blocked users: ${blockedUsers.length}`);
  console.log(`   Users to remove: ${usersToRemove.length}`);
  console.log(`   Users to keep: ${blockedUsers.length - usersToRemove.length}`);
  
  if (usersToRemove.length > 0) {
    console.log(`\n🗑️ Users to remove from blocklist:`);
    usersToRemove.forEach(addr => console.log(`   - ${addr}`));
  }
}

// Run cleanup
cleanupBlocklist().catch(console.error);
