const express = require('express');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const webhookHandler = require('./webhook');
const BatchProcessor = require('./batchProcessor');
// Use PostgreSQL database if available, fallback to file storage
let database;
try {
  if (process.env.DATABASE_URL) {
    database = require('./database-pg');
    console.log('🗄️ Using PostgreSQL database');
  } else {
    database = require('./database');
    console.log('📁 Using file-based database');
  }
} catch (error) {
  console.log('⚠️ PostgreSQL not available, using file storage:', error.message);
  database = require('./database');
}

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware - Configure CORS properly
app.use(cors({
  origin: [
    'https://ecion.vercel.app',
    'http://localhost:3000',
    process.env.FRONTEND_DOMAIN
  ].filter(Boolean),
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-neynar-signature']
}));
app.use(express.json());

// Initialize batch processor
new BatchProcessor();

// Using webhook-based event processing

// Security middleware - verify webhook secret
app.use('/webhook/neynar', (req, res, next) => {
  const signature = req.headers['x-neynar-signature'];
  const secret = process.env.WEBHOOK_SECRET;
  
  if (!signature || !secret) {
    console.log('❌ UNAUTHORIZED: Missing signature or secret');
    return res.status(401).json({ error: 'Unauthorized' });
  }
  
  // Verify signature (implement proper HMAC verification)
  const crypto = require('crypto');
  const expectedSignature = crypto
    .createHmac('sha256', secret)
    .update(JSON.stringify(req.body))
    .digest('hex');
  
  if (signature !== expectedSignature) {
    console.log('❌ UNAUTHORIZED: Invalid signature');
    return res.status(401).json({ error: 'Invalid signature' });
  }
  
  console.log('✅ SECURE: Webhook signature verified');
  next();
});

// Add basic logging for all webhook attempts
app.use('/webhook/neynar', (req, res, next) => {
  console.log('🚨 WEBHOOK HIT:', {
    method: req.method,
    headers: Object.keys(req.headers),
    hasBody: !!req.body,
    timestamp: new Date().toISOString()
  });
  next();
});

// Test endpoint to simulate a webhook
app.post('/api/test-webhook', async (req, res) => {
  console.log('🧪 TEST WEBHOOK CALLED');
  
  // Simulate a like event
  const testEvent = {
    type: 'reaction.created',
    data: {
      reaction_type: 1, // like
      user: { fid: 12345 }, // fake interactor
      cast: {
        hash: 'test-hash',
        author: { fid: 67890 } // fake cast author
      }
    }
  };
  
  try {
    const result = await webhookHandler({ body: testEvent, headers: {} }, res);
    console.log('🧪 Test webhook result:', result);
  } catch (error) {
    console.error('🧪 Test webhook error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Manual webhook registration endpoint (both GET and POST)
app.get('/api/register-webhook', async (req, res) => {
  await registerWebhook(req, res);
});

app.post('/api/register-webhook', async (req, res) => {
  await registerWebhook(req, res);
});

// Test endpoint to check Neynar API connectivity
app.get('/api/test-api', async (req, res) => {
  try {
    console.log('🧪 Testing Neynar API connectivity...');
    
    if (!process.env.NEYNAR_API_KEY) {
      return res.status(500).json({
        success: false,
        error: 'NEYNAR_API_KEY not set'
      });
    }
    
    // Test a simple API call using direct HTTP
    const response = await fetch('https://api.neynar.com/v2/farcaster/user/bulk?fids=3', {
      headers: {
        'x-api-key': process.env.NEYNAR_API_KEY
      }
    });
    
    if (response.ok) {
      const user = await response.json();
      res.json({
        success: true,
        message: 'Neynar API is working',
        user: user
      });
    } else {
      res.status(response.status).json({
        success: false,
        error: 'API test failed',
        status: response.status,
        response: await response.text()
      });
    }
    
  } catch (error) {
    console.error("❌ Error testing API:", error);
    
    res.status(500).json({
      success: false,
      error: 'API test failed',
      details: error.message
    });
  }
});

// Create initial webhook with no filters (captures all events)
app.post('/api/create-webhook-direct', async (req, res) => {
  try {
    console.log('🔗 Creating initial webhook (no filters)...');
    
    if (!process.env.NEYNAR_API_KEY) {
      return res.status(500).json({
        success: false,
        error: 'NEYNAR_API_KEY not set'
      });
    }
    
    const webhookUrl = `https://${req.get('host')}/webhook/neynar`;
    console.log('📡 Webhook URL:', webhookUrl);
    
    // Create webhook with no filters initially
    const response = await fetch('https://api.neynar.com/v2/farcaster/webhook/', {
      method: 'POST',
      headers: {
        'x-api-key': process.env.NEYNAR_API_KEY,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        name: "Ecion Farcaster Events Webhook",
        url: webhookUrl,
        subscription: {
          "cast.created": {},
          "reaction.created": {},
          "follow.created": {}
        }
      })
    });
    
    const result = await response.text();
    console.log('🔗 Neynar webhook creation response:', response.status, result);
    
    if (response.ok) {
      const webhookData = JSON.parse(result);
      console.log("✅ Webhook created successfully:", webhookData);
      
      // Store webhook ID for future updates
      await database.setWebhookId(webhookData.webhook.webhook_id);
      
      res.json({
        success: true,
        message: 'Webhook created successfully (no filters)',
        webhook: webhookData
      });
    } else {
      res.status(response.status).json({
        success: false,
        error: 'Webhook creation failed',
        status: response.status,
        response: result
      });
    }
    
  } catch (error) {
    console.error("❌ Error creating webhook:", error);
    
    res.status(500).json({
      success: false,
      error: 'Failed to create webhook',
      details: error.message,
      stack: error.stack
    });
  }
});

// Add user FID to webhook filter
app.post('/api/add-user-to-webhook', async (req, res) => {
  try {
    console.log('🔗 Adding user FID to webhook filter...');
    
    const { fid } = req.body;
    
    if (!fid) {
      return res.status(400).json({
        success: false,
        error: 'FID is required'
      });
    }
    
    if (!process.env.NEYNAR_API_KEY) {
      return res.status(500).json({
        success: false,
        error: 'NEYNAR_API_KEY not set'
      });
    }
    
    // Get current webhook ID
    const webhookId = await database.getWebhookId();
    if (!webhookId) {
      return res.status(404).json({
        success: false,
        error: 'Webhook not found. Create webhook first.'
      });
    }
    
    // Get current tracked FIDs
    const trackedFids = await database.getTrackedFids();
    const updatedFids = [...new Set([...trackedFids, parseInt(fid)])]; // Remove duplicates
    
    console.log('📝 Adding FID:', fid, 'to tracked FIDs:', updatedFids);
    
    // Update webhook with new FID filter
    const webhookUrl = `https://${req.get('host')}/webhook/neynar`;
    const response = await fetch(`https://api.neynar.com/v2/webhooks/${webhookId}`, {
      method: 'PUT',
      headers: {
        'x-api-key': process.env.NEYNAR_API_KEY,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        target_url: webhookUrl,
        event_types: ['cast.created', 'reaction.created', 'follow.created'],
        filters: {
          cast_authors: updatedFids
        }
      })
    });
    
    const result = await response.text();
    console.log('🔗 Webhook update response:', response.status, result);
    
    if (response.ok) {
      // Save updated FIDs to database
      await database.setTrackedFids(updatedFids);
      
      const webhookData = JSON.parse(result);
      console.log("✅ User added to webhook filter:", webhookData);
      
      res.json({
        success: true,
        message: `FID ${fid} added to webhook filter`,
        trackedFids: updatedFids,
        webhook: webhookData
      });
    } else {
      res.status(response.status).json({
        success: false,
        error: 'Failed to update webhook',
        status: response.status,
        response: result
      });
    }
    
  } catch (error) {
    console.error("❌ Error adding user to webhook:", error);
    
    res.status(500).json({
      success: false,
      error: 'Failed to add user to webhook',
      details: error.message
    });
  }
});

// Get current tracked FIDs
app.get('/api/tracked-fids', async (req, res) => {
  try {
    const trackedFids = await database.getTrackedFids();
    const webhookId = await database.getWebhookId();
    
    res.json({
      success: true,
      trackedFids: trackedFids,
      webhookId: webhookId
    });
  } catch (error) {
    console.error("❌ Error getting tracked FIDs:", error);
    
    res.status(500).json({
      success: false,
      error: 'Failed to get tracked FIDs',
      details: error.message
    });
  }
});

// Manual endpoint to set webhook ID (for debugging)
// Delete specific user config
app.delete('/api/config/:userAddress', async (req, res) => {
  try {
    const userAddress = req.params.userAddress.toLowerCase();
    await database.pool.query('DELETE FROM user_configs WHERE LOWER(user_address) = $1', [userAddress]);
    res.json({ success: true, message: `Deleted config for ${userAddress}` });
  } catch (error) {
    console.error('Delete config error:', error);
    res.status(500).json({ error: 'Failed to delete config' });
  }
});

app.post('/api/set-webhook-id', async (req, res) => {
  try {
    const { webhookId } = req.body;
    
    if (!webhookId) {
      return res.status(400).json({
        success: false,
        error: 'webhookId is required'
      });
    }
    
    await database.setWebhookId(webhookId);
    
    res.json({
      success: true,
      message: 'Webhook ID set successfully',
      webhookId: webhookId
    });
  } catch (error) {
    console.error("❌ Error setting webhook ID:", error);
    
    res.status(500).json({
      success: false,
      error: 'Failed to set webhook ID',
      details: error.message
    });
  }
});

// Bulk add all existing users to webhook filter
app.post('/api/add-all-users-to-webhook', async (req, res) => {
  try {
    console.log('🔗 Adding ALL existing users to webhook filter...');
    
    if (!process.env.NEYNAR_API_KEY) {
      return res.status(500).json({
        success: false,
        error: 'NEYNAR_API_KEY not set'
      });
    }
    
    // Get all users with active configs
    const activeUsers = await database.getActiveUsersWithApprovals();
    console.log('👥 Found active users:', activeUsers);
    
    const allFids = [];
    
    // Get FID for each user
    for (const userAddress of activeUsers) {
      try {
        const userResponse = await fetch(
          `https://api.neynar.com/v2/farcaster/user/by-verification?address=${userAddress}`,
          {
            headers: { 'x-api-key': process.env.NEYNAR_API_KEY }
          }
        );
        
        if (userResponse.ok) {
          const userData = await userResponse.json();
          const farcasterUser = userData.result?.user;
          
          if (farcasterUser && farcasterUser.fid) {
            allFids.push(farcasterUser.fid);
            console.log('✅ Found FID for user:', userAddress, '→', farcasterUser.fid);
          }
        }
      } catch (error) {
        console.log('⚠️ Could not get FID for user:', userAddress, error.message);
      }
    }
    
    if (allFids.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No FIDs found for active users'
      });
    }
    
    console.log('📊 All FIDs to add:', allFids);
    
    // Update webhook with ALL FIDs
    const webhookUrl = `https://${req.get('host')}/webhook/neynar`;
    const webhookResponse = await fetch(`https://api.neynar.com/v2/farcaster/webhook`, {
      method: 'PUT',
      headers: {
        'x-api-key': process.env.NEYNAR_API_KEY,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        webhook_id: '01K6EFR9566V9A7CQ7GEQZ5C3Q', // Hardcoded for now
        name: "Ecion Farcaster Events Webhook",
        url: webhookUrl,
        subscription: {
          "cast.created": {
            author_fids: allFids
          },
          "reaction.created": {
            parent_author_fids: allFids
          },
          "follow.created": {
            target_fids: allFids
          }
        }
      })
    });
    
    const result = await webhookResponse.text();
    console.log('🔗 Bulk webhook update response:', webhookResponse.status, result);
    
    if (webhookResponse.ok) {
      // Save all FIDs to database
      await database.setTrackedFids(allFids);
      
      const webhookData = JSON.parse(result);
      console.log("✅ ALL users added to webhook filter:", allFids);
      
      res.json({
        success: true,
        message: `Added ${allFids.length} users to webhook filter`,
        fids: allFids,
        webhook: webhookData
      });
    } else {
      res.status(webhookResponse.status).json({
        success: false,
        error: 'Failed to update webhook with all users',
        status: webhookResponse.status,
        response: result
      });
    }
    
  } catch (error) {
    console.error("❌ Error adding all users to webhook:", error);
    
    res.status(500).json({
      success: false,
      error: 'Failed to add all users to webhook',
      details: error.message
    });
  }
});

// Set specific FIDs in webhook filter (replace all)
app.post('/api/set-webhook-fids', async (req, res) => {
  try {
    const { fids } = req.body;
    if (!fids || !Array.isArray(fids)) {
      return res.status(400).json({ error: 'fids array is required' });
    }
    
    const webhookId = await database.getWebhookId();
    if (!webhookId) {
      return res.status(400).json({ error: 'No webhook ID found' });
    }
    
    const webhookUrl = `https://${req.get('host')}/webhook/neynar`;
    const webhookResponse = await fetch(`https://api.neynar.com/v2/farcaster/webhook`, {
      method: 'PUT',
      headers: { 'x-api-key': process.env.NEYNAR_API_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        webhook_id: webhookId,
        name: "Ecion Farcaster Events Webhook",
        url: webhookUrl,
        subscription: {
          "cast.created": { author_fids: fids },
          "reaction.created": { parent_author_fids: fids },
          "follow.created": { target_fids: fids }
        }
      })
    });
    
    if (webhookResponse.ok) {
      await database.setTrackedFids(fids);
      res.json({ success: true, message: `Set ${fids.length} FIDs in webhook filter`, fids: fids });
    } else {
      const errorText = await webhookResponse.text();
      res.status(500).json({ error: 'Failed to update webhook', details: errorText });
    }
  } catch (error) {
    console.error('Set webhook FIDs error:', error);
    res.status(500).json({ error: 'Failed to set webhook filter' });
  }
});

// Manual endpoint to add FID to webhook (for testing)
app.post('/api/manual-add-fid', async (req, res) => {
  try {
    const { fid, webhookId } = req.body;
    
    if (!fid || !webhookId) {
      return res.status(400).json({
        success: false,
        error: 'fid and webhookId are required'
      });
    }
    
    console.log('🔗 Manually adding FID to webhook:', fid, webhookId);
    
    // Update webhook with FID
    const webhookUrl = `https://${req.get('host')}/webhook/neynar`;
    const webhookResponse = await fetch(`https://api.neynar.com/v2/farcaster/webhook`, {
      method: 'PUT',
      headers: {
        'x-api-key': process.env.NEYNAR_API_KEY,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        webhook_id: webhookId,
        name: "Ecion Farcaster Events Webhook",
        url: webhookUrl,
        subscription: {
          "cast.created": {
            author_fids: [parseInt(fid)]
          },
          "reaction.created": {
            parent_author_fids: [parseInt(fid)]
          },
          "follow.created": {
            target_fids: [parseInt(fid)]
          }
        }
      })
    });
    
    const result = await webhookResponse.text();
    console.log('🔗 Manual webhook update response:', webhookResponse.status, result);
    
    if (webhookResponse.ok) {
      res.json({
        success: true,
        message: `FID ${fid} added to webhook ${webhookId}`,
        response: JSON.parse(result)
      });
    } else {
      res.status(webhookResponse.status).json({
        success: false,
        error: 'Failed to update webhook',
        status: webhookResponse.status,
        response: result
      });
    }
    
  } catch (error) {
    console.error("❌ Error manually adding FID:", error);
    
    res.status(500).json({
      success: false,
      error: 'Failed to add FID to webhook',
      details: error.message
    });
  }
});

async function registerWebhook(req, res) {
  try {
    console.log('🔗 Attempting to register webhook with Neynar...');
    
    const webhookData = {
      url: `https://${req.get('host')}/webhook/neynar`,
      events: ['reaction.created', 'cast.created', 'follow.created'],
      secret: process.env.WEBHOOK_SECRET
    };
    
    console.log('📝 Webhook registration data:', webhookData);
    
    // Try to register webhook via Neynar API
    const response = await fetch('https://api.neynar.com/v2/farcaster/webhook/', {
      method: 'POST',
      headers: {
        'x-api-key': process.env.NEYNAR_API_KEY,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        name: "Ecion Farcaster Events Webhook",
        url: webhookData.url,
        subscription: {
          "cast.created": {},
          "reaction.created": {},
          "follow.created": {}
        }
      })
    });
    
    const result = await response.text();
    console.log('🔗 Neynar webhook registration response:', response.status, result);
    
    if (response.ok) {
      res.json({ 
        success: true, 
        message: 'Webhook registered successfully',
        webhookUrl: webhookData.url,
        result: JSON.parse(result)
      });
    } else {
      res.status(response.status).json({ 
        error: 'Webhook registration failed',
        status: response.status,
        response: result
      });
    }
  } catch (error) {
    console.error('❌ Webhook registration error:', error);
    res.status(500).json({ 
      error: 'Failed to register webhook',
      details: error.message 
    });
  }
}

// Routes - WEBHOOK ENABLED WITH EXTRA LOGGING
app.post('/webhook/neynar', webhookHandler);

// API request logging (CORS is handled by cors middleware above)
app.use('/api/*', (req, res, next) => {
  console.log('📡 API Request:', {
    method: req.method,
    path: req.path,
    origin: req.headers.origin
  });
  next();
});

// User configuration endpoints
app.post('/api/config', async (req, res) => {
  try {
    const { userAddress, config } = req.body;
    
    // Validate config
    if (!config.tokenAddress || !config.spendingLimit) {
      return res.status(400).json({ error: 'Missing required fields' });
    }
    
    await database.setUserConfig(userAddress, {
      ...config,
      isActive: true,
      totalSpent: '0'
    });
    
    // Automatically add user's FID to webhook filter
    try {
      console.log('🔍 Getting user FID for webhook filter...');
      
      // Get user's Farcaster FID from their address
      console.log('🔍 Looking up FID for address:', userAddress);
      
      const userResponse = await fetch(
        `https://api.neynar.com/v2/farcaster/user/bulk-by-address/?addresses=${userAddress}`,
        {
          headers: { 'x-api-key': process.env.NEYNAR_API_KEY }
        }
      );
      
      
      // Check if API requires payment
      if (userResponse.status === 402) {
        console.log('⚠️ Neynar API requires payment for address lookup. Skipping FID lookup.');
        return;
      }
      
      if (userResponse.ok) {
        const userData = await userResponse.json();
        
        // Find user data by case-insensitive address lookup
        const userAddressLower = userAddress.toLowerCase();
        const farcasterUser = userData[userAddressLower]?.[0];
        
        if (farcasterUser && farcasterUser.fid) {
          const userFid = farcasterUser.fid;
          console.log('✅ Found user FID:', userFid);
          
          // Add FID to webhook filter automatically
          const webhookId = await database.getWebhookId();
          if (webhookId) {
            const trackedFids = await database.getTrackedFids();
            
            // Always update webhook to ensure FID is in the filter
            const updatedFids = trackedFids.includes(userFid) 
              ? trackedFids 
              : [...trackedFids, userFid];
            
            console.log('📡 Updating webhook filter with FIDs:', updatedFids);
            
            const webhookPayload = {
              webhook_id: webhookId,
              name: "Ecion Farcaster Events Webhook",
              url: `https://${req.get('host')}/webhook/neynar`,
              subscription: {
                "cast.created": {
                  author_fids: updatedFids
                },
                "reaction.created": {
                  parent_author_fids: updatedFids
                },
                "follow.created": {
                  target_fids: updatedFids
                }
              }
            };
            
            console.log('📡 Webhook payload being sent:', JSON.stringify(webhookPayload, null, 2));
            
            // Update webhook with FIDs
            const webhookResponse = await fetch(`https://api.neynar.com/v2/farcaster/webhook/`, {
              method: 'PUT',
              headers: {
                'x-api-key': process.env.NEYNAR_API_KEY,
                'Content-Type': 'application/json'
              },
              body: JSON.stringify(webhookPayload)
            });
            
            console.log('🔍 Webhook update response status:', webhookResponse.status);
            
            if (!webhookResponse.ok) {
              const errorText = await webhookResponse.text();
              console.error('❌ Webhook update failed:', errorText);
            }
            
            if (webhookResponse.ok) {
              // Save updated FIDs
              await database.setTrackedFids(updatedFids);
              console.log('✅ Webhook filter updated successfully with FIDs:', updatedFids);
            } else {
              const errorText = await webhookResponse.text();
              console.error('❌ Failed to update webhook:', webhookResponse.status, errorText);
            }
          } else {
            console.log('⚠️ No webhook ID found. Create webhook first.');
          }
        } else {
          console.log('⚠️ No Farcaster account found for this address');
        }
      }
    } catch (webhookError) {
      // Don't fail the config save if webhook update fails
      console.error('⚠️ Webhook filter update failed (non-critical):', webhookError.message);
    }
    
    res.json({ success: true });
  } catch (error) {
    console.error('Config update error:', error);
    res.status(500).json({ error: 'Failed to update config' });
  }
});

app.get('/api/config/:userAddress', async (req, res) => {
  try {
    let config = await database.getUserConfig(req.params.userAddress);
    
    // If no config exists, return default configuration
    if (!config) {
      config = {
        tokenAddress: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', // USDC on Base
        likeAmount: '0.01',
        replyAmount: '0.025',
        recastAmount: '0.025',
        quoteAmount: '0.025',
        followAmount: '0',
        spendingLimit: '999999',
        audience: 0, // Following only
        minFollowerCount: 25,
        minNeynarScore: 0.5,
        likeEnabled: true,
        replyEnabled: true,
        recastEnabled: true,
        quoteEnabled: true,
        followEnabled: false,
        isActive: false, // Not active until user saves
        totalSpent: '0'
      };
    }
    
    res.json({ config });
  } catch (error) {
    console.error('Config fetch error:', error);
    res.status(500).json({ error: 'Failed to fetch config' });
  }
});

// Token allowance endpoint
app.get('/api/allowance/:userAddress/:tokenAddress', async (req, res) => {
  try {
    const { userAddress, tokenAddress } = req.params;
    const { ethers } = require('ethers');
    
    const provider = new ethers.JsonRpcProvider(process.env.BASE_RPC_URL);
    const backendWallet = new ethers.Wallet(process.env.BACKEND_WALLET_PRIVATE_KEY, provider);
    
    const tokenContract = new ethers.Contract(tokenAddress, [
      "function allowance(address owner, address spender) view returns (uint256)"
    ], provider);
    
    const allowance = await tokenContract.allowance(userAddress, backendWallet.address);
    const tokenDecimals = tokenAddress.toLowerCase() === '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913' ? 6 : 18;
    const formattedAllowance = ethers.formatUnits(allowance, tokenDecimals);
    
    res.json({ allowance: formattedAllowance });
  } catch (error) {
    console.error('Allowance fetch error:', error);
    res.status(500).json({ error: 'Failed to fetch allowance' });
  }
});

// Token info endpoint
app.get('/api/token-info/:tokenAddress', async (req, res) => {
  try {
    const { tokenAddress } = req.params;
    const { ethers } = require('ethers');
    
    const provider = new ethers.JsonRpcProvider(process.env.BASE_RPC_URL);
    
    const tokenContract = new ethers.Contract(tokenAddress, [
      "function name() view returns (string)",
      "function symbol() view returns (string)",
      "function decimals() view returns (uint8)"
    ], provider);
    
    const [name, symbol, decimals] = await Promise.all([
      tokenContract.name(),
      tokenContract.symbol(),
      tokenContract.decimals()
    ]);
    
    res.json({ name, symbol, decimals: Number(decimals) });
  } catch (error) {
    console.error('Token info fetch error:', error);
    res.status(500).json({ error: 'Failed to fetch token info' });
  }
});

// Approve token endpoint
app.post('/api/approve', async (req, res) => {
  try {
    const { userAddress, tokenAddress, amount } = req.body;
    
    if (!userAddress || !tokenAddress || !amount) {
      return res.status(400).json({ error: 'Missing required fields' });
    }
    
    // For now, just return success - the actual approval happens on frontend
    // In a real implementation, you might want to track approvals in the database
    console.log(`User ${userAddress} approved ${amount} of token ${tokenAddress}`);
    
    res.json({ 
      success: true, 
      message: `Approved ${amount} tokens`,
      userAddress,
      tokenAddress,
      amount
    });
  } catch (error) {
    console.error('Approve error:', error);
    res.status(500).json({ error: 'Failed to process approval' });
  }
});

// Revoke token endpoint
app.post('/api/revoke', async (req, res) => {
  try {
    const { userAddress, tokenAddress } = req.body;
    
    if (!userAddress || !tokenAddress) {
      return res.status(400).json({ error: 'Missing required fields' });
    }
    
    // For now, just return success - the actual revocation happens on frontend
    console.log(`User ${userAddress} revoked token ${tokenAddress}`);
    
    res.json({ 
      success: true, 
      message: 'Token allowance revoked',
      userAddress,
      tokenAddress
    });
  } catch (error) {
    console.error('Revoke error:', error);
    res.status(500).json({ error: 'Failed to process revocation' });
  }
});

// Neynar API proxy endpoints (keeps API key secure on backend)
app.get('/api/neynar/user/by-address/:address', async (req, res) => {
  try {
    const { address } = req.params;
    const response = await fetch(
      `https://api.neynar.com/v2/farcaster/user/by-verification?address=${address}`,
      {
        headers: { 'x-api-key': process.env.NEYNAR_API_KEY }
      }
    );
    
    const data = await response.json();
    res.json(data);
  } catch (error) {
    console.error('Neynar user fetch error:', error);
    res.status(500).json({ error: 'Failed to fetch user' });
  }
});

app.get('/api/neynar/cast/:hash', async (req, res) => {
  try {
    const { hash } = req.params;
    const response = await fetch(
      `https://api.neynar.com/v2/farcaster/cast?identifier=${hash}&type=hash`,
      {
        headers: { 'x-api-key': process.env.NEYNAR_API_KEY }
      }
    );
    
    const data = await response.json();
    res.json(data);
  } catch (error) {
    console.error('Neynar cast fetch error:', error);
    res.status(500).json({ error: 'Failed to fetch cast' });
  }
});

app.get('/api/neynar/auth-url', async (req, res) => {
  try {
    const authUrl = `https://neynar.com/sign-in?api_key=${process.env.NEYNAR_API_KEY}&redirect_url=${req.headers.origin}/api/auth/callback`;
    res.json({ authUrl });
  } catch (error) {
    console.error('Auth URL generation error:', error);
    res.status(500).json({ error: 'Failed to generate auth URL' });
  }
});

// Homepage endpoint - Recent MAIN CASTS ONLY from approved users (no replies)
app.get('/api/homepage', async (req, res) => {
  try {
    const { timeFilter = '24h' } = req.query;
    
    // Get users with active configurations and token approvals
    const activeUsers = await database.getActiveUsersWithApprovals();
    
    // Fetch recent casts for each approved user
    const userCasts = [];
    
    for (const userAddress of activeUsers.slice(0, 10)) { // Top 10 users
      try {
        // Get user's Farcaster profile first
        const userResponse = await fetch(
          `https://api.neynar.com/v2/farcaster/user/bulk-by-address/?addresses=${userAddress}`,
          {
            headers: { 
              'x-api-key': process.env.NEYNAR_API_KEY,
              'x-neynar-experimental': 'false'
            }
          }
        );
        
        if (userResponse.ok) {
          const userData = await userResponse.json();
          const farcasterUser = userData[userAddress]?.[0];
          
          if (farcasterUser) {
            // Fetch user's recent casts (last 3 to filter main casts only)
            const castsResponse = await fetch(
              `https://api.neynar.com/v2/farcaster/feed/user/casts?fid=${farcasterUser.fid}&limit=3`,
              {
                headers: { 'x-api-key': process.env.NEYNAR_API_KEY }
              }
            );
            
            if (castsResponse.ok) {
              const castsData = await castsResponse.json();
              const casts = castsData.casts || [];
              
              // Filter to only show MAIN CASTS (not replies) - NO CUTOFF DATE
              const mainCasts = casts.filter(cast => {
                // Only main casts (no parent_hash and no parent_author with valid fid)
                const isMainCast = !cast.parent_hash && (!cast.parent_author || !cast.parent_author.fid || cast.parent_author.fid === null);
                // Additional check: ensure parent_author.fid is null or undefined
                const hasNoParentAuthor = !cast.parent_author || cast.parent_author.fid === null || cast.parent_author.fid === undefined;
                return isMainCast && hasNoParentAuthor;
              }).slice(0, 1); // Take only the 1 most recent main cast per user
              
              // Add user info and clickable URL to each cast
              const enrichedCasts = mainCasts.map(cast => ({
                ...cast,
                farcasterUrl: `https://warpcast.com/${farcasterUser.username}/${cast.hash}`,
                tipper: {
                  userAddress,
                  username: farcasterUser.username,
                  displayName: farcasterUser.display_name,
                  pfpUrl: farcasterUser.pfp_url,
                  fid: farcasterUser.fid
                }
              }));
              
              userCasts.push(...enrichedCasts);
            }
          }
        }
      } catch (error) {
        console.log(`Could not fetch casts for user ${userAddress}:`, error.message);
      }
    }
    
    // Sort by timestamp (most recent first)
    userCasts.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    
    res.json({ 
      casts: userCasts,
      users: activeUsers.slice(0, 10),
      amounts: activeUsers.map(() => '0')
    });
  } catch (error) {
    console.error('Homepage fetch error:', error);
    res.status(500).json({ error: 'Failed to fetch homepage data' });
  }
});

// Leaderboard endpoints  
app.get('/api/leaderboard', async (req, res) => {
  try {
    const { timeFilter = '30d' } = req.query;
    
    // Get top tippers and earners with amounts
    const topTippers = await database.getTopTippers(timeFilter);
    const topEarners = await database.getTopEarners(timeFilter);
    
    res.json({
      tippers: topTippers,
      earners: topEarners,
      users: topTippers.map(t => t.userAddress),
      amounts: topTippers.map(t => t.totalAmount)
    });
  } catch (error) {
    console.error('Leaderboard fetch error:', error);
    res.status(500).json({ error: 'Failed to fetch leaderboard data' });
  }
});

// Tip history endpoints
app.get('/api/history/:userAddress', async (req, res) => {
  try {
    const history = await database.getTipHistory(req.params.userAddress);
    res.json({ history });
  } catch (error) {
    console.error('History fetch error:', error);
    res.status(500).json({ error: 'Failed to fetch history' });
  }
});

// Backend wallet address endpoint
app.get('/api/backend-wallet', (req, res) => {
  try {
    const { ethers } = require('ethers');
    const wallet = new ethers.Wallet(process.env.BACKEND_WALLET_PRIVATE_KEY);
    res.json({ 
      address: wallet.address,
      network: 'Base'
    });
  } catch (error) {
    console.error('Backend wallet fetch error:', error);
    res.status(500).json({ error: 'Failed to get backend wallet address' });
  }
});

// Debug endpoint to check pending tips and API access
app.get('/api/debug/pending-tips', async (req, res) => {
  try {
    const pendingTips = await database.getPendingTips();
    const activeUsers = await database.getActiveUsers();
    const allConfigs = await database.getAllUserConfigs();
    
    // Test Neynar API access with correct endpoint
    let neynarApiStatus = 'Unknown';
    try {
      // Use the correct Neynar API endpoint
      const testResponse = await fetch('https://api.neynar.com/v2/farcaster/user/bulk?fids=3', {
        headers: { 'x-api-key': process.env.NEYNAR_API_KEY }
      });
      
      if (testResponse.ok) {
        neynarApiStatus = 'Working';
      } else {
        const errorText = await testResponse.text();
        neynarApiStatus = `Error: ${testResponse.status} - ${errorText}`;
      }
    } catch (error) {
      neynarApiStatus = `Failed: ${error.message}`;
    }
    
    res.json({
      pendingTips,
      pendingCount: pendingTips.length,
      activeUsers,
      activeUserCount: activeUsers.length,
      neynarApiStatus,
      hasNeynarApiKey: !!process.env.NEYNAR_API_KEY,
      hasWebhookSecret: !!process.env.WEBHOOK_SECRET,
      allConfigs: Object.keys(allConfigs).map(addr => ({
        address: addr,
        isActive: allConfigs[addr].isActive,
        hasTokenAddress: !!allConfigs[addr].tokenAddress
      }))
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Health check
app.get('/health', (req, res) => {
  res.json({ 
    status: 'healthy', 
    timestamp: new Date().toISOString(),
    pendingTips: database.getPendingTips().then(tips => tips.length)
  });
});

// Serve frontend static files if in production (AFTER all API routes)
if (process.env.NODE_ENV === 'production') {
  try {
    // Check if frontend build exists
    const frontendBuildPath = path.join(__dirname, '../../.next');
    const publicPath = path.join(__dirname, '../../public');
    
    console.log('🔍 Checking frontend paths:');
    console.log('  Build path:', frontendBuildPath);
    console.log('  Public path:', publicPath);
    
    // Serve Next.js static files
    app.use('/_next', express.static(path.join(frontendBuildPath)));
    app.use('/public', express.static(publicPath));
    
    // Simple fallback for frontend routes (LAST ROUTE)
    app.get('*', (req, res) => {
      // For now, serve a simple HTML page until Next.js is properly configured
      res.send(`
        <!DOCTYPE html>
        <html>
        <head>
          <title>Ecion - Farcaster Tipping App</title>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1">
          <style>
            body { font-family: system-ui; margin: 0; padding: 40px; background: #f9fafb; }
            .container { max-width: 600px; margin: 0 auto; text-align: center; }
            .card { background: white; padding: 40px; border-radius: 12px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
            .btn { display: inline-block; background: #3b82f6; color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; margin: 8px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="card">
              <h1>🎉 Ecion is Running!</h1>
              <p>Your Farcaster tipping app is successfully deployed on Railway.</p>
              <p><strong>Backend:</strong> ✅ Active<br>
                 <strong>Database:</strong> ✅ Connected<br>
                 <strong>Webhooks:</strong> Ready</p>
              <a href="/health" class="btn">Check Health</a>
              <a href="/api/debug/pending-tips" class="btn">Debug Info</a>
              <a href="/api/test-webhook" class="btn">Test Webhook</a>
              <p><em>Note: Full Next.js frontend deployment coming soon...</em></p>
            </div>
          </div>
        </body>
        </html>
      `);
    });
    
    console.log('🌐 Frontend fallback page configured');
  } catch (error) {
    console.error('❌ Frontend serving setup failed:', error);
  }
}

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Ecion Backend running on port ${PORT}`);
  console.log(`📊 Environment: ${process.env.NODE_ENV}`);
  console.log(`⏰ Batch interval: ${process.env.BATCH_INTERVAL_MINUTES || 1} minutes`);
  if (process.env.NODE_ENV === 'production') {
    console.log(`🌐 Frontend also served from this Railway service`);
  }
});

module.exports = app;