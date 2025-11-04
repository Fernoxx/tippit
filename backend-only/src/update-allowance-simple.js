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
    // Use fallback provider to handle RPC errors
    const { getProvider } = require('./rpcProvider');
    const provider = await getProvider();
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
    
    // Get user config (if exists)
    let userConfig = await database.getUserConfig(userAddress);
    let isExistingUser = !!userConfig;
    
    // Create default config for new users when they approve USDC
    if (!userConfig) {
      console.log(`🆕 Creating default config for new user ${userAddress} on approval`);
      userConfig = {
        tokenAddress: tokenAddress || '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', // USDC on Base
        likeAmount: '0.01',
        replyAmount: '0.01',
        recastAmount: '0.01',
        followAmount: '0.01',
        spendingLimit: '999999',
        audience: 2, // Anyone (most permissive default)
        minFollowerCount: 0,
        minNeynarScore: 0,
        likeEnabled: true,    // Enable all by default
        replyEnabled: true,   // Enable all by default
        recastEnabled: true,  // Enable all by default
        followEnabled: true,  // Enable all by default
        isActive: false,      // Will be set to true when added to webhook
        totalSpent: '0'
      };
      
      // Save default config to database
      await database.setUserConfig(userAddress, userConfig);
      console.log(`✅ Created and saved default config for new user ${userAddress}`);
      isExistingUser = false; // Still treat as new user for webhook logic
    }
    
    // LOGIC: 
    // - NEW users: Add to webhook immediately when they approve (with default config)
    // - OLD users: Check config and allowance, add/keep in webhook if sufficient
    // - Config/criteria checks happen ONLY when processing tips
    
    let webhookAction = 'no_change';
    let webhookReason = '';
    let minTipAmount = 0;
    
    let newUserFid = null; // Store FID for new users to avoid fetching twice
    
    if (!isExistingUser) {
      // NEW USER: Add to webhook immediately (they'll set config after)
      // BUT FIRST: Get FID and ensure they're in database
      console.log(`🆕 New user ${userAddress} approved allowance - getting FID first`);
      
      // Get FID and store user data in database when they approve USDC
      const { getUserFid, getUserByFid } = require('./index');
      newUserFid = await getUserFid(userAddress);
      
      if (newUserFid) {
        console.log(`✅ Found FID ${newUserFid} for new user ${userAddress} - storing in database`);
        
        // Ensure full user profile is stored in database (FID + address + details)
        try {
          const { getUserByFid } = require('./neynar');
          const userData = await getUserByFid(newUserFid);
          if (userData) {
            await database.pool.query(`
              INSERT INTO user_profiles (fid, username, display_name, pfp_url, user_address, updated_at)
              VALUES ($1, $2, $3, $4, $5, NOW())
              ON CONFLICT (fid) 
              DO UPDATE SET 
                username = COALESCE($2, user_profiles.username),
                display_name = COALESCE($3, user_profiles.display_name),
                pfp_url = COALESCE($4, user_profiles.pfp_url),
                user_address = COALESCE($5, user_profiles.user_address),
                updated_at = NOW()
            `, [
              newUserFid,
              userData.username || userData.display_name,
              userData.display_name,
              userData.pfp?.url,
              userAddress.toLowerCase()
            ]);
            console.log(`💾 Stored user profile in database: FID ${newUserFid}, Address ${userAddress}`);
          }
        } catch (dbError) {
          console.log(`⚠️ Error storing user profile in database: ${dbError.message}`);
        }
        
        console.log(`✅ Found FID ${newUserFid} for new user ${userAddress} - adding to webhook immediately`);
        webhookAction = 'add';
        webhookReason = 'new_user_approval';
      } else {
        console.log(`⚠️ No FID found for new user ${userAddress} - cannot add to webhook`);
        webhookAction = 'no_fid';
        webhookReason = 'user_not_found';
      }
    } else {
      // EXISTING USER: Check config and allowance
      console.log(`📖 Existing user ${userAddress} - checking config and allowance`);
      
      // Calculate total tip amount (like + recast + reply)
      const likeAmount = parseFloat(userConfig.likeAmount || '0');
      const recastAmount = parseFloat(userConfig.recastAmount || '0');
      const replyAmount = parseFloat(userConfig.replyAmount || '0');
      minTipAmount = likeAmount + recastAmount + replyAmount;
      
      console.log(`💰 Total tip amount: ${minTipAmount} (like: ${likeAmount}, recast: ${recastAmount}, reply: ${replyAmount}), Current allowance: ${allowanceAmount}`);
      
      // Determine webhook action based on allowance vs min tip
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
    }
    
    // Execute the webhook action
    let webhookResult = { action: 'no_change', reason: 'no_change_needed' };
    
    try {
      // Get user's FID using the proper FID lookup function from index.js
      // For new users, FID was already fetched above, so reuse it
      let fid = newUserFid;
      
      if (!fid) {
        // For existing users or if new user FID fetch failed, fetch FID now
        const { getUserFid } = require('./index');
        console.log(`🔍 Looking up FID for ${userAddress}...`);
        fid = await getUserFid(userAddress);
      }
      
      if (fid) {
        console.log(`✅ Found FID ${fid} for ${userAddress}`);
        
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
            
            // Update isActive to true when added to webhook (only if user has config)
            if (added && userConfig) {
              userConfig.isActive = true;
              await database.setUserConfig(userAddress, userConfig);
              console.log(`✅ Set isActive=true for ${userAddress} (added to webhook)`);
            } else if (added && !userConfig) {
              // New user - they'll set isActive when they save config
              console.log(`✅ New user ${userAddress} added to webhook - config will be set when they save settings`);
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
    
    // Check balance for ALL users (both new and existing)
    // Note: Frontend already checks minimum 1 USDC balance before allowing approval
    let balanceWarning = false;
    const minBalanceThreshold = isExistingUser && minTipAmount > 0 ? minTipAmount : 1.0; // 1 USDC for new users, minTip for existing
    
    if (balanceAmount < minBalanceThreshold && allowanceAmount > 0) {
      console.log(`⚠️ User ${userAddress} balance ${balanceAmount} < ${minBalanceThreshold} - low balance warning`);
      balanceWarning = true;
    }
    
    // Log balance/allowance status for all users
    console.log(`💰 Balance check: ${balanceAmount} USDC, Allowance: ${allowanceAmount} USDC${balanceWarning ? ' - LOW BALANCE WARNING' : ''}`);
    
    // Webhook management is already handled above
    console.log(`📊 Webhook action executed: ${webhookResult.action} - ${webhookResult.reason}`);
    
    res.json({
      success: true,
      allowance: allowanceAmount,
      balance: balanceAmount,
      minTipAmount: minTipAmount || 0,
      isExistingUser,
      balanceWarning,
      webhookAction: webhookResult.action,
      webhookReason: webhookResult.reason,
      message: isExistingUser 
        ? `Webhook updated - user ${webhookResult.action === 'removed' ? 'removed from webhook' : 'ensured in webhook'}${balanceWarning ? ' - low balance warning' : ''}`
        : `New user added to webhook - please configure tipping settings in frontend${balanceWarning ? ' - low balance warning' : ''}`
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
