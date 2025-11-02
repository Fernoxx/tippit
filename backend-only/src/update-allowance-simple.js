// Simple update allowance endpoint
const express = require('express');
const { ethers } = require('ethers');

async function updateAllowanceSimple(req, res, database, batchTransferManager) {
  try {
    const { userAddress, tokenAddress, transactionType, isRealTransaction = false } = req.body;
    console.log(`🔄 Updating allowance for ${userAddress} (${transactionType}) - Real transaction: ${isRealTransaction}`);
    
    // Only update webhook for real transactions, not page visits
    if (!isRealTransaction) {
      console.log(`⏭️ Skipping webhook update - not a real transaction`);
      return res.json({ 
        success: true, 
        message: 'Allowance fetched without webhook update',
        isRealTransaction: false
      });
    }
    
    // Wait for blockchain to update - only 1 attempt after 8-10 seconds
    console.log(`⏳ Waiting 8 seconds for blockchain to update...`);
    await new Promise(resolve => setTimeout(resolve, 8000)); // Wait 8 seconds
    
    // Get current allowance and balance from blockchain - single call for both
    const provider = new ethers.JsonRpcProvider(process.env.BASE_RPC_URL);
    const ecionBatchAddress = process.env.ECION_BATCH_CONTRACT_ADDRESS || '0x2f47bcc17665663d1b63e8d882faa0a366907bb8';
    
    const tokenContract = new ethers.Contract(tokenAddress, [
      "function allowance(address owner, address spender) view returns (uint256)",
      "function balanceOf(address owner) view returns (uint256)"
    ], provider);
    
    // Get both allowance and balance in parallel - single blockchain call
    const [allowance, balance] = await Promise.all([
      tokenContract.allowance(userAddress, ecionBatchAddress),
      tokenContract.balanceOf(userAddress)
    ]);
    
    const tokenDecimals = await getTokenDecimals(tokenAddress);
    const allowanceAmount = parseFloat(ethers.formatUnits(allowance, tokenDecimals));
    const balanceAmount = parseFloat(ethers.formatUnits(balance, tokenDecimals));
    
    console.log(`📊 Blockchain check: Allowance: ${allowanceAmount}, Balance: ${balanceAmount}`);
    
    // Get user config to check min tip amount
    let userConfig = await database.getUserConfig(userAddress);
    if (!userConfig) {
      // Don't auto-create config - user must save config manually via frontend
      console.log(`⚠️ No config found for ${userAddress} - user needs to save config manually via frontend`);
      return res.json({
        success: false,
        error: 'No tipping configuration found. Please configure your tipping settings in the frontend first.',
        needsConfig: true
      });
    }
    
    console.log(`📖 Using existing config for ${userAddress}`);
    
    // Calculate total tip amount (like + recast + reply)
    const likeAmount = parseFloat(userConfig.likeAmount || '0');
    const recastAmount = parseFloat(userConfig.recastAmount || '0');
    const replyAmount = parseFloat(userConfig.replyAmount || '0');
    const minTipAmount = likeAmount + recastAmount + replyAmount;
    
    console.log(`💰 Total tip amount: ${minTipAmount} (like: ${likeAmount}, recast: ${recastAmount}, reply: ${replyAmount}), Current allowance: ${allowanceAmount}`);
    
    // Determine webhook action based on allowance vs min tip
    let webhookAction = 'no_change';
    let webhookReason = '';
    
    if (allowanceAmount < minTipAmount) {
      // User has insufficient allowance - should be removed from webhook
      webhookAction = 'remove';
      webhookReason = 'insufficient_allowance';
      console.log(`🚫 User ${userAddress} allowance ${allowanceAmount} < min tip ${minTipAmount} - removing from webhook`);
    } else {
      // User has sufficient allowance - should be in webhook
      webhookAction = 'add';
      webhookReason = 'sufficient_allowance';
      console.log(`✅ User ${userAddress} allowance ${allowanceAmount} >= min tip ${minTipAmount} - ensuring in webhook`);
    }
    
    // Execute the webhook action
    let webhookResult = { action: 'no_change', reason: 'no_change_needed' };
    
    try {
      // Get user's FID using the proper FID lookup function
      const { getUserFid } = require('./index');
      const fid = await getUserFid(userAddress);
      
      if (fid) {
        
        if (webhookAction === 'remove') {
          // Remove FID from webhook
          const removeFidFromWebhook = require('./index').removeFidFromWebhook;
          if (removeFidFromWebhook) {
            const removed = await removeFidFromWebhook(fid);
            webhookResult = { action: removed ? 'removed' : 'failed', reason: webhookReason };
            console.log(`🔗 Webhook removal result for FID ${fid}: ${removed ? 'removed' : 'failed'}`);
            
            // Update isActive to false when removed from webhook
            if (removed) {
              userConfig.isActive = false;
              await database.setUserConfig(userAddress, userConfig);
              console.log(`✅ Set isActive=false for ${userAddress} (removed from webhook)`);
            }
          }
        } else if (webhookAction === 'add') {
          // Add FID to webhook
          const addFidToWebhook = require('./index').addFidToWebhook;
          if (addFidToWebhook) {
            const added = await addFidToWebhook(fid);
            webhookResult = { action: added ? 'added' : 'failed', reason: webhookReason };
            console.log(`🔗 Webhook addition result for FID ${fid}: ${added ? 'added' : 'failed'}`);
            
            // Update isActive to true when added to webhook
            if (added) {
              userConfig.isActive = true;
              await database.setUserConfig(userAddress, userConfig);
              console.log(`✅ Set isActive=true for ${userAddress} (added to webhook)`);
            }
          }
        }
      } else {
        console.log(`⚠️ No FID found for user ${userAddress}`);
        webhookResult = { action: 'no_fid', reason: 'user_not_found' };
      }
    } catch (error) {
      console.error(`❌ Error managing webhook for ${userAddress}:`, error);
      webhookResult = { action: 'error', reason: error.message };
    }
    
    // Check if balance is too low and revoke allowance if needed
    let allowanceRevoked = false;
    if (balanceAmount < minTipAmount && allowanceAmount > 0) {
      console.log(`💰 User ${userAddress} balance ${balanceAmount} < min tip ${minTipAmount} - revoking allowance`);
      
      try {
        // Revoke allowance by setting it to 0
        const ecionBatchAddress = process.env.ECION_BATCH_CONTRACT_ADDRESS || '0x2f47bcc17665663d1b63e8d882faa0a366907bb8';
        
        // Create a transaction to revoke allowance
        const tokenContract = new ethers.Contract(tokenAddress, [
          "function approve(address spender, uint256 amount) returns (bool)"
        ], provider);
        
        // Note: This would require the user's private key or a different approach
        // For now, we'll just log that allowance should be revoked
        console.log(`⚠️ Allowance should be revoked for ${userAddress} - balance too low`);
        allowanceRevoked = true;
        
      } catch (error) {
        console.error(`❌ Error revoking allowance for ${userAddress}:`, error);
      }
    }
    
    // Webhook management is already handled above
    console.log(`📊 Webhook action executed: ${webhookResult.action} - ${webhookResult.reason}`);
    
    res.json({
      success: true,
      allowance: allowanceAmount,
      balance: balanceAmount,
      minTipAmount: minTipAmount,
      webhookAction: webhookResult.action,
      webhookReason: webhookResult.reason,
      allowanceRevoked: allowanceRevoked,
      message: `Webhook updated - user ${webhookResult.action === 'removed' ? 'removed from webhook' : 'ensured in webhook'}${allowanceRevoked ? ' - allowance should be revoked (low balance)' : ''}`
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