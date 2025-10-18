// Simple update allowance endpoint
const express = require('express');
const { ethers } = require('ethers');

async function updateAllowanceSimple(req, res, database, batchTransferManager) {
  try {
    const { userAddress, tokenAddress, transactionType, isRealTransaction = false } = req.body;
    console.log(`🔄 Updating allowance for ${userAddress} (${transactionType}) - Real transaction: ${isRealTransaction}`);
    
    // Only update blocklist for real transactions, not page visits
    if (!isRealTransaction) {
      console.log(`⏭️ Skipping blocklist update - not a real transaction`);
      return res.json({ 
        success: true, 
        message: 'Allowance fetched without blocklist update',
        isRealTransaction: false
      });
    }
    
    // Wait for blockchain to update
    console.log(`⏳ Waiting for blockchain to update...`);
    await new Promise(resolve => setTimeout(resolve, 3000)); // Wait 3 seconds
    
    // Get current allowance from blockchain
    const provider = new ethers.JsonRpcProvider(process.env.BASE_RPC_URL);
    const ecionBatchAddress = process.env.ECION_BATCH_CONTRACT_ADDRESS || '0x2f47bcc17665663d1b63e8d882faa0a366907bb8';
    
    const tokenContract = new ethers.Contract(tokenAddress, [
      "function allowance(address owner, address spender) view returns (uint256)"
    ], provider);
    
    const allowance = await tokenContract.allowance(userAddress, ecionBatchAddress);
    const tokenDecimals = await getTokenDecimals(tokenAddress);
    const allowanceAmount = parseFloat(ethers.formatUnits(allowance, tokenDecimals));
    
    console.log(`📊 Blockchain allowance: ${allowanceAmount}`);
    
    // Get user config to check min tip amount
    const userConfig = await database.getUserConfig(userAddress);
    if (!userConfig) {
      return res.json({ success: false, error: 'User config not found' });
    }
    
    // Calculate total tip amount (like + recast + reply)
    const likeAmount = parseFloat(userConfig.likeAmount || '0');
    const recastAmount = parseFloat(userConfig.recastAmount || '0');
    const replyAmount = parseFloat(userConfig.replyAmount || '0');
    const minTipAmount = likeAmount + recastAmount + replyAmount;
    
    console.log(`💰 Total tip amount: ${minTipAmount} (like: ${likeAmount}, recast: ${recastAmount}, reply: ${replyAmount}), Current allowance: ${allowanceAmount}`);
    
    // Simple blocklist update based on allowance
    const currentBlocklist = await database.getBlocklist();
    const shouldBeBlocked = allowanceAmount < minTipAmount;
    const isCurrentlyBlocked = currentBlocklist.includes(userAddress.toLowerCase());
    
    if (shouldBeBlocked && !isCurrentlyBlocked) {
      // Add to blocklist
      const updatedBlocklist = [...currentBlocklist, userAddress.toLowerCase()];
      await database.setBlocklist(updatedBlocklist);
      console.log(`✅ Added ${userAddress} to blocklist - insufficient allowance (${allowanceAmount} < ${minTipAmount})`);
      
      // Update memory blocklist
      if (batchTransferManager && batchTransferManager.blockedUsers) {
        batchTransferManager.blockedUsers.add(userAddress.toLowerCase());
        console.log(`✅ Updated memory blocklist`);
      }
      
    } else if (!shouldBeBlocked && isCurrentlyBlocked) {
      // Remove from blocklist
      const updatedBlocklist = currentBlocklist.filter(addr => addr !== userAddress.toLowerCase());
      await database.setBlocklist(updatedBlocklist);
      console.log(`✅ Removed ${userAddress} from blocklist - sufficient allowance (${allowanceAmount} >= ${minTipAmount})`);
      
      // Update memory blocklist
      if (batchTransferManager && batchTransferManager.blockedUsers) {
        batchTransferManager.blockedUsers.delete(userAddress.toLowerCase());
        console.log(`✅ Updated memory blocklist`);
      }
      
    } else {
      console.log(`ℹ️ No blocklist change needed - user ${userAddress} allowance: ${allowanceAmount}, min required: ${minTipAmount}`);
    }
    
    // Update webhook and homepage based on allowance
    if (allowanceAmount >= minTipAmount) {
      console.log(`✅ User ${userAddress} has sufficient allowance - keeping active`);
      
      const fid = await getUserFid(userAddress);
      if (fid) {
        await addFidToWebhook(fid);
        console.log(`🔗 Added FID ${fid} to webhook`);
      }
      
      console.log(`🏠 User remains in homepage cache`);
    } else {
      console.log(`❌ User ${userAddress} has insufficient allowance - removing from active`);
      await clearHomepageCache(userAddress);
    }
    
    res.json({
      success: true,
      allowance: allowanceAmount,
      minTipAmount: minTipAmount,
      isBlocked: shouldBeBlocked,
      message: `Blocklist updated - user ${shouldBeBlocked ? 'blocked' : 'unblocked'}`
    });
    
  } catch (error) {
    console.error('❌ Error updating allowance:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update allowance'
    });
  }
}

// Helper function to get token decimals
async function getTokenDecimals(tokenAddress) {
  const TOKEN_DECIMALS = {
    '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913': 6, // USDC
    '0x4200000000000000000000000000000000000006': 18, // WETH
    '0x50c5725949a6f0c72e6c4a641f24049a917db0cb': 18, // DAI
    '0x940181a94a35a4569e4529a3cdfb74e38fd98631': 18, // AERO
  };
  return TOKEN_DECIMALS[tokenAddress.toLowerCase()] || 18;
}

// Helper function to get user FID
async function getUserFid(userAddress) {
  try {
    const response = await fetch(`https://api.neynar.com/v2/farcaster/user/bulk-by-address?addresses=${userAddress}`, {
      headers: {
        'api_key': process.env.NEYNAR_API_KEY
      }
    });
    
    if (response.ok) {
      const data = await response.json();
      return data.users?.[0]?.fid || null;
    }
  } catch (error) {
    console.error('Error fetching user FID:', error);
  }
  return null;
}

// Helper function to add FID to webhook
async function addFidToWebhook(fid) {
  try {
    const response = await fetch(`https://api.neynar.com/v2/farcaster/webhook/subscriptions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'api_key': process.env.NEYNAR_API_KEY
      },
      body: JSON.stringify({
        webhook_url: process.env.NEYNAR_WEBHOOK_URL,
        subscription: {
          'farcaster.actions': {
            'farcaster.actions.cast.action': {
              'filters': {
                'fid': [fid]
              }
            }
          }
        }
      })
    });
    
    if (response.ok) {
      console.log(`✅ Added FID ${fid} to webhook`);
    } else {
      console.log(`⚠️ Failed to add FID ${fid} to webhook: ${response.status}`);
    }
  } catch (error) {
    console.error('Error adding FID to webhook:', error);
  }
}

// Helper function to clear homepage cache
async function clearHomepageCache(userAddress) {
  try {
    console.log(`🗑️ Clearing homepage cache for ${userAddress}`);
    return true;
  } catch (error) {
    console.error('❌ Error clearing homepage cache:', error);
    return false;
  }
}

module.exports = updateAllowanceSimple;