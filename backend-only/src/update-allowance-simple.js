// Simple update allowance endpoint
const express = require('express');
const { ethers } = require('ethers');

async function updateAllowanceSimple(req, res, database, batchTransferManager, blocklistService) {
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
    
    // Determine blocklist action based on allowance vs min tip
    let blocklistAction = 'no_change';
    let blocklistReason = '';
    
    if (allowanceAmount < minTipAmount) {
      // User has insufficient allowance - should be blocked
      if (!blocklistService.isBlocked(userAddress)) {
        blocklistAction = 'add';
        blocklistReason = 'insufficient_allowance';
        console.log(`🚫 User ${userAddress} allowance ${allowanceAmount} < min tip ${minTipAmount} - adding to blocklist`);
      } else {
        blocklistAction = 'keep_blocked';
        blocklistReason = 'already_blocked_insufficient_allowance';
        console.log(`🚫 User ${userAddress} already blocked - keeping blocked (insufficient allowance)`);
      }
    } else {
      // User has sufficient allowance - should not be blocked
      if (blocklistService.isBlocked(userAddress)) {
        blocklistAction = 'remove';
        blocklistReason = 'sufficient_allowance';
        console.log(`✅ User ${userAddress} allowance ${allowanceAmount} >= min tip ${minTipAmount} - removing from blocklist`);
      } else {
        blocklistAction = 'keep_unblocked';
        blocklistReason = 'already_unblocked_sufficient_allowance';
        console.log(`✅ User ${userAddress} already unblocked - keeping unblocked (sufficient allowance)`);
      }
    }
    
    // Execute the blocklist action
    let blocklistResult = { action: 'no_change', reason: 'no_change_needed' };
    
    if (blocklistAction === 'add') {
      blocklistService.addToBlocklist(userAddress, blocklistReason);
      blocklistResult = { action: 'added', reason: blocklistReason };
    } else if (blocklistAction === 'remove') {
      blocklistService.removeFromBlocklist(userAddress);
      blocklistResult = { action: 'removed', reason: blocklistReason };
    } else {
      blocklistResult = { action: blocklistAction, reason: blocklistReason };
    }
    
    // Note: batchTransferManager now uses global.blocklistService, so no manual sync needed
    console.log(`📊 Blocklist action executed: ${blocklistResult.action} - ${blocklistResult.reason}`);
    
    console.log(`📊 Blocklist update result: ${blocklistResult.action} - ${blocklistResult.reason}`);
    
    // Update webhook and homepage based on blocklist status
    const isCurrentlyBlocked = blocklistService.isBlocked(userAddress);
    
    if (!isCurrentlyBlocked) {
      console.log(`✅ User ${userAddress} is not blocked - keeping active`);
      
      const fid = await getUserFid(userAddress);
      if (fid) {
        await addFidToWebhook(fid);
        console.log(`🔗 Added FID ${fid} to webhook`);
      }
      
      console.log(`🏠 User remains in homepage cache`);
    } else {
      console.log(`❌ User ${userAddress} is blocked - removing from active`);
      await clearHomepageCache(userAddress);
    }
    
    res.json({
      success: true,
      allowance: allowanceAmount,
      balance: balanceAmount,
      minTipAmount: minTipAmount,
      isBlocked: isCurrentlyBlocked,
      blocklistAction: blocklistResult.action,
      message: `Blocklist updated - user ${isCurrentlyBlocked ? 'blocked' : 'unblocked'}`
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