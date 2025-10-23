const express = require('express');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const webhookHandler = require('./webhook');
const batchTransferManager = require('./batchTransferManager');
const BlocklistService = require('./blocklistService');
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

// Initialize BlocklistService
let blocklistService;
try {
  const { ethers } = require('ethers');
  const rpcUrl = process.env.BASE_RPC_URL || process.env.RPC_URL || 'https://mainnet.base.org';
  console.log(`🔗 Using RPC URL: ${rpcUrl}`);
  
  const provider = new ethers.JsonRpcProvider(rpcUrl);
  blocklistService = new BlocklistService(provider, database);
  global.blocklistService = blocklistService; // Make globally available
  console.log('🚫 BlocklistService initialized successfully');
  console.log(`📊 BlocklistService status: ${blocklistService ? 'ACTIVE' : 'INACTIVE'}`);
} catch (error) {
  console.error('❌ Failed to initialize BlocklistService:', error);
  console.error('❌ Error details:', error.message);
  console.error('❌ Stack trace:', error.stack);
  global.blocklistService = null;
}

// Initialize batchTransferManager
console.log('🔄 Initializing batchTransferManager...');
console.log(`📊 batchTransferManager status: ${batchTransferManager ? 'ACTIVE' : 'INACTIVE'}`);
if (batchTransferManager) {
  console.log('✅ batchTransferManager initialized successfully');
} else {
  console.error('❌ batchTransferManager failed to initialize');
}

// Force deployment trigger
console.log('🚀 Backend deployment triggered at:', new Date().toISOString());
console.log('🔧 Railway deployment test - file modified');

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
// Store raw body for webhook signature verification
app.use('/webhook/neynar', express.raw({ type: 'application/json', verify: (req, res, buf) => {
  req.rawBody = buf;
}}));

// JSON parser for other routes
app.use(express.json());

// Instant tip processing enabled - no batch processor needed

// Using webhook-based event processing

// Webhook signature verification is handled in webhook.js (removed duplicate middleware)

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

// Parse webhook body as JSON
app.use('/webhook/neynar', express.json({ type: 'application/json' }));

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
            author_fids: allFids,           // Fires when user creates cast
            parent_author_fids: allFids     // Fires when someone replies/quotes user's cast
          },
          "reaction.created": {
            target_fids: allFids            // ✅ CORRECT: Likes/recasts on user's cast
          },
          "follow.created": {
            target_fids: allFids            // Fires when someone follows user
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
          "cast.created": { 
            author_fids: fids,
            parent_author_fids: fids
          },
          "reaction.created": { 
            target_fids: fids  // ✅ CORRECT
          },
          "follow.created": { 
            target_fids: fids
          }
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
            author_fids: [parseInt(fid)],
            parent_author_fids: [parseInt(fid)]
          },
          "reaction.created": {
            target_fids: [parseInt(fid)]  // ✅ CORRECT
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
app.post('/webhook/neynar', (req, res) => {
  console.log('🔔 WEBHOOK EVENT RECEIVED:', {
    type: req.body?.type,
    timestamp: new Date().toISOString(),
    hasData: !!req.body?.data,
    bodyKeys: req.body ? Object.keys(req.body) : 'no body',
    headers: Object.keys(req.headers).filter(h => h.toLowerCase().includes('neynar') || h.toLowerCase().includes('signature')),
    userAgent: req.headers['user-agent'],
    contentType: req.headers['content-type']
  });
  
  // Log webhook body (simplified to avoid rate limits)
  if (req.body && typeof req.body === 'object') {
    console.log('📋 Webhook body type:', req.body.type || 'unknown');
    console.log('📋 Webhook data keys:', req.body.data ? Object.keys(req.body.data) : 'no data');
  } else {
    console.log('📋 Webhook body is not JSON object');
  }
  
  webhookHandler(req, res);
});

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
      totalSpent: '0',
      lastActivity: Date.now(),
      lastAllowance: 0, // Initialize allowance tracking
      lastAllowanceCheck: 0
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
          
          // Fetch user's latest cast and make it earnable
          try {
            console.log('🔍 Fetching user\'s latest cast to make it earnable...');
            const castsResponse = await fetch(
              `https://api.neynar.com/v2/farcaster/feed/user/casts?fid=${userFid}&limit=3`,
              {
                headers: { 'x-api-key': process.env.NEYNAR_API_KEY }
              }
            );
            
            if (castsResponse.ok) {
              const castsData = await castsResponse.json();
              const casts = castsData.casts || [];
              
              // Find the latest main cast (not a reply)
              const latestMainCast = casts.find(cast => 
                !cast.parent_hash && 
                (!cast.parent_author || !cast.parent_author.fid || cast.parent_author.fid === null)
              );
              
              if (latestMainCast) {
                console.log(`📝 Making latest cast earnable: ${latestMainCast.hash}`);
                await database.addUserCast(userFid, latestMainCast.hash, true);
              } else {
                console.log('⚠️ No main cast found for user');
              }
            } else {
              console.log('⚠️ Could not fetch user casts:', castsResponse.status);
            }
          } catch (error) {
            console.log('⚠️ Error fetching user\'s latest cast:', error.message);
          }
          
          // Add FID to webhook filter automatically
          const webhookId = await database.getWebhookId();
          if (webhookId) {
            const trackedFids = await database.getTrackedFids();
            
            // Always ensure FID is in webhook filter (force update to sync with Neynar)
            const updatedFids = trackedFids.includes(userFid) 
              ? trackedFids 
              : [...trackedFids, userFid];
            
            console.log('📡 Ensuring FID is in webhook filter:', userFid);
            console.log('📡 Current tracked FIDs:', trackedFids);
            console.log('📡 FIDs to send to webhook:', updatedFids);
            
              const webhookPayload = {
                webhook_id: webhookId,
                name: "Ecion Farcaster Events Webhook",
                url: `https://${req.get('host')}/webhook/neynar`,
                subscription: {
                  "cast.created": {
                    author_fids: updatedFids,           // Fires when user creates a cast (to update latest earnable)
                    parent_author_fids: updatedFids     // Fires when someone replies/quotes user's cast (for tips)
                  },
                  "reaction.created": {
                    target_fids: updatedFids            // ✅ CORRECT: Fires when someone likes/recasts user's cast
                  },
                  "follow.created": {
                    target_fids: updatedFids            // Fires when someone follows user (for tips)
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
              
              if (webhookResponse.ok) {
                const responseData = await webhookResponse.json();
                console.log('🔍 Webhook update response data:', JSON.stringify(responseData, null, 2));
              }
              
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
    
    // Update webhook status based on allowance
    try {
      await updateUserWebhookStatus(userAddress);
    } catch (webhookStatusError) {
      console.error('⚠️ Webhook status update failed (non-critical):', webhookStatusError.message);
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
        followAmount: '0',
        spendingLimit: '999999',
        audience: 0, // Following only
        minFollowerCount: 25,
        minNeynarScore: 0.5,
        likeEnabled: true,
        replyEnabled: true,
        recastEnabled: true,
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

// Helper function to get token decimals
async function getTokenDecimals(tokenAddress) {
  try {
    // Known tokens
    if (tokenAddress.toLowerCase() === '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913') {
      return 6; // USDC
    }
    
    // Query contract for decimals
    const { ethers } = require('ethers');
    const provider = new ethers.JsonRpcProvider(process.env.BASE_RPC_URL);
    const tokenContract = new ethers.Contract(tokenAddress, [
      "function decimals() view returns (uint8)"
    ], provider);
    
    const decimals = await tokenContract.decimals();
    return Number(decimals);
  } catch (error) {
    console.log(`Could not get decimals for token ${tokenAddress}, defaulting to 18`);
    return 18; // Default to 18 decimals
  }
}

// Simple allowance check endpoint (for backward compatibility)
app.get('/api/check-allowance', async (req, res) => {
  try {
    const { userAddress, tokenAddress } = req.query;
    
    if (!userAddress || !tokenAddress) {
      return res.status(400).json({ error: 'userAddress and tokenAddress are required' });
    }
    
    const { ethers } = require('ethers');
    const provider = new ethers.JsonRpcProvider(process.env.BASE_RPC_URL);
    const ecionBatchAddress = process.env.ECION_BATCH_CONTRACT_ADDRESS || '0x2f47bcc17665663d1b63e8d882faa0a366907bb8';
    
    const tokenContract = new ethers.Contract(tokenAddress, [
      "function allowance(address owner, address spender) view returns (uint256)",
      "function balanceOf(address owner) view returns (uint256)"
    ], provider);
    
    // Get both allowance and balance in parallel
    const [allowance, balance] = await Promise.all([
      tokenContract.allowance(userAddress, ecionBatchAddress),
      tokenContract.balanceOf(userAddress)
    ]);
    
    const tokenDecimals = await getTokenDecimals(tokenAddress);
    const allowanceAmount = parseFloat(ethers.formatUnits(allowance, tokenDecimals));
    const balanceAmount = parseFloat(ethers.formatUnits(balance, tokenDecimals));
    
    // Get user config to calculate min tip
    const userConfig = await database.getUserConfig(userAddress);
    let minTipAmount = 0;
    if (userConfig) {
      const likeAmount = parseFloat(userConfig.likeAmount || '0');
      const recastAmount = parseFloat(userConfig.recastAmount || '0');
      const replyAmount = parseFloat(userConfig.replyAmount || '0');
      minTipAmount = likeAmount + recastAmount + replyAmount;
    }
    
    res.json({
      success: true,
      userAddress,
      tokenAddress,
      allowance: allowanceAmount,
      balance: balanceAmount,
      minTipAmount: minTipAmount,
      hasSufficientAllowance: allowanceAmount >= minTipAmount,
      hasSufficientBalance: balanceAmount >= minTipAmount,
      canAfford: (allowanceAmount >= minTipAmount) && (balanceAmount >= minTipAmount)
    });
  } catch (error) {
    console.error('Error checking allowance:', error);
    res.status(500).json({ error: 'Failed to check allowance' });
  }
});

// Combined allowance and balance endpoint - Single blockchain call for both
app.get('/api/allowance-balance/:userAddress/:tokenAddress', async (req, res) => {
  try {
    const { userAddress, tokenAddress } = req.params;
    const { ethers } = require('ethers');
    
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
    const formattedAllowance = ethers.formatUnits(allowance, tokenDecimals);
    const formattedBalance = ethers.formatUnits(balance, tokenDecimals);
    
    console.log(`📊 Combined check: User ${userAddress} - Allowance: ${formattedAllowance}, Balance: ${formattedBalance} (${tokenAddress})`);
    
    res.json({ 
      allowance: formattedAllowance,
      balance: formattedBalance,
      tokenAddress: tokenAddress,
      decimals: tokenDecimals
    });
  } catch (error) {
    console.error('Allowance/Balance fetch error:', error);
    res.status(500).json({ error: 'Failed to fetch allowance and balance' });
  }
});

// Token allowance endpoint - Always returns blockchain allowance (what user approved)
app.get('/api/allowance/:userAddress/:tokenAddress', async (req, res) => {
  try {
    const { userAddress, tokenAddress } = req.params;
    const { ethers } = require('ethers');
    
    const provider = new ethers.JsonRpcProvider(process.env.BASE_RPC_URL);
    
    // Check allowance for ECION BATCH CONTRACT, not backend wallet!
    const ecionBatchAddress = process.env.ECION_BATCH_CONTRACT_ADDRESS || '0x2f47bcc17665663d1b63e8d882faa0a366907bb8';
    
    const tokenContract = new ethers.Contract(tokenAddress, [
      "function allowance(address owner, address spender) view returns (uint256)"
    ], provider);
    
    const allowance = await tokenContract.allowance(userAddress, ecionBatchAddress);
    const tokenDecimals = await getTokenDecimals(tokenAddress);
    const formattedAllowance = ethers.formatUnits(allowance, tokenDecimals);
    
    console.log(`📊 Blockchain allowance: User ${userAddress} approved ${formattedAllowance} tokens (${tokenAddress}) to EcionBatch contract ${ecionBatchAddress}`);
    
    res.json({ 
      allowance: formattedAllowance,
      tokenAddress: tokenAddress,
      decimals: tokenDecimals
    });
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
    
    console.log(`User ${userAddress} approved ${amount} of token ${tokenAddress}`);
    
    // Update blocklist status after token approval
    if (global.blocklistService) {
      const result = await global.blocklistService.updateUserBlocklistStatus(userAddress);
      console.log(`🔄 Blocklist update result for ${userAddress}:`, result);
    }
    
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
    
    console.log(`User ${userAddress} revoked token ${tokenAddress}`);
    
    // Update blocklist status after token revocation
    if (global.blocklistService) {
      const result = await global.blocklistService.updateUserBlocklistStatus(userAddress);
      console.log(`🔄 Blocklist update result for ${userAddress}:`, result);
    }
    
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

// Get user's Neynar score
app.get('/api/neynar/user/score/:fid', async (req, res) => {
  try {
    const { fid } = req.params;
    const response = await fetch(
      `https://api.neynar.com/v2/farcaster/user/bulk?fids=${fid}`,
      {
        headers: { 'x-api-key': process.env.NEYNAR_API_KEY }
      }
    );
    
    if (response.ok) {
      const data = await response.json();
      const user = data.users?.[0];
      res.json({ 
        score: user?.score || 0,
        fid: user?.fid,
        username: user?.username
      });
    } else {
      res.status(500).json({ error: 'Failed to fetch user score' });
    }
  } catch (error) {
    console.error('Neynar score fetch error:', error);
    res.status(500).json({ error: 'Failed to fetch Neynar score' });
  }
});

// ===== DYNAMIC FID MANAGEMENT SYSTEM =====

// Store user address to FID mapping
const userFidMap = new Map();

// Get FID from user address
async function getUserFid(userAddress) {
  // Validate address format
  if (!userAddress || !userAddress.startsWith('0x') || userAddress.length !== 42) {
    console.log(`⚠️ Invalid address format for FID lookup: ${userAddress} - skipping`);
    return null;
  }
  
  // Check cache first
  if (userFidMap.has(userAddress.toLowerCase())) {
    return userFidMap.get(userAddress.toLowerCase());
  }
  
  try {
    // Get FID from Neynar API
    const response = await fetch(
      `https://api.neynar.com/v2/farcaster/user/bulk-by-address/?addresses=${userAddress}`,
      {
        headers: { 
          'x-api-key': process.env.NEYNAR_API_KEY,
          'x-neynar-experimental': 'false'
        }
      }
    );
    
    if (response.ok) {
      const data = await response.json();
      console.log(`🔍 Neynar API response for ${userAddress}:`, JSON.stringify(data, null, 2));
      
      // Handle both response formats
      let user = null;
      if (data.users && data.users.length > 0) {
        user = data.users[0];
      } else if (data[userAddress.toLowerCase()] && data[userAddress.toLowerCase()].length > 0) {
        user = data[userAddress.toLowerCase()][0];
      }
      
      if (user?.fid) {
        // Cache the FID
        userFidMap.set(userAddress.toLowerCase(), user.fid);
        console.log(`✅ Found FID ${user.fid} for address ${userAddress}`);
        return user.fid;
      } else {
        console.log(`⚠️ No Farcaster account found for address: ${userAddress}`);
        console.log(`📊 API returned:`, data);
      }
    } else if (response.status === 402) {
      console.log(`⚠️ Neynar API requires payment for address lookup - skipping ${userAddress}`);
    } else {
      const errorText = await response.text();
      console.log(`⚠️ Neynar API error for ${userAddress}: ${response.status} - ${errorText}`);
    }
  } catch (error) {
    console.log(`⚠️ Error getting FID for ${userAddress}: ${error.message} - skipping`);
  }
  
  return null;
}

// Helper function to get user address from FID
async function getUserAddressFromFid(fid) {
  try {
    console.log(`🔍 Looking up address for FID: ${fid}`);
    
    const response = await fetch(`https://api.neynar.com/v2/farcaster/user/bulk?fids=${fid}`, {
      headers: {
        'x-api-key': process.env.NEYNAR_API_KEY
      }
    });
    
    console.log(`📡 Neynar API response status: ${response.status}`);
    
    if (response.ok) {
      const data = await response.json();
      console.log(`📋 Neynar API response:`, JSON.stringify(data, null, 2));
      
      const user = data.users?.[0];
      if (user) {
        const address = user.verified_addresses?.eth_addresses?.[0] || null;
        console.log(`✅ Found address for FID ${fid}: ${address}`);
        return address;
      } else {
        console.log(`❌ No user found for FID ${fid}`);
      }
    } else {
      const errorText = await response.text();
      console.error(`❌ Neynar API error: ${response.status} - ${errorText}`);
    }
  } catch (error) {
    console.error('❌ Error fetching user address from FID:', error);
  }
  
  return null;
}

// Check if user has sufficient allowance for at least one tip
async function checkUserAllowanceForWebhook(userAddress) {
  try {
    // Validate address format
    if (!userAddress || !userAddress.startsWith('0x') || userAddress.length !== 42) {
      console.log(`⚠️ Invalid address format: ${userAddress} - skipping`);
      return false;
    }
    
    const { ethers } = require('ethers');
    const provider = new ethers.JsonRpcProvider(process.env.BASE_RPC_URL);
    const ecionBatchAddress = process.env.ECION_BATCH_CONTRACT_ADDRESS || '0x2f47bcc17665663d1b63e8d882faa0a366907bb8';
    
    // Get user config
    const userConfig = await database.getUserConfig(userAddress);
    if (!userConfig) {
      console.log(`⚠️ No config found for ${userAddress} - skipping`);
      return false;
    }
    
    const tokenAddress = userConfig.tokenAddress || '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
    
    // Get token decimals with error handling
    let decimals;
    try {
      const tokenContract = new ethers.Contract(tokenAddress, [
        "function decimals() view returns (uint8)"
      ], provider);
      decimals = await tokenContract.decimals();
    } catch (decimalsError) {
      console.log(`⚠️ Could not get decimals for token ${tokenAddress} - using default 6`);
      decimals = 6; // Default to USDC decimals
    }
    
    // Get allowance with error handling
    let allowanceAmount = 0;
    try {
      const allowanceContract = new ethers.Contract(tokenAddress, [
        "function allowance(address owner, address spender) view returns (uint256)"
      ], provider);
      const allowance = await allowanceContract.allowance(userAddress, ecionBatchAddress);
      allowanceAmount = parseFloat(ethers.formatUnits(allowance, decimals));
    } catch (allowanceError) {
      console.log(`⚠️ Could not get allowance for ${userAddress} - assuming 0`);
      allowanceAmount = 0;
    }
    
    // Calculate total tip amount (like + recast + reply)
    const likeAmount = parseFloat(userConfig.likeAmount || '0');
    const recastAmount = parseFloat(userConfig.recastAmount || '0');
    const replyAmount = parseFloat(userConfig.replyAmount || '0');
    const minTipAmount = likeAmount + recastAmount + replyAmount;
    
    const hasAllowance = allowanceAmount >= minTipAmount;
    console.log(`🔍 Allowance check: ${userAddress} - allowance: ${allowanceAmount}, total tip: ${minTipAmount} (like: ${likeAmount}, recast: ${recastAmount}, reply: ${replyAmount}), has allowance: ${hasAllowance}`);
    
    return hasAllowance;
  } catch (error) {
    console.log(`⚠️ Error checking allowance for ${userAddress}: ${error.message} - assuming no allowance`);
    return false;
  }
}

// Add FID to webhook filter
async function addFidToWebhook(fid) {
  try {
    const webhookId = await database.getWebhookId();
    if (!webhookId) {
      console.log('❌ No webhook ID found');
      return false;
    }
    
    const trackedFids = await database.getTrackedFids();
    if (trackedFids.includes(fid)) {
      console.log(`✅ FID ${fid} already in webhook filter`);
      return true;
    }
    
    const updatedFids = [...trackedFids, fid];
    
    const webhookResponse = await fetch(`https://api.neynar.com/v2/farcaster/webhook`, {
      method: 'PUT',
      headers: {
        'x-api-key': process.env.NEYNAR_API_KEY,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        webhook_id: webhookId,
        name: "Ecion Farcaster Events Webhook",
        subscription: {
          "cast.created": { 
            author_fids: updatedFids,
            parent_author_fids: updatedFids
          },
          "reaction.created": { 
            target_fids: updatedFids
          },
          "follow.created": { 
            target_fids: updatedFids
          }
        }
      })
    });
    
    if (webhookResponse.ok) {
      await database.setTrackedFids(updatedFids);
      console.log(`✅ Added FID ${fid} to webhook filter`);
      return true;
    } else {
      console.error('❌ Failed to add FID to webhook:', await webhookResponse.text());
      return false;
    }
  } catch (error) {
    console.error('❌ Error adding FID to webhook:', error);
    return false;
  }
}

// Remove FID from webhook filter
async function removeFidFromWebhook(fid) {
  try {
    const webhookId = await database.getWebhookId();
    if (!webhookId) {
      console.log('❌ No webhook ID found');
      return false;
    }
    
    const trackedFids = await database.getTrackedFids();
    if (!trackedFids.includes(fid)) {
      console.log(`✅ FID ${fid} not in webhook filter`);
      return true;
    }
    
    const updatedFids = trackedFids.filter(f => f !== fid);
    
    const webhookResponse = await fetch(`https://api.neynar.com/v2/farcaster/webhook`, {
      method: 'PUT',
      headers: {
        'x-api-key': process.env.NEYNAR_API_KEY,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        webhook_id: webhookId,
        name: "Ecion Farcaster Events Webhook",
        subscription: {
          "cast.created": { 
            author_fids: updatedFids,
            parent_author_fids: updatedFids
          },
          "reaction.created": { 
            target_fids: updatedFids
          },
          "follow.created": { 
            target_fids: updatedFids
          }
        }
      })
    });
    
    if (webhookResponse.ok) {
      await database.setTrackedFids(updatedFids);
      console.log(`✅ Removed FID ${fid} from webhook filter`);
      return true;
    } else {
      console.error('❌ Failed to remove FID from webhook:', await webhookResponse.text());
      return false;
    }
  } catch (error) {
    console.error('❌ Error removing FID from webhook:', error);
    return false;
  }
}

// Update user's webhook status based on allowance
async function updateUserWebhookStatus(userAddress) {
  try {
    // Validate address format
    if (!userAddress || !userAddress.startsWith('0x') || userAddress.length !== 42) {
      console.log(`⚠️ Invalid address format for webhook update: ${userAddress} - skipping`);
      return false;
    }
    
    // Check if user is in blocklist first (instant check, zero API calls)
    if (batchTransferManager && batchTransferManager.isUserBlocked && batchTransferManager.isUserBlocked(userAddress)) {
      console.log(`⏭️ Skipping webhook update for ${userAddress} - user is in blocklist (no Neynar calls needed)`);
      return true; // Return true because blocklist handles this efficiently
    }
    
    const fid = await getUserFid(userAddress);
    if (!fid) {
      console.log(`⚠️ No FID found for address: ${userAddress} - skipping webhook update`);
      return false;
    }
    
    const hasAllowance = await checkUserAllowanceForWebhook(userAddress);
    
    if (hasAllowance) {
      const success = await addFidToWebhook(fid);
      if (success) {
        console.log(`✅ User ${userAddress} (FID: ${fid}) has sufficient allowance - added to webhook`);
      }
    } else {
      console.log(`✅ User ${userAddress} (FID: ${fid}) has insufficient allowance - blocklist will handle filtering`);
    }
    
    return true;
  } catch (error) {
    console.log(`⚠️ Error updating webhook status for ${userAddress}: ${error.message} - skipping`);
    return false;
  }
}

// OLD PERIODIC CLEANUP REMOVED - Now using allowance sync system that updates webhooks every 3 hours

// Send Farcaster notification using stored notification tokens
async function sendFarcasterNotification(recipientAddress, title, message, targetUrl = "https://ecion.vercel.app") {
  try {
    // Get notification token for user
    const tokenData = await database.getNotificationToken(recipientAddress);
    if (!tokenData) {
      console.log(`⏭️ No notification token found for user ${recipientAddress} - user needs to add mini app first`);
      return false;
    }
    
    const { token, notification_url, fid } = tokenData;
    
    // Generate unique notification ID for deduplication
    const notificationId = `ecion-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    console.log(`📱 Sending Farcaster notification to ${recipientAddress} (FID: ${fid}) via ${notification_url}`);
    
    // Send notification using Farcaster's direct API
    const response = await fetch(notification_url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        notificationId: notificationId,
        title: title,
        body: message,
        targetUrl: targetUrl,
        tokens: [token]
      })
    });
    
    if (response.ok) {
      const result = await response.json();
      console.log(`✅ Farcaster notification sent to ${recipientAddress} (FID: ${fid}): ${title}`, result);
      
      // Check delivery status
      if (result.successfulTokens && result.successfulTokens.length > 0) {
        console.log(`📱 Notification delivered successfully to ${result.successfulTokens.length} token(s)`);
        return true;
      }
      
      if (result.invalidTokens && result.invalidTokens.length > 0) {
        console.log(`🚫 ${result.invalidTokens.length} invalid token(s) - deactivating`);
        await database.deactivateNotificationToken(recipientAddress, fid);
        return false;
      }
      
      if (result.rateLimitedTokens && result.rateLimitedTokens.length > 0) {
        console.log(`⏳ ${result.rateLimitedTokens.length} token(s) rate limited - will retry later`);
        return false;
      }
      
      // If no successful deliveries and no errors, something went wrong
      console.log(`⚠️ No successful deliveries for ${recipientAddress} - user may have notifications disabled`);
      return false;
    } else {
      const errorText = await response.text();
      console.log(`❌ Failed to send Farcaster notification to ${recipientAddress}: ${response.status} - ${errorText}`);
      return false;
    }
  } catch (error) {
    console.log(`⚠️ Error sending Farcaster notification to ${recipientAddress}: ${error.message}`);
    return false;
  }
}

// Check if user has notification tokens (has added mini app)
async function hasNotificationTokens(userAddress) {
  try {
    const tokenData = await database.getNotificationToken(userAddress);
    return tokenData !== null;
  } catch (error) {
    console.error('Error checking notification tokens:', error);
    return false;
  }
}

// Legacy function for backward compatibility (now uses Farcaster API)
async function sendNeynarNotification(recipientFid, title, message, targetUrl = "https://ecion.vercel.app") {
  // Get user address from FID
  const userAddress = await getUserAddressFromFid(recipientFid);
  if (!userAddress) {
    console.log(`⚠️ Could not find user address for FID ${recipientFid}`);
    return false;
  }
  
  // Check if user has notification tokens first
  const hasTokens = await hasNotificationTokens(userAddress);
  if (!hasTokens) {
    console.log(`⏭️ User ${userAddress} (FID: ${recipientFid}) hasn't added mini app - skipping notification`);
    return false;
  }
  
  return await sendFarcasterNotification(userAddress, title, message, targetUrl);
}

// Send notification to multiple users using Farcaster API
async function sendBulkNotification(targetAddresses, title, message, targetUrl = "https://ecion.vercel.app") {
  try {
    // Get all notification tokens
    const allTokens = await database.getAllNotificationTokens();
    
    // Filter tokens for target addresses
    const targetTokens = allTokens.filter(token => 
      targetAddresses.includes(token.user_address)
    );
    
    if (targetTokens.length === 0) {
      console.log(`⏭️ No notification tokens found for target addresses - skipping bulk notification`);
      return false;
    }
    
    console.log(`📱 Sending bulk notification to ${targetTokens.length} users`);
    
    // Group tokens by notification URL (different clients might use different URLs)
    const tokensByUrl = {};
    targetTokens.forEach(token => {
      if (!tokensByUrl[token.notification_url]) {
        tokensByUrl[token.notification_url] = [];
      }
      tokensByUrl[token.notification_url].push(token.token);
    });
    
    // Send notifications to each URL
    const results = [];
    for (const [url, tokens] of Object.entries(tokensByUrl)) {
      // Generate unique notification ID for deduplication
      const notificationId = `ecion-bulk-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          notificationId: notificationId,
          title: title,
          body: message,
          targetUrl: targetUrl,
          tokens: tokens
        })
      });
      
      if (response.ok) {
        const result = await response.json();
        console.log(`✅ Bulk notification sent to ${url}: ${tokens.length} tokens`, result);
        results.push({ url, success: true, result });
        
        // Handle invalid tokens
        if (result.invalidTokens && result.invalidTokens.length > 0) {
          console.log(`🚫 ${result.invalidTokens.length} invalid tokens from ${url} - deactivating`);
          // Note: We can't easily map invalid tokens back to users without more complex logic
        }
      } else {
        const errorText = await response.text();
        console.log(`❌ Failed to send bulk notification to ${url}: ${errorText}`);
        results.push({ url, success: false, error: errorText });
      }
    }
    
    const successCount = results.filter(r => r.success).length;
    console.log(`📊 Bulk notification results: ${successCount}/${Object.keys(tokensByUrl).length} URLs successful`);
    
    return successCount > 0;
  } catch (error) {
    console.log(`⚠️ Error sending bulk notification: ${error.message}`);
    return false;
  }
}

// Update allowance in database (no API calls needed)
async function updateDatabaseAllowance(userAddress, allowanceAmount) {
  try {
    const userConfig = await database.getUserConfig(userAddress);
    if (userConfig) {
      const previousAllowance = userConfig.lastAllowance || 0;
      
      userConfig.lastAllowance = allowanceAmount;
      userConfig.lastAllowanceCheck = Date.now();
      userConfig.lastActivity = Date.now();
      await database.setUserConfig(userAddress, userConfig);
      console.log(`💾 Updated database allowance for ${userAddress}: ${previousAllowance} → ${allowanceAmount}`);
      
      // Check if user should be removed from webhook
      const likeAmount = parseFloat(userConfig.likeAmount || '0');
      const recastAmount = parseFloat(userConfig.recastAmount || '0');
      const replyAmount = parseFloat(userConfig.replyAmount || '0');
      const minTipAmount = likeAmount + recastAmount + replyAmount;
      
      if (allowanceAmount < minTipAmount) {
        console.log(`🚫 User ${userAddress} allowance ${allowanceAmount} < total tip ${minTipAmount} (like: ${likeAmount}, recast: ${recastAmount}, reply: ${replyAmount}) - blocklist will handle filtering`);
          
          // Send allowance empty notification ONLY if:
          // 1. Previous allowance was > 0 (user had allowance before)
          // 2. Current allowance is 0 (now empty)
          // 3. Haven't sent notification yet for this allowance drop
          if (previousAllowance > 0 && allowanceAmount === 0 && !userConfig.allowanceEmptyNotificationSent) {
            const fid = await getUserFid(userAddress);
            if (fid) {
              await sendNeynarNotification(
                fid,
                "Allowance Empty",
                "Approve more USDC to continue tip your audience!",
                "https://ecion.vercel.app"
              );
            }
            
            // Mark notification as sent
            userConfig.allowanceEmptyNotificationSent = true;
            await database.setUserConfig(userAddress, userConfig);
            console.log(`📧 Sent allowance empty notification to ${userAddress} (one-time)`);
          } else if (previousAllowance > 0 && allowanceAmount === 0) {
            console.log(`⏭️ Skipping allowance empty notification for ${userAddress} - already sent`);
          }
        }
      } else {
        console.log(`✅ User ${userAddress} allowance ${allowanceAmount} >= min tip ${minTipAmount} - keeping in webhook`);
        const fid = await getUserFid(userAddress);
        if (fid) {
          await addFidToWebhook(fid);
          
          // Reset notification flag if user approved more tokens (allowance went from 0 to >0)
          if (previousAllowance === 0 && allowanceAmount > 0) {
            userConfig.allowanceEmptyNotificationSent = false;
            await database.setUserConfig(userAddress, userConfig);
            console.log(`🔄 Reset allowance empty notification flag for ${userAddress} - user approved more tokens`);
          }
        }
      }
  } catch (error) {
    console.log(`⚠️ Error updating database allowance for ${userAddress}: ${error.message}`);
  }
}

// Get token symbol from token address
async function getTokenSymbol(tokenAddress) {
  try {
    const { ethers } = require('ethers');
    const provider = new ethers.JsonRpcProvider(process.env.BASE_RPC_URL);
    
    const tokenContract = new ethers.Contract(tokenAddress, [
      "function symbol() view returns (string)"
    ], provider);
    
    const symbol = await tokenContract.symbol();
    return symbol;
  } catch (error) {
    console.log(`⚠️ Could not get symbol for token ${tokenAddress}, using default`);
    // Default symbols for common tokens
    const defaultSymbols = {
      '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913': 'USDC',
      '0x4200000000000000000000000000000000000006': 'WETH',
      '0x50c5725949a6f0c72e6c4a641f24049a917db0cb': 'DAI'
    };
    return defaultSymbols[tokenAddress.toLowerCase()] || 'TOKEN';
  }
}

// Send daily earnings notification to users who earned tips in last 24 hours
async function sendDailyEarningsNotifications() {
  try {
    console.log('📊 Starting daily earnings notification process...');
    
    // Check if we already sent notifications today
    const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD format
    const lastNotificationDate = await database.getConfig('lastDailyNotificationDate');
    
    if (lastNotificationDate === today) {
      console.log('📊 Daily earnings notifications already sent today, skipping');
      return;
    }
    
    // Get tips from last 24 hours (exactly 24 hours ago to now)
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const tips = await database.getTipsSince(twentyFourHoursAgo);
    
    if (!tips || tips.length === 0) {
      console.log('📊 No tips found in last 24 hours - no notifications to send');
      // Still mark as sent to avoid checking again today
      await database.setConfig('lastDailyNotificationDate', today);
      return;
    }
    
    // Group tips by recipient and token for exact daily calculation
    const dailyEarningsByUser = {};
    const dailyTippedByUser = {};
    
    for (const tip of tips) {
      const recipientAddress = tip.toAddress;
      const senderAddress = tip.fromAddress;
      const tokenAddress = tip.tokenAddress;
      const amount = parseFloat(tip.amount);
      
      // Track earnings (received tips)
      if (!dailyEarningsByUser[recipientAddress]) {
        dailyEarningsByUser[recipientAddress] = {};
      }
      
      if (!dailyEarningsByUser[recipientAddress][tokenAddress]) {
        dailyEarningsByUser[recipientAddress][tokenAddress] = 0;
      }
      
      dailyEarningsByUser[recipientAddress][tokenAddress] += amount;
      
      // Track tipped amounts (sent tips)
      if (!dailyTippedByUser[senderAddress]) {
        dailyTippedByUser[senderAddress] = {};
      }
      
      if (!dailyTippedByUser[senderAddress][tokenAddress]) {
        dailyTippedByUser[senderAddress][tokenAddress] = 0;
      }
      
      dailyTippedByUser[senderAddress][tokenAddress] += amount;
    }
    
    console.log(`📊 Found daily earnings for ${Object.keys(dailyEarningsByUser).length} users`);
    
    // Send notifications only to users who earned 0.1+ tokens in the last 24 hours
    let notificationsSent = 0;
    let usersSkipped = 0;
    const MINIMUM_DAILY_EARNINGS = 0.1; // Minimum 0.1 tokens to get notification
    
    for (const [userAddress, tokenEarnings] of Object.entries(dailyEarningsByUser)) {
      try {
        // Calculate total daily earnings across all tokens
        let totalDailyEarnings = 0;
        for (const amount of Object.values(tokenEarnings)) {
          totalDailyEarnings += amount;
        }
        
        // Skip if daily earnings is less than 0.1 tokens
        if (totalDailyEarnings < MINIMUM_DAILY_EARNINGS) {
          usersSkipped++;
          console.log(`⏭️ Skipping ${userAddress} - daily earnings ${totalDailyEarnings} < ${MINIMUM_DAILY_EARNINGS}`);
          continue;
        }
        
        // Get user's FID
        const fid = await getUserFid(userAddress);
        if (!fid) {
          console.log(`⚠️ No FID found for user ${userAddress}, skipping notification`);
          continue;
        }
        
        // Create daily earnings message with exact amounts
        let dailyEarningsMessage = "";
        const tokenEarningsList = [];
        
        for (const [tokenAddress, amount] of Object.entries(tokenEarnings)) {
          const symbol = await getTokenSymbol(tokenAddress);
          const formattedAmount = amount.toFixed(6).replace(/\.?0+$/, ''); // Remove trailing zeros
          tokenEarningsList.push(`${formattedAmount} ${symbol}`);
        }
        
        // Add tipped amounts if user also sent tips
        const userTippedAmounts = dailyTippedByUser[userAddress] || {};
        const tokenTippedList = [];
        
        for (const [tokenAddress, amount] of Object.entries(userTippedAmounts)) {
          const symbol = await getTokenSymbol(tokenAddress);
          const formattedAmount = amount.toFixed(6).replace(/\.?0+$/, ''); // Remove trailing zeros
          tokenTippedList.push(`${formattedAmount} ${symbol}`);
        }
        
        // Create the message
        if (tokenTippedList.length > 0) {
          dailyEarningsMessage = `you earned ${tokenEarningsList.join(" and ")} and tipped ${tokenTippedList.join(" and ")}`;
        } else {
          dailyEarningsMessage = `you earned ${tokenEarningsList.join(" and ")}`;
        }
        
        // Send notification
        const success = await sendNeynarNotification(
          fid,
          "You earned from Ecion in the last 24 hours",
          dailyEarningsMessage,
          "https://ecion.vercel.app"
        );
        
        if (success) {
          notificationsSent++;
          console.log(`✅ Sent daily earnings notification to ${userAddress} (FID: ${fid}) - Daily Total: ${totalDailyEarnings}`);
        }
        
        // Small delay to avoid rate limits
        await new Promise(resolve => setTimeout(resolve, 100));
        
      } catch (error) {
        console.log(`⚠️ Error sending daily earnings notification to ${userAddress}: ${error.message}`);
      }
    }
    
    // Mark notifications as sent for today
    await database.setConfig('lastDailyNotificationDate', today);
    
    console.log(`📊 Daily earnings notifications completed: ${notificationsSent} sent, ${usersSkipped} skipped (minimum ${MINIMUM_DAILY_EARNINGS} tokens required)`);
    
  } catch (error) {
    console.log(`⚠️ Error in daily earnings notification process: ${error.message}`);
  }
}

// Schedule daily earnings notifications (run every 24 hours at 9 AM UTC)
const DAILY_NOTIFICATION_HOUR = 9; // 9 AM UTC
setInterval(async () => {
  const now = new Date();
  if (now.getUTCHours() === DAILY_NOTIFICATION_HOUR) {
    await sendDailyEarningsNotifications();
  }
}, 60 * 60 * 1000); // Check every hour

// Test endpoint for daily earnings notifications
app.post('/api/test-daily-earnings', async (req, res) => {
  try {
    await sendDailyEarningsNotifications();
    res.json({ 
      success: true,
      message: 'Daily earnings notifications sent'
    });
  } catch (error) {
    console.error('Test daily earnings error:', error);
    res.status(500).json({ error: 'Failed to send daily earnings notifications' });
  }
});

// Test endpoint to check daily earnings calculation without sending notifications
app.get('/api/test-daily-earnings-calculation', async (req, res) => {
  try {
    console.log('📊 Testing daily earnings calculation...');
    
    // Get tips from last 24 hours
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const tips = await database.getTipsSince(twentyFourHoursAgo);
    
    if (!tips || tips.length === 0) {
      return res.json({
        success: true,
        message: 'No tips found in last 24 hours',
        dailyEarnings: {},
        totalUsers: 0,
        usersAboveThreshold: 0
      });
    }
    
    // Group tips by recipient and token for exact daily calculation
    const dailyEarningsByUser = {};
    
    for (const tip of tips) {
      const recipientAddress = tip.toAddress;
      const tokenAddress = tip.tokenAddress;
      const amount = parseFloat(tip.amount);
      
      if (!dailyEarningsByUser[recipientAddress]) {
        dailyEarningsByUser[recipientAddress] = {};
      }
      
      if (!dailyEarningsByUser[recipientAddress][tokenAddress]) {
        dailyEarningsByUser[recipientAddress][tokenAddress] = 0;
      }
      
      dailyEarningsByUser[recipientAddress][tokenAddress] += amount;
    }
    
    // Calculate totals and check thresholds
    const MINIMUM_DAILY_EARNINGS = 0.1;
    let usersAboveThreshold = 0;
    const results = {};
    
    for (const [userAddress, tokenEarnings] of Object.entries(dailyEarningsByUser)) {
      let totalDailyEarnings = 0;
      const tokenBreakdown = {};
      
      for (const [tokenAddress, amount] of Object.entries(tokenEarnings)) {
        totalDailyEarnings += amount;
        tokenBreakdown[tokenAddress] = amount;
      }
      
      results[userAddress] = {
        totalDailyEarnings,
        tokenBreakdown,
        aboveThreshold: totalDailyEarnings >= MINIMUM_DAILY_EARNINGS
      };
      
      if (totalDailyEarnings >= MINIMUM_DAILY_EARNINGS) {
        usersAboveThreshold++;
      }
    }
    
    res.json({
      success: true,
      message: 'Daily earnings calculation completed',
      dailyEarnings: results,
      totalUsers: Object.keys(dailyEarningsByUser).length,
      usersAboveThreshold,
      minimumThreshold: MINIMUM_DAILY_EARNINGS,
      timeRange: {
        from: twentyFourHoursAgo.toISOString(),
        to: new Date().toISOString()
      }
    });
    
  } catch (error) {
    console.error('Test daily earnings calculation error:', error);
    res.status(500).json({ error: 'Failed to calculate daily earnings' });
  }
});

// Sync all users' allowances from blockchain to database
async function syncAllUsersAllowancesFromBlockchain() {
  try {
    console.log('🔄 Starting blockchain allowance sync for all users...');
    
    // Get all active users with configurations
    const activeUsers = await database.getActiveUsersWithApprovals();
    
    if (!activeUsers || activeUsers.length === 0) {
      console.log('📊 No active users found for allowance sync');
      return { success: true, message: 'No active users found', synced: 0, errors: 0 };
    }
    
    console.log(`📊 Found ${activeUsers.length} active users to sync`);
    
    const { ethers } = require('ethers');
    const provider = new ethers.JsonRpcProvider(process.env.BASE_RPC_URL);
    const ecionBatchAddress = process.env.ECION_BATCH_CONTRACT_ADDRESS || '0x2f47bcc17665663d1b63e8d882faa0a366907bb8';
    
    let syncedCount = 0;
    let errorCount = 0;
    const results = [];
    
    for (const userAddress of activeUsers) {
      try {
        // Get user config to determine token address
        const userConfig = await database.getUserConfig(userAddress);
        if (!userConfig) {
          console.log(`⚠️ No config found for ${userAddress}, skipping`);
          continue;
        }
        
        const tokenAddress = userConfig.tokenAddress || '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
        
        // Get token decimals
        const tokenContract = new ethers.Contract(tokenAddress, [
          "function decimals() view returns (uint8)"
        ], provider);
        
        const decimals = await tokenContract.decimals();
        
        // Get allowance from blockchain
        const allowanceContract = new ethers.Contract(tokenAddress, [
          "function allowance(address owner, address spender) view returns (uint256)"
        ], provider);
        
        const allowance = await allowanceContract.allowance(userAddress, ecionBatchAddress);
        const allowanceAmount = parseFloat(ethers.formatUnits(allowance, decimals));
        
        // Update database with blockchain allowance
        await updateDatabaseAllowance(userAddress, allowanceAmount);
        
        // Update webhook FID status after allowance update
        try {
          await updateUserWebhookStatus(userAddress);
          console.log(`🔗 Updated webhook status for ${userAddress} after allowance sync`);
        } catch (webhookError) {
          console.log(`⚠️ Webhook update failed for ${userAddress}: ${webhookError.message}`);
        }
        
        syncedCount++;
        results.push({
          userAddress,
          tokenAddress,
          blockchainAllowance: allowanceAmount,
          previousAllowance: userConfig.lastAllowance || 0,
          synced: true,
          webhookUpdated: true
        });
        
        console.log(`✅ Synced ${userAddress}: ${userConfig.lastAllowance || 0} → ${allowanceAmount} ${tokenAddress}`);
        
        // Small delay to avoid rate limits
        await new Promise(resolve => setTimeout(resolve, 50));
        
      } catch (error) {
        errorCount++;
        console.log(`⚠️ Error syncing ${userAddress}: ${error.message}`);
        results.push({
          userAddress,
          error: error.message,
          synced: false
        });
      }
    }
    
    console.log(`🔄 Blockchain allowance sync completed: ${syncedCount} synced, ${errorCount} errors`);
    
    return {
      success: true,
      message: 'Blockchain allowance sync completed',
      synced: syncedCount,
      errors: errorCount,
      totalUsers: activeUsers.length,
      results: results
    };
    
  } catch (error) {
    console.log(`⚠️ Error in blockchain allowance sync: ${error.message}`);
    return {
      success: false,
      message: 'Blockchain allowance sync failed',
      error: error.message
    };
  }
}

// Test endpoint to sync all users' allowances from blockchain
app.post('/api/sync-allowances-from-blockchain', async (req, res) => {
  try {
    const result = await syncAllUsersAllowancesFromBlockchain();
    res.json(result);
  } catch (error) {
    console.error('Sync allowances error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to sync allowances from blockchain' 
    });
  }
});

// Schedule allowance sync (run every 12 hours)
setInterval(async () => {
  console.log('🔄 Running scheduled allowance sync...');
  await syncAllUsersAllowancesFromBlockchain();
}, 12 * 60 * 60 * 1000); // Every 12 hours

// SIMPLIFIED SYSTEM: No real-time monitoring needed
// Webhook FIDs are updated only when:
// 1. User approves/revokes allowance (handled in updateDatabaseAllowance)
// 2. Bulk sync every 12 hours (handled in syncAllUsersAllowancesFromBlockchain)
// 3. Homepage filtering already removes users with insufficient allowance

// COMPREHENSIVE USER ALLOWANCE SYNC - Updates all users' database allowance from blockchain
app.post('/api/sync-all-users-allowance', async (req, res) => {
  try {
    console.log('🔄 Starting comprehensive user allowance sync...');
    
    const { ethers } = require('ethers');
    const provider = new ethers.JsonRpcProvider(process.env.BASE_RPC_URL);
    const ecionBatchAddress = process.env.ECION_BATCH_CONTRACT_ADDRESS || '0x2f47bcc17665663d1b63e8d882faa0a366907bb8';
    
    // Get all users with active configurations
    const activeUsers = await database.getActiveUsersWithApprovals();
    console.log(`📊 Found ${activeUsers.length} active users to sync`);
    
    const results = [];
    let syncedCount = 0;
    let errorCount = 0;
    let removedFromHomepageCount = 0;
    
    for (const userAddress of activeUsers) {
      try {
        console.log(`\n🔍 Syncing user: ${userAddress}`);
        
        // Get user config to determine token address
        const userConfig = await database.getUserConfig(userAddress);
        if (!userConfig || !userConfig.tokenAddress) {
          console.log(`⚠️ No config or token address for ${userAddress} - skipping`);
          continue;
        }
        
        const tokenAddress = userConfig.tokenAddress;
        console.log(`💰 Token: ${tokenAddress}`);
        
        // Get current blockchain allowance
        const tokenContract = new ethers.Contract(tokenAddress, [
          "function allowance(address owner, address spender) view returns (uint256)"
        ], provider);
        
        const allowance = await tokenContract.allowance(userAddress, ecionBatchAddress);
        const tokenDecimals = await getTokenDecimals(tokenAddress);
        const currentBlockchainAllowance = parseFloat(ethers.formatUnits(allowance, tokenDecimals));
        
        console.log(`📊 Blockchain allowance: ${currentBlockchainAllowance}`);
        
        // No need to update database - we only use blockchain allowance for decisions
        
        // Calculate total tip amount (like + recast + reply)
        const likeAmount = parseFloat(userConfig.likeAmount || '0');
        const recastAmount = parseFloat(userConfig.recastAmount || '0');
        const replyAmount = parseFloat(userConfig.replyAmount || '0');
        const minTipAmount = likeAmount + recastAmount + replyAmount;
        
        console.log(`💰 Total tip amount: ${minTipAmount} (like: ${likeAmount}, recast: ${recastAmount}, reply: ${replyAmount})`);
        
        // Check if user should be added to blocklist
        if (currentBlockchainAllowance < minTipAmount) {
          console.log(`❌ User has insufficient allowance - adding to blocklist`);
          
          // Add to blocklist using BlocklistService
          if (global.blocklistService) {
            global.blocklistService.addToBlocklist(userAddress, 'insufficient_allowance');
            console.log(`🚫 Added ${userAddress} to blocklist - insufficient allowance`);
          }
          
          // Remove from homepage
          await removeUserFromHomepageCache(userAddress);
          removedFromHomepageCount++;
          console.log(`🏠 Removed from homepage cache`);
        } else {
          console.log(`✅ User has sufficient allowance - removing from blocklist if present`);
          
          // Remove from blocklist if user was blocked
          if (global.blocklistService) {
            const wasRemoved = global.blocklistService.removeFromBlocklist(userAddress);
            console.log(`🔄 Blocklist removal result for ${userAddress}: ${wasRemoved ? 'removed' : 'not in blocklist'}`);
          }
          
          // Ensure user is in webhook
          const fid = await getUserFid(userAddress);
          if (fid) {
            await addFidToWebhook(fid);
            console.log(`🔗 Ensured FID ${fid} is in webhook`);
          }
        }
        
        results.push({
          userAddress,
          tokenAddress,
          previousAllowance: userConfig.lastAllowance || 0,
          currentAllowance: currentBlockchainAllowance,
          minTipAmount,
          isActive: currentBlockchainAllowance >= minTipAmount,
          webhookUpdated: true,
          homepageUpdated: currentBlockchainAllowance < minTipAmount
        });
        
        syncedCount++;
        console.log(`✅ Synced ${userAddress} successfully`);
        
        // Small delay to avoid rate limits
        await new Promise(resolve => setTimeout(resolve, 100));
        
      } catch (error) {
        console.error(`❌ Error syncing ${userAddress}:`, error.message);
        errorCount++;
        
        results.push({
          userAddress,
          error: error.message,
          synced: false
        });
      }
    }
    
    console.log(`\n🎉 Comprehensive sync completed!`);
    console.log(`📊 Results: ${syncedCount} synced, ${errorCount} errors`);
    console.log(`🏠 Removed from homepage: ${removedFromHomepageCount}`);
    
    res.json({
      success: true,
      message: 'Comprehensive user allowance sync completed',
      totalUsers: activeUsers.length,
      syncedCount,
      errorCount,
      removedFromHomepageCount,
      results
    });
    
  } catch (error) {
    console.error('❌ Error in comprehensive sync:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to sync user allowances',
      details: error.message
    });
  }
});

// Manual endpoint to update webhook FIDs for all users (when needed)
app.post('/api/update-webhook-fids', async (req, res) => {
  try {
    console.log('🔗 Manually updating webhook FIDs for all users...');
    
    const activeUsers = await database.getActiveUsersWithApprovals();
    let updatedCount = 0;
    let errorCount = 0;
    
    for (const userAddress of activeUsers) {
      try {
        await updateUserWebhookStatus(userAddress);
        updatedCount++;
        
        // Small delay to avoid rate limits
        await new Promise(resolve => setTimeout(resolve, 100));
      } catch (error) {
        console.log(`⚠️ Error updating webhook for ${userAddress}: ${error.message}`);
        errorCount++;
      }
    }
    
    res.json({
      success: true,
      message: 'Webhook FIDs updated for all users',
      updatedCount,
      errorCount,
      totalUsers: activeUsers.length
    });
    
  } catch (error) {
    console.error('Error updating webhook FIDs:', error);
    res.status(500).json({ 
      error: 'Failed to update webhook FIDs',
      details: error.message
    });
  }
});

// Test endpoint to check FID and webhook system status
app.get('/api/test-fid-webhook-system', async (req, res) => {
  try {
    console.log('🔍 Testing FID and webhook system...');
    
    // Test database functions
    const webhookId = await database.getWebhookId();
    const trackedFids = await database.getTrackedFids();
    const activeUsers = await database.getActiveUsersWithApprovals();
    
    // Test a sample user
    let sampleUserTest = null;
    if (activeUsers && activeUsers.length > 0) {
      const sampleUser = activeUsers[0];
      const userConfig = await database.getUserConfig(sampleUser);
      const fid = await getUserFid(sampleUser);
      const hasAllowance = await checkUserAllowanceForWebhook(sampleUser);
      
      sampleUserTest = {
        userAddress: sampleUser,
        fid: fid,
        hasAllowance: hasAllowance,
        userConfig: userConfig ? {
          lastAllowance: userConfig.lastAllowance,
          lastActivity: userConfig.lastActivity,
          likeAmount: userConfig.likeAmount,
          recastAmount: userConfig.recastAmount,
          replyAmount: userConfig.replyAmount
        } : null
      };
    }
    
    res.json({
      success: true,
      systemStatus: {
        webhookId: webhookId,
        trackedFidsCount: trackedFids ? trackedFids.length : 0,
        trackedFids: trackedFids,
        activeUsersCount: activeUsers ? activeUsers.length : 0,
        sampleUserTest: sampleUserTest
      },
      message: 'FID and webhook system status retrieved'
    });
    
  } catch (error) {
    console.error('Test FID webhook system error:', error);
    res.status(500).json({ 
      error: 'Failed to test FID webhook system',
      details: error.message
    });
  }
});

// Test endpoint to check FID and webhook system status
app.get('/api/test-fid-webhook-system', async (req, res) => {
  try {
    console.log('🔍 Testing FID and webhook system...');
    
    // Test database functions
    const webhookId = await database.getWebhookId();
    const trackedFids = await database.getTrackedFids();
    const activeUsers = await database.getActiveUsersWithApprovals();
    
    // Test a sample user
    let sampleUserTest = null;
    if (activeUsers && activeUsers.length > 0) {
      const sampleUser = activeUsers[0];
      const userConfig = await database.getUserConfig(sampleUser);
      const fid = await getUserFid(sampleUser);
      const hasAllowance = await checkUserAllowanceForWebhook(sampleUser);
      
      sampleUserTest = {
        userAddress: sampleUser,
        fid: fid,
        hasAllowance: hasAllowance,
        userConfig: userConfig ? {
          lastAllowance: userConfig.lastAllowance,
          lastActivity: userConfig.lastActivity,
          likeAmount: userConfig.likeAmount,
          recastAmount: userConfig.recastAmount,
          replyAmount: userConfig.replyAmount
        } : null
      };
    }
    
    res.json({
      success: true,
      systemStatus: {
        webhookId: webhookId,
        trackedFidsCount: trackedFids ? trackedFids.length : 0,
        trackedFids: trackedFids,
        activeUsersCount: activeUsers ? activeUsers.length : 0,
        sampleUserTest: sampleUserTest
      },
      message: 'FID and webhook system status retrieved'
    });
    
  } catch (error) {
    console.error('Test FID webhook system error:', error);
    res.status(500).json({ 
      error: 'Failed to test FID webhook system',
      details: error.message
    });
  }
});

// Test endpoint for bulk notifications
app.post('/api/test-bulk-notification', async (req, res) => {
  try {
    const { targetFids = [], title, message, targetUrl } = req.body;
    
    if (!title || !message) {
      return res.status(400).json({ error: 'Title and message are required' });
    }
    
    // Convert FIDs to addresses
    const targetAddresses = [];
    for (const fid of targetFids) {
      const address = await getUserAddressFromFid(fid);
      if (address) {
        targetAddresses.push(address);
      }
    }
    
    if (targetAddresses.length === 0) {
      return res.status(400).json({ error: 'No valid addresses found for provided FIDs' });
    }
    
    const result = await sendBulkNotification(
      targetAddresses,
      title,
      message,
      targetUrl || 'https://ecion.vercel.app'
    );
    
    res.json({ 
      success: result,
      message: 'Bulk notification sent',
      targetFids: targetFids.length,
      targetAddresses: targetAddresses.length
    });
  } catch (error) {
    console.error('Test bulk notification error:', error);
    res.status(500).json({ error: 'Failed to send bulk notification' });
  }
});

// Test endpoint for single notification
app.post('/api/test-notification', async (req, res) => {
  try {
    const { userAddress, title, message, targetUrl } = req.body;
    
    if (!userAddress || !title || !message) {
      return res.status(400).json({ error: 'userAddress, title, and message are required' });
    }
    
    // Check if user has notification tokens
    const hasTokens = await hasNotificationTokens(userAddress);
    if (!hasTokens) {
      return res.status(400).json({ 
        error: 'User has not added mini app - no notification tokens found',
        hasNotificationTokens: false
      });
    }
    
    const result = await sendFarcasterNotification(
      userAddress,
      title,
      message,
      targetUrl || 'https://ecion.vercel.app'
    );
    
    res.json({ 
      success: result,
      message: result ? 'Notification sent successfully' : 'Failed to send notification',
      hasNotificationTokens: true
    });
  } catch (error) {
    console.error('Test notification error:', error);
    res.status(500).json({ error: 'Failed to send notification' });
  }
});

// ===== END DYNAMIC FID MANAGEMENT SYSTEM =====

// NEW: Remove user from homepage cache
async function removeUserFromHomepageCache(userAddress) {
  try {
    // Clear any cached homepage data for this user
    // This ensures user's cast won't appear in homepage
    console.log(`🗑️ Clearing homepage cache for ${userAddress}`);
    
    // The homepage already filters by database allowance, so this is mainly for logging
    // In the future, you could implement actual cache clearing here
    return true;
  } catch (error) {
    console.error('❌ Error clearing homepage cache:', error);
    return false;
  }
}

// Import simple update allowance function
const updateAllowanceSimple = require('./update-allowance-simple');

// Import Farcaster webhook handler
const handleFarcasterWebhook = require('./farcaster-webhook');

// NEW: Update allowance endpoint for instant database/webhook updates after user approves/revokes
// This endpoint should ONLY be called after actual approve/revoke transactions
app.post('/api/update-allowance', async (req, res) => {
  await updateAllowanceSimple(req, res, database, batchTransferManager, blocklistService);
});

// Farcaster notification webhook endpoint
app.post('/webhook/farcaster', async (req, res) => {
  try {
    await handleFarcasterWebhook(req, res, database);
  } catch (error) {
    console.error('❌ Webhook handler error:', error);
    res.status(500).json({ error: 'Webhook processing failed' });
  }
});

// Test webhook endpoint (for testing without signature verification)
app.post('/webhook/farcaster-test', async (req, res) => {
  try {
    console.log('🧪 Test webhook received:', req.body);
    
    const { event, notificationDetails, fid } = req.body;
    
    if (!fid) {
      return res.status(400).json({ error: 'FID is required' });
    }
    
    // Get user address from FID
    const userAddress = await getUserAddressFromFid(fid);
    if (!userAddress) {
      console.log(`⚠️ Could not find user address for FID ${fid}`);
      return res.status(200).json({ success: true, message: 'FID not found' });
    }
    
    switch (event) {
      case 'miniapp_added':
        console.log(`✅ Mini app added by user ${userAddress} (FID: ${fid})`);
        
        // If notification details are provided, save the token
        if (notificationDetails) {
          const { token, url } = notificationDetails;
          await database.saveNotificationToken(userAddress, fid, token, url);
          console.log(`💾 Saved notification token for ${userAddress}`);
        }
        break;
        
      case 'miniapp_removed':
        console.log(`❌ Mini app removed by user ${userAddress} (FID: ${fid})`);
        await database.deactivateNotificationToken(userAddress, fid);
        console.log(`🗑️ Deactivated notification token for ${userAddress}`);
        break;
        
      case 'notifications_enabled':
        console.log(`🔔 Notifications enabled by user ${userAddress} (FID: ${fid})`);
        
        if (notificationDetails) {
          const { token, url } = notificationDetails;
          await database.saveNotificationToken(userAddress, fid, token, url);
          console.log(`💾 Saved notification token for ${userAddress}`);
        }
        break;
        
      case 'notifications_disabled':
        console.log(`🔕 Notifications disabled by user ${userAddress} (FID: ${fid})`);
        await database.deactivateNotificationToken(userAddress, fid);
        console.log(`🗑️ Deactivated notification token for ${userAddress}`);
        break;
        
      default:
        console.log(`❓ Unknown event: ${event}`);
    }
    
    res.status(200).json({ success: true, message: 'Webhook processed successfully' });
  } catch (error) {
    console.error('❌ Test webhook error:', error);
    res.status(500).json({ error: 'Webhook processing failed' });
  }
});

// Check notification status for a user
app.get('/api/notification-status/:userAddress', async (req, res) => {
  try {
    const { userAddress } = req.params;
    
    const hasTokens = await hasNotificationTokens(userAddress);
    const tokenData = await database.getNotificationToken(userAddress);
    
    res.json({
      success: true,
      hasNotificationTokens: hasTokens,
      tokenData: tokenData ? {
        fid: tokenData.fid,
        isActive: true,
        createdAt: tokenData.createdAt || 'unknown'
      } : null,
      message: hasTokens ? 'User has enabled notifications' : 'User needs to add mini app to enable notifications'
    });
  } catch (error) {
    console.error('Error checking notification status:', error);
    res.status(500).json({ error: 'Failed to check notification status' });
  }
});
app.get('/api/homepage', async (req, res) => {
  try {
    const { timeFilter = '24h', page = 1, limit = 50 } = req.query;
    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    
    // Get users with active configurations and token approvals
    const activeUsers = await database.getActiveUsersWithApprovals();
    
    // Filter out blocklisted users FIRST (before any blockchain calls)
    const nonBlockedUsers = activeUsers.filter(userAddress => {
      if (global.blocklistService && global.blocklistService.isBlocked(userAddress)) {
        console.log(`⏭️ Skipping ${userAddress} - user is in blocklist (insufficient allowance)`);
        return false;
      }
      return true;
    });
    
    console.log(`🏠 Homepage: ${activeUsers.length} total users, ${nonBlockedUsers.length} non-blocked users`);
    
    const { ethers } = require('ethers');
    const provider = new ethers.JsonRpcProvider(process.env.BASE_RPC_URL);
    const ecionBatchAddress = process.env.ECION_BATCH_CONTRACT_ADDRESS || '0x2f47bcc17665663d1b63e8d882faa0a366907bb8';
    
    // Get allowance and cast for each NON-BLOCKED user only
    const usersWithAllowance = [];
    
    for (const userAddress of nonBlockedUsers) {
      try {
        
        // Get user's configured token address
        const userConfig = await database.getUserConfig(userAddress);
        const tokenAddress = userConfig?.tokenAddress || '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913'; // Default to USDC
        const tokenDecimals = await getTokenDecimals(tokenAddress);
        
        const tokenContract = new ethers.Contract(tokenAddress, [
          "function allowance(address owner, address spender) view returns (uint256)"
        ], provider);
        
        // Get REAL blockchain allowance (most accurate)
        const allowance = await tokenContract.allowance(userAddress, ecionBatchAddress);
        const allowanceAmount = parseFloat(ethers.formatUnits(allowance, tokenDecimals));
        console.log(`🔗 Using REAL blockchain allowance for ${userAddress}: ${allowanceAmount}`);
        
        // Skip users with EXACTLY 0 allowance (not 0.1 or 0.2, must be 0.000000)
        if (allowanceAmount === 0) {
          console.log(`⏭️ Skipping ${userAddress} - blockchain allowance is exactly 0`);
          continue;
        }
        
        // Get user config to check minimum tip amounts (already declared above)
        if (!userConfig) {
          console.log(`⏭️ Skipping ${userAddress} - no user config found`);
          continue;
        }
        
        // Calculate minimum tip amount (smallest of like, recast, reply)
        const likeAmount = parseFloat(userConfig.likeAmount || '0');
        const recastAmount = parseFloat(userConfig.recastAmount || '0');
        const replyAmount = parseFloat(userConfig.replyAmount || '0');
        
        // Calculate total tip amount (like + recast + reply)
        const minTipAmount = likeAmount + recastAmount + replyAmount;
        
        // Skip if REAL blockchain allowance is less than total tip amount
        if (allowanceAmount < minTipAmount) {
          console.log(`⏭️ Skipping ${userAddress} - REAL blockchain allowance ${allowanceAmount} < total tip ${minTipAmount} (like: ${likeAmount}, recast: ${recastAmount}, reply: ${replyAmount})`);
          continue;
        }
        
        console.log(`✅ User ${userAddress} - REAL blockchain allowance ${allowanceAmount} >= total tip ${minTipAmount} - keeping cast`);
        
        // Get user's Farcaster profile
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
            // Get user's latest earnable cast from DATABASE (not API - faster!)
            const eligibleCasts = await database.getEligibleCasts(farcasterUser.fid);
            
            if (eligibleCasts.length > 0) {
              const castHash = eligibleCasts[0];
              
              // Fetch cast details from Neynar
              const castResponse = await fetch(
                `https://api.neynar.com/v2/farcaster/cast?identifier=${castHash}&type=hash`,
                {
                  headers: { 'x-api-key': process.env.NEYNAR_API_KEY }
                }
              );
              
              if (castResponse.ok) {
                const castData = await castResponse.json();
                const cast = castData.cast;
                
                // User config already fetched above for allowance checking
                
                // Calculate total engagement value (like + recast + reply) for USDC only
                const isUSDC = userConfig?.tokenAddress?.toLowerCase() === '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913';
                let totalEngagementValue = 0;
                
                if (isUSDC && userConfig) {
                  const likeAmount = parseFloat(userConfig.likeAmount || '0');
                  const recastAmount = parseFloat(userConfig.recastAmount || '0');
                  const replyAmount = parseFloat(userConfig.replyAmount || '0');
                  totalEngagementValue = likeAmount + recastAmount + replyAmount;
                  
                  console.log(`💰 User ${userAddress} amounts:`, {
                    likeAmount,
                    recastAmount,
                    replyAmount,
                    totalEngagementValue,
                    rawConfig: {
                      like: userConfig.likeAmount,
                      recast: userConfig.recastAmount,
                      reply: userConfig.replyAmount
                    }
                  });
                }
                
                usersWithAllowance.push({
                  cast: {
                    ...cast,
                    farcasterUrl: `https://farcaster.xyz/${farcasterUser.username}/${cast.hash}`,
                    tipper: {
                      userAddress,
                      username: farcasterUser.username,
                      displayName: farcasterUser.display_name,
                      pfpUrl: farcasterUser.pfp_url,
                      fid: farcasterUser.fid,
                      totalEngagementValue: isUSDC ? totalEngagementValue : null, // Only for USDC users
                      likeAmount: isUSDC ? parseFloat(userConfig?.likeAmount || '0') : undefined,
                      recastAmount: isUSDC ? parseFloat(userConfig?.recastAmount || '0') : undefined,
                      replyAmount: isUSDC ? parseFloat(userConfig?.replyAmount || '0') : undefined,
                      criteria: userConfig ? {
                        audience: userConfig.audience,
                        minFollowerCount: userConfig.minFollowerCount,
                        minNeynarScore: userConfig.minNeynarScore
                      } : null
                    }
                  },
                  allowance: allowanceAmount,
                  totalEngagementValue: isUSDC ? totalEngagementValue : 0,
                  timestamp: new Date(cast.timestamp).getTime(),
                  userAddress
                });
              }
            }
          }
        }
      } catch (error) {
        console.log(`Could not process user ${userAddress}:`, error.message);
      }
    }
    
    // Sort by: 1) Total engagement value (highest total tips first), 2) Timestamp
    usersWithAllowance.sort((a, b) => {
      // Primary sort: Total engagement value (like + recast + reply combined)
      // User offering $0.045 total shows before user offering $0.033 total
      if (Math.abs(a.totalEngagementValue - b.totalEngagementValue) > 0.0001) {
        return b.totalEngagementValue - a.totalEngagementValue;
      }
      // Secondary sort: Newest casts first (if same total value)
      return b.timestamp - a.timestamp;
    });
    
    // Paginate results
    const paginatedResults = usersWithAllowance.slice((pageNum - 1) * limitNum, pageNum * limitNum);
    
    res.json({ 
      casts: paginatedResults.map(r => r.cast),
      users: paginatedResults.map(r => r.userAddress),
      amounts: paginatedResults.map(r => r.allowance.toString()),
      pagination: {
        page: pageNum,
        limit: limitNum,
        totalUsers: usersWithAllowance.length,
        totalPages: Math.ceil(usersWithAllowance.length / limitNum),
        hasMore: pageNum * limitNum < usersWithAllowance.length
      }
    });
    
    console.log(`🏠 Homepage completed: ${usersWithAllowance.length} users with sufficient allowance (saved ${activeUsers.length - nonBlockedUsers.length} blockchain API calls)`);
  } catch (error) {
    console.error('Homepage fetch error:', error);
    res.status(500).json({ error: 'Failed to fetch homepage data' });
  }
});

// Leaderboard endpoints  
app.get('/api/leaderboard', async (req, res) => {
  try {
    const { timeFilter = 'total', page = 1, limit = 10, userFid } = req.query;
    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const offset = (pageNum - 1) * limitNum;
    
    // Get top tippers and earners directly from user_profiles
    let columnName;
    switch (timeFilter) {
      case '24h': columnName = 'tippings_24h'; break;
      case '7d': columnName = 'tippings_7d'; break;
      case '30d': columnName = 'tippings_30d'; break;
      case 'total': 
      default: columnName = 'total_tippings'; break;
    }
    
    const topTippersResult = await database.pool.query(`
      SELECT fid, username, display_name, pfp_url, user_address, ${columnName} as total_amount, updated_at
      FROM user_profiles 
      WHERE ${columnName} > 0
      ORDER BY ${columnName} DESC 
      LIMIT 50
    `);
    
    const topTippers = topTippersResult.rows.map(row => ({
      fid: row.fid,
      userAddress: row.user_address,
      totalAmount: parseFloat(row.total_amount),
      lastUpdated: row.updated_at,
      username: row.username,
      displayName: row.display_name,
      pfpUrl: row.pfp_url
    }));
    
    // Get top earners
    let earningsColumnName;
    switch (timeFilter) {
      case '24h': earningsColumnName = 'earnings_24h'; break;
      case '7d': earningsColumnName = 'earnings_7d'; break;
      case '30d': earningsColumnName = 'earnings_30d'; break;
      case 'total': 
      default: earningsColumnName = 'total_earnings'; break;
    }
    
    const topEarnersResult = await database.pool.query(`
      SELECT fid, username, display_name, pfp_url, user_address, ${earningsColumnName} as total_amount, updated_at
      FROM user_profiles 
      WHERE ${earningsColumnName} > 0
      ORDER BY ${earningsColumnName} DESC 
      LIMIT 50
    `);
    
    const topEarners = topEarnersResult.rows.map(row => ({
      fid: row.fid,
      userAddress: row.user_address,
      totalAmount: parseFloat(row.total_amount),
      lastUpdated: row.updated_at,
      username: row.username,
      displayName: row.display_name,
      pfpUrl: row.pfp_url
    }));
    
    console.log(`📊 Top tippers count: ${topTippers.length}, Top earners count: ${topEarners.length}`);
    console.log(`📊 First tipper:`, topTippers[0]);
    console.log(`📊 First earner:`, topEarners[0]);
    
    // Get user's own stats for "You" section from user_profiles
    let userStats = null;
    if (userFid) {
      console.log(`🔍 Fetching user stats for FID: ${userFid}`);
      const userStatsResult = await database.pool.query(`
        SELECT 
          fid,
          total_earnings,
          total_tippings,
          earnings_24h,
          tippings_24h,
          earnings_7d,
          tippings_7d,
          earnings_30d,
          tippings_30d
        FROM user_profiles 
        WHERE fid = $1
      `, [parseInt(userFid)]);
      
      if (userStatsResult.rows.length > 0) {
        const row = userStatsResult.rows[0];
        userStats = {
          fid: row.fid,
          totalEarnings: parseFloat(row.total_earnings) || 0,
          totalTippings: parseFloat(row.total_tippings) || 0,
          earnings24h: parseFloat(row.earnings_24h) || 0,
          tippings24h: parseFloat(row.tippings_24h) || 0,
          earnings7d: parseFloat(row.earnings_7d) || 0,
          tippings7d: parseFloat(row.tippings_7d) || 0,
          earnings30d: parseFloat(row.earnings_30d) || 0,
          tippings30d: parseFloat(row.tippings_30d) || 0
        };
      }
      console.log(`📊 User stats result:`, userStats);
    } else {
      console.log('❌ No userFid provided for user stats');
    }
    
    // Get paginated slices (data already enriched from user_profiles)
    const paginatedTippers = topTippers.slice(offset, offset + limitNum);
    const paginatedEarners = topEarners.slice(offset, offset + limitNum);
    
    // Add followerCount to the data (default to 0 if not available)
    const enrichedTippers = paginatedTippers.map(tipper => ({
      ...tipper,
      followerCount: 0 // We can add this later if needed
    }));
    
    const enrichedEarners = paginatedEarners.map(earner => ({
      ...earner,
      followerCount: 0 // We can add this later if needed
    }));
    
    // Calculate pagination info
    const totalTippers = topTippers.length;
    const totalEarners = topEarners.length;
    const totalPages = Math.ceil(Math.max(totalTippers, totalEarners) / limitNum);
    const hasMore = pageNum < totalPages;
    
    res.json({
      tippers: enrichedTippers,
      earners: enrichedEarners,
      userStats: userStats,
      pagination: {
        page: pageNum,
        limit: limitNum,
        totalTippers,
        totalEarners,
        totalPages,
        hasMore
      }
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
    
    // Return ECION BATCH CONTRACT address for approvals (not backend wallet)
    // Users need to approve the contract, not the backend wallet!
    const ecionBatchAddress = process.env.ECION_BATCH_CONTRACT_ADDRESS || '0x2f47bcc17665663d1b63e8d882faa0a366907bb8';
    
    res.json({ 
      address: ecionBatchAddress, // Contract address for token approvals
      backendWallet: wallet.address, // Backend wallet (executor)
      network: 'Base',
      note: 'Users must approve the EcionBatch contract, not the backend wallet'
    });
  } catch (error) {
    console.error('Backend wallet fetch error:', error);
    res.status(500).json({ error: 'Failed to get backend wallet address' });
  }
});

// Debug endpoint to check tip queue status
app.get('/api/debug/tip-queue', async (req, res) => {
  try {
    const tipQueueManager = require('./src/tipQueueManager');
    const queueStatus = tipQueueManager.getQueueStatus();
    
    res.json({
      success: true,
      queueStatus: queueStatus,
      totalUsers: Object.keys(queueStatus).length,
      processingUsers: Object.values(queueStatus).filter(user => user.isProcessing).length,
      queuedTips: Object.values(queueStatus).reduce((total, user) => total + user.queueLength, 0)
    });
  } catch (error) {
    console.error('Error getting tip queue status:', error);
    res.status(500).json({ error: 'Failed to get tip queue status' });
  }
});

// Debug endpoint to check batch transfer status
app.get('/api/debug/batch-status', async (req, res) => {
  try {
    const batchTransferManager = require('./batchTransferManager');
    const batchStatus = batchTransferManager.getBatchStatus();
    
    res.json({
      success: true,
      batchStatus: batchStatus,
      message: 'Batch transfer system status'
    });
  } catch (error) {
    console.error('Error getting batch status:', error);
    res.status(500).json({ error: 'Failed to get batch status' });
  }
});

// Force process current batch (for testing)
app.post('/api/debug/force-batch', async (req, res) => {
  try {
    const batchTransferManager = require('./batchTransferManager');
    await batchTransferManager.forceProcessBatch();
    
    res.json({
      success: true,
      message: 'Batch processing triggered'
    });
  } catch (error) {
    console.error('Error forcing batch processing:', error);
    res.status(500).json({ error: 'Failed to force batch processing' });
  }
});

// Debug endpoint to check pending tips and API access
// Debug endpoint to check user casts
app.get('/api/debug/user-casts/:fid', async (req, res) => {
  try {
    const fid = parseInt(req.params.fid);
    const result = await database.pool.query(`
      SELECT * FROM user_casts 
      WHERE user_fid = $1 
      ORDER BY created_at DESC
    `, [fid]);
    
    res.json({
      success: true,
      fid,
      casts: result.rows
    });
  } catch (error) {
    console.error('Error fetching user casts:', error);
    res.status(500).json({ error: 'Failed to fetch user casts' });
  }
});

// Debug endpoint to manually add a cast
app.post('/api/debug/add-cast', async (req, res) => {
  try {
    const { userFid, castHash, isMainCast = true } = req.body;
    
    await database.addUserCast(userFid, castHash, isMainCast);
    
    res.json({
      success: true,
      message: `Cast ${castHash} added for FID ${userFid}`
    });
  } catch (error) {
    console.error('Error adding cast:', error);
    res.status(500).json({ error: 'Failed to add cast' });
  }
});

// Endpoint to manually update user's latest cast
app.post('/api/update-latest-cast', async (req, res) => {
  try {
    const { userFid } = req.body;
    if (!userFid) {
      return res.status(400).json({ error: 'userFid required' });
    }

    // Fetch user's latest cast from Neynar (check last 25 casts to find a main one)
    const response = await fetch(`https://api.neynar.com/v2/farcaster/feed/user/casts?fid=${userFid}&limit=25`, {
      headers: { 'x-api-key': process.env.NEYNAR_API_KEY }
    });

    if (!response.ok) {
      return res.status(500).json({ error: 'Failed to fetch casts from Neynar' });
    }

    const data = await response.json();
    const casts = data.casts || [];

    // Find the latest main cast (not a reply)
    const latestMainCast = casts.find(cast =>
      !cast.parent_hash &&
      (!cast.parent_author || !cast.parent_author.fid || cast.parent_author.fid === null)
    );

    if (!latestMainCast) {
      return res.status(404).json({ 
        error: 'No main cast found in last 25 posts',
        debug: `Checked ${casts.length} casts, all were replies or had parent_author`
      });
    }

    // Update the user_casts table
    await database.addUserCast(userFid, latestMainCast.hash, true);

    res.json({
      success: true,
      message: `Updated latest cast for FID ${userFid}`,
      castHash: latestMainCast.hash,
      castText: latestMainCast.text?.substring(0, 100) + '...'
    });

  } catch (error) {
    console.error('Error updating latest cast:', error);
    res.status(500).json({ error: error.message });
  }
});

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

// Test homepage endpoint to trigger debug logs
app.get('/api/debug/test-homepage', async (req, res) => {
  try {
    console.log('🧪 Testing homepage endpoint to trigger debug logs...');
    const response = await fetch(`https://${req.get('host')}/api/homepage`);
    const data = await response.json();
    res.json({
      success: true,
      message: 'Homepage test completed - check server logs for debug info',
      homepageData: data
    });
  } catch (error) {
    console.error('Error testing homepage:', error);
    res.status(500).json({ error: 'Failed to test homepage' });
  }
});

// Debug endpoint to check blocklist contents
app.get('/api/debug/blocklist', async (req, res) => {
  try {
    const blockedUsers = global.blocklistService ? global.blocklistService.getBlockedUsers() : [];
    
    // Check for invalid addresses
    const invalidAddresses = blockedUsers.filter(addr => 
      !addr || addr === '0x' || addr.startsWith('0x0x') || addr.length < 42
    );
    
    res.json({
      success: true,
      blockedUsers: blockedUsers,
      count: blockedUsers.length,
      invalidAddresses: invalidAddresses,
      invalidCount: invalidAddresses.length,
      blocklistServiceAvailable: !!global.blocklistService,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error checking blocklist:', error);
    res.status(500).json({ error: 'Failed to check blocklist' });
  }
});

// Debug endpoint to manually remove user from blocklist
app.post('/api/debug/remove-from-blocklist', async (req, res) => {
  try {
    const { userAddress } = req.body;
    
    if (!userAddress) {
      return res.status(400).json({ error: 'userAddress is required' });
    }
    
    if (!batchTransferManager) {
      return res.status(500).json({ error: 'BatchTransferManager not initialized' });
    }
    
    console.log(`🔧 DEBUG: Manually removing ${userAddress} from blocklist`);
    const blocklistBefore = global.blocklistService ? global.blocklistService.getBlockedUsers() : [];
    console.log(`🔧 DEBUG: Blocklist before:`, blocklistBefore);
    
    let wasRemoved = false;
    if (global.blocklistService) {
      wasRemoved = global.blocklistService.removeFromBlocklist(userAddress);
    }
    
    console.log(`🔧 DEBUG: Removal result: ${wasRemoved}`);
    const blocklistAfter = global.blocklistService ? global.blocklistService.getBlockedUsers() : [];
    console.log(`🔧 DEBUG: Blocklist after:`, blocklistAfter);
    
    res.json({ 
      success: true, 
      wasRemoved,
      blocklist: blocklistAfter,
      message: wasRemoved ? 'User removed from blocklist' : 'User not found in blocklist'
    });
  } catch (error) {
    console.error('Debug remove from blocklist error:', error);
    res.status(500).json({ error: 'Failed to remove from blocklist' });
  }
});

// Simple endpoint to remove specific user from blocklist
app.post('/api/debug/remove-user', async (req, res) => {
  try {
    const { userAddress } = req.body;
    
    if (!userAddress) {
      return res.status(400).json({ error: 'userAddress is required' });
    }
    
    console.log(`🔧 MANUAL: Removing ${userAddress} from blocklist`);
    
    // Get current blocklist from database
    const currentBlocklist = await database.getBlocklist();
    console.log(`🔧 Current blocklist:`, currentBlocklist);
    
    // Remove user from blocklist
    const updatedBlocklist = (currentBlocklist || []).filter(addr => 
      addr.toLowerCase() !== userAddress.toLowerCase()
    );
    
    console.log(`🔧 Updated blocklist:`, updatedBlocklist);
    
    // Save to database
    await database.setBlocklist(updatedBlocklist);
    
    // Update BlocklistService memory
    if (global.blocklistService) {
      global.blocklistService.clearBlocklist();
      // Reload from database
      await global.blocklistService.loadFromDatabase();
    }
    
    res.json({
      success: true,
      message: `Removed ${userAddress} from blocklist`,
      blocklist: updatedBlocklist
    });
  } catch (error) {
    console.error('Error removing user:', error);
    res.status(500).json({ error: 'Failed to remove user' });
  }
});

// Clear blocklist endpoint
app.post('/api/debug/clear-blocklist', (req, res) => {
  try {
    if (!global.blocklistService) {
      return res.status(500).json({ error: 'BlocklistService not initialized' });
    }
    
    const previousCount = global.blocklistService.getBlocklistSize();
    global.blocklistService.clearBlocklist();
    console.log(`🧹 CLEARED BLOCKLIST: ${previousCount} users removed`);
    res.json({ 
      success: true, 
      message: 'Blocklist cleared successfully',
      previousCount: previousCount,
      currentCount: 0
    });
  } catch (error) {
    console.error('Error clearing blocklist:', error);
    res.status(500).json({ error: 'Failed to clear blocklist' });
  }
});

// Update blocklist status for a user
app.post('/api/update-blocklist-status', async (req, res) => {
  try {
    const { userAddress } = req.body;
    
    if (!userAddress) {
      return res.status(400).json({ error: 'userAddress is required' });
    }
    
    if (!global.blocklistService) {
      return res.status(500).json({ error: 'BlocklistService not initialized' });
    }
    
    console.log(`🔄 Updating blocklist status for ${userAddress}`);
    const result = await global.blocklistService.updateUserBlocklistStatus(userAddress);
    
    res.json({
      success: true,
      userAddress,
      action: result.action,
      reason: result.reason,
      isBlocked: global.blocklistService.isBlocked(userAddress),
      blocklistSize: global.blocklistService.getBlocklistSize()
    });
  } catch (error) {
    console.error('Error updating blocklist status:', error);
    res.status(500).json({ error: 'Failed to update blocklist status' });
  }
});

// Test endpoint to verify API routes are working
app.get('/api/test', (req, res) => {
  console.log('🔍 Test API route hit - updated version');
  res.json({ 
    success: true, 
    message: 'API routes are working! (Updated)',
    timestamp: new Date().toISOString()
  });
});

// Test FID lookup endpoint - removed for debugging

// Simple blocklist status endpoint
app.get('/api/blocklist-status', async (req, res) => {
  console.log('🔍 API Route Hit: /api/blocklist-status');
  try {
    if (!global.blocklistService) {
      console.log('❌ BlocklistService not initialized');
      return res.json({
        success: false,
        error: 'BlocklistService not initialized',
        blocklistSize: 0,
        blockedUsers: []
      });
    }

    const blocklistSize = global.blocklistService.getBlocklistSize();
    const blockedUsers = global.blocklistService.getBlockedUsers();
    
    console.log(`📊 Blocklist status: ${blocklistSize} users blocked`);
    
    res.json({
      success: true,
      blocklistSize: blocklistSize,
      blockedUsers: Array.from(blockedUsers),
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error checking blocklist status:', error);
    res.status(500).json({ error: 'Failed to check blocklist status' });
  }
});

// Debug endpoint to check BlocklistService status
app.get('/api/debug/blocklist-service', (req, res) => {
  try {
    const isInitialized = !!global.blocklistService;
    const blocklistSize = global.blocklistService ? global.blocklistService.getBlocklistSize() : 0;
    const blockedUsers = global.blocklistService ? global.blocklistService.getBlockedUsers() : [];
    
    res.json({
      success: true,
      blocklistService: {
        initialized: isInitialized,
        size: blocklistSize,
        blockedUsers: blockedUsers,
        status: isInitialized ? 'ACTIVE' : 'INACTIVE'
      },
      environment: {
        BASE_RPC_URL: process.env.BASE_RPC_URL ? 'SET' : 'NOT_SET',
        RPC_URL: process.env.RPC_URL ? 'SET' : 'NOT_SET',
        DATABASE_URL: process.env.DATABASE_URL ? 'SET' : 'NOT_SET'
      }
    });
  } catch (error) {
    console.error('Error checking BlocklistService status:', error);
    res.status(500).json({ error: 'Failed to check BlocklistService status' });
  }
});

// Debug endpoint to check allowance-based filtering
app.get('/api/debug/allowance-filtering', async (req, res) => {
  try {
    console.log('🔍 Debug: Checking allowance-based filtering...');
    
    const activeUsers = await database.getActiveUsersWithApprovals();
    const { ethers } = require('ethers');
    const provider = new ethers.JsonRpcProvider(process.env.BASE_RPC_URL);
    const ecionBatchAddress = process.env.ECION_BATCH_CONTRACT_ADDRESS || '0x2f47bcc17665663d1b63e8d882faa0a366907bb8';
    
    const filteringResults = [];
    
    for (const userAddress of activeUsers.slice(0, 10)) { // Check first 10 users
      try {
        const userConfig = await database.getUserConfig(userAddress);
        if (!userConfig) continue;
        
        const tokenAddress = userConfig.tokenAddress || '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
        const tokenDecimals = await getTokenDecimals(tokenAddress);
        
        const tokenContract = new ethers.Contract(tokenAddress, [
          "function allowance(address owner, address spender) view returns (uint256)"
        ], provider);
        
        const allowance = await tokenContract.allowance(userAddress, ecionBatchAddress);
        const allowanceAmount = parseFloat(ethers.formatUnits(allowance, tokenDecimals));
        
        const likeAmount = parseFloat(userConfig.likeAmount || '0');
        const recastAmount = parseFloat(userConfig.recastAmount || '0');
        const replyAmount = parseFloat(userConfig.replyAmount || '0');
        
        const minTipAmount = likeAmount + recastAmount + replyAmount;
        
        const willShow = allowanceAmount >= minTipAmount;
        
        filteringResults.push({
          userAddress,
          allowanceAmount,
          likeAmount,
          recastAmount,
          replyAmount,
          minTipAmount,
          willShow,
          reason: willShow ? 'Sufficient allowance' : 'Insufficient allowance'
        });
        
      } catch (error) {
        filteringResults.push({
          userAddress,
          error: error.message
        });
      }
    }
    
    res.json({
      success: true,
      message: 'Allowance filtering debug completed',
      results: filteringResults,
      summary: {
        total: filteringResults.length,
        willShow: filteringResults.filter(r => r.willShow).length,
        willHide: filteringResults.filter(r => !r.willShow).length
      }
    });
  } catch (error) {
    console.error('Error in allowance filtering debug:', error);
    res.status(500).json({ error: 'Failed to debug allowance filtering' });
  }
});

// Debug endpoint to check webhook configuration
app.get('/api/debug/webhook-status', async (req, res) => {
  try {
    const webhookId = await database.getWebhookId();
    const trackedFids = await database.getTrackedFids();
    
    res.json({
      success: true,
      webhookId,
      trackedFids,
      webhookSecret: process.env.WEBHOOK_SECRET ? 'Set' : 'Not set',
      neynarApiKey: process.env.NEYNAR_API_KEY ? 'Set' : 'Not set',
      webhookUrl: `https://${req.get('host')}/webhook/neynar`,
      message: 'Check Railway logs for webhook events'
    });
  } catch (error) {
    console.error('Error checking webhook status:', error);
    res.status(500).json({ error: 'Failed to check webhook status' });
  }
});

// FORCE UPDATE webhook with current tracked FIDs (fixes likes/recasts not working)
app.post('/api/force-update-webhook', async (req, res) => {
  try {
    console.log('🔄 FORCE UPDATING WEBHOOK...');
    
    const webhookId = await database.getWebhookId();
    const trackedFids = await database.getTrackedFids();
    
    if (!webhookId) {
      return res.status(400).json({ error: 'No webhook ID found' });
    }
    
    if (trackedFids.length === 0) {
      return res.status(400).json({ error: 'No tracked FIDs found' });
    }
    
    console.log('📡 Updating webhook with FIDs:', trackedFids);
    
    const webhookUrl = `https://${req.get('host')}/webhook/neynar`;
    const webhookPayload = {
      webhook_id: webhookId,
      name: "Ecion Farcaster Events Webhook",
      url: webhookUrl,
      subscription: {
        "cast.created": {
          author_fids: trackedFids,           // When user posts (update earnable cast)
          parent_author_fids: trackedFids     // When someone replies to user's cast
        },
        "reaction.created": {
          target_fids: trackedFids            // When someone likes/recasts user's cast
        },
        "follow.created": {
          target_fids: trackedFids            // When someone follows user
        }
      }
    };
    
    console.log('📡 Webhook payload:', JSON.stringify(webhookPayload, null, 2));
    
    const webhookResponse = await fetch(`https://api.neynar.com/v2/farcaster/webhook/`, {
      method: 'PUT',
      headers: {
        'x-api-key': process.env.NEYNAR_API_KEY,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(webhookPayload)
    });
    
    if (webhookResponse.ok) {
      const result = await webhookResponse.json();
      console.log('✅ Webhook updated successfully');
      res.json({
        success: true,
        message: 'Webhook updated with all tracked FIDs',
        webhookId,
        trackedFids,
        result
      });
    } else {
      const errorText = await webhookResponse.text();
      console.error('❌ Webhook update failed:', errorText);
      res.status(500).json({ error: 'Failed to update webhook', details: errorText });
    }
    
  } catch (error) {
    console.error('Error force updating webhook:', error);
    res.status(500).json({ error: 'Failed to force update webhook' });
  }
});

// Debug endpoint to get FID from address and check webhook tracking
app.get('/api/debug/check-fid/:address', async (req, res) => {
  try {
    const { address } = req.params;
    const userAddress = address.toLowerCase();
    
    // Get user's Farcaster profile
    let farcasterUser = null;
    try {
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
        farcasterUser = userData[userAddress]?.[0];
      }
    } catch (error) {
      console.error('Error fetching Farcaster user:', error);
    }
    
    // Get tracked FIDs
    const trackedFids = await database.getTrackedFids();
    const isTracked = farcasterUser ? trackedFids.includes(farcasterUser.fid) : false;
    
    res.json({
      success: true,
      userAddress,
      farcasterUser: farcasterUser ? {
        fid: farcasterUser.fid,
        username: farcasterUser.username,
        displayName: farcasterUser.display_name
      } : null,
      trackedFids,
      isTracked,
      webhookId: await database.getWebhookId(),
      message: isTracked ? 'Your FID is being tracked by webhook' : 'Your FID is NOT being tracked by webhook'
    });
  } catch (error) {
    console.error('Error checking FID:', error);
    res.status(500).json({ error: 'Failed to check FID' });
  }
});

// Debug endpoint to check user homepage eligibility
app.get('/api/debug/user-status/:address', async (req, res) => {
  try {
    const { address } = req.params;
    const userAddress = address.toLowerCase();
    
    // Check if user has active config
    const userConfig = await database.getUserConfig(userAddress);
    const isActive = userConfig && userConfig.isActive;
    const hasTokenAddress = userConfig && userConfig.tokenAddress;
    
    // Check if user is in active users list
    const activeUsers = await database.getActiveUsersWithApprovals();
    const isInActiveUsers = activeUsers.includes(userAddress);
    
    // Get user's Farcaster profile
    let farcasterUser = null;
    try {
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
        farcasterUser = userData[userAddress]?.[0];
      }
    } catch (error) {
      console.error('Error fetching Farcaster user:', error);
    }
    
    // Get user's recent casts
    let recentCasts = [];
    if (farcasterUser) {
      try {
        const castsResponse = await fetch(
          `https://api.neynar.com/v2/farcaster/feed/user/casts?fid=${farcasterUser.fid}&limit=10`,
          {
            headers: { 'x-api-key': process.env.NEYNAR_API_KEY }
          }
        );
        
        if (castsResponse.ok) {
          const castsData = await castsResponse.json();
          recentCasts = castsData.casts || [];
        }
      } catch (error) {
        console.error('Error fetching casts:', error);
      }
    }
    
    res.json({
      success: true,
      userAddress,
      userConfig,
      isActive,
      hasTokenAddress,
      isInActiveUsers,
      activeUsersCount: activeUsers.length,
      farcasterUser: farcasterUser ? {
        fid: farcasterUser.fid,
        username: farcasterUser.username,
        displayName: farcasterUser.display_name
      } : null,
      recentCasts: recentCasts.map(cast => ({
        hash: cast.hash,
        text: cast.text.substring(0, 100) + '...',
        timestamp: cast.timestamp,
        isMainCast: !cast.parent_hash && (!cast.parent_author || !cast.parent_author.fid),
        parentHash: cast.parent_hash,
        parentAuthor: cast.parent_author
      })),
      eligibility: {
        hasConfig: !!userConfig,
        isActive: isActive,
        hasTokenAddress: hasTokenAddress,
        isInActiveUsers: isInActiveUsers,
        hasFarcasterProfile: !!farcasterUser,
        hasRecentCasts: recentCasts.length > 0,
        hasMainCasts: recentCasts.some(cast => !cast.parent_hash && (!cast.parent_author || !cast.parent_author.fid))
      }
    });
  } catch (error) {
    console.error('Error checking user status:', error);
    res.status(500).json({ error: 'Failed to check user status' });
  }
});

// Get all users with notification tokens
app.get('/api/notification-users', async (req, res) => {
  try {
    console.log('🔍 Getting notification users...');
    
    // Check if database is available
    if (!database) {
      console.error('❌ Database not initialized');
      return res.status(500).json({ error: 'Database not initialized' });
    }
    
    const allTokens = await database.getAllNotificationTokens();
    console.log(`📊 Found ${allTokens.length} notification tokens`);
    
    res.json({
      success: true,
      totalUsers: allTokens.length,
      users: allTokens.map(token => ({
        userAddress: token.user_address,
        fid: token.fid,
        isActive: token.isActive,
        createdAt: token.createdAt || 'unknown'
      }))
    });
  } catch (error) {
    console.error('❌ Error getting notification users:', error);
    res.status(500).json({ error: 'Failed to get notification users', details: error.message });
  }
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
    
    // Simple fallback for frontend routes (LAST ROUTE) - but NOT for API routes
    app.get('*', (req, res) => {
      // Skip API routes - they should be handled by specific endpoints
      if (req.path.startsWith('/api/')) {
        return res.status(404).json({ error: 'API endpoint not found', path: req.path });
      }
      
      // Skip webhook routes
      if (req.path.startsWith('/webhook/')) {
        return res.status(404).json({ error: 'Webhook endpoint not found', path: req.path });
      }
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


// Debug endpoint to check batch status and force process
app.get('/api/debug/batch-status', async (req, res) => {
  try {
    const batchStatus = batchTransferManager.getBatchStatus();
    res.json({
      success: true,
      ...batchStatus,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error getting batch status:', error);
    res.status(500).json({ error: 'Failed to get batch status' });
  }
});

// Force process current batch (for testing)
app.post('/api/debug/force-process-batch', async (req, res) => {
  try {
    await batchTransferManager.forceProcessBatch();
    res.json({
      success: true,
      message: 'Batch processing triggered',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error forcing batch process:', error);
    res.status(500).json({ error: 'Failed to force process batch' });
  }
});

// Check current gas prices on Base
app.get('/api/debug/gas-prices', async (req, res) => {
  try {
    const provider = new ethers.JsonRpcProvider(process.env.BASE_RPC_URL);
    const gasPrice = await provider.getGasPrice();
    const feeData = await provider.getFeeData();
    
    res.json({
      success: true,
      gasPrice: gasPrice.toString(),
      gasPriceGwei: ethers.formatUnits(gasPrice, 'gwei'),
      maxFeePerGas: feeData.maxFeePerGas?.toString(),
      maxPriorityFeePerGas: feeData.maxPriorityFeePerGas?.toString(),
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error getting gas prices:', error);
    res.status(500).json({ error: 'Failed to get gas prices' });
  }
});

// ADMIN ENDPOINTS - Total App Statistics
app.get('/api/admin/total-stats', async (req, res) => {
  try {
    // Get total tips count and amount
    const totalTips = await database.getTotalTips();
    const totalAmount = await database.getTotalAmountTipped();
    const totalUsers = await database.getTotalUsers();
    const totalTransactions = await database.getTotalTransactions();
    
    res.json({
      success: true,
      stats: {
        totalTips: totalTips,
        totalAmountTipped: totalAmount,
        totalUsers: totalUsers,
        totalTransactions: totalTransactions,
        timestamp: new Date().toISOString()
      }
    });
  } catch (error) {
    console.error('Error getting total stats:', error);
    res.status(500).json({ error: 'Failed to get total stats' });
  }
});

// Get recent tips for admin monitoring
app.get('/api/admin/recent-tips', async (req, res) => {
  try {
    const { limit = 50 } = req.query;
    const recentTips = await database.getRecentTips(parseInt(limit));
    
    res.json({
      success: true,
      tips: recentTips,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error getting recent tips:', error);
    res.status(500).json({ error: 'Failed to get recent tips' });
  }
});

// Debug endpoint to check leaderboard data in real-time
app.get('/api/debug/leaderboard-data', async (req, res) => {
  try {
    const { timeFilter = '24h' } = req.query;
    
    // Get raw data for debugging
    const topTippers = await database.getTopTippers(timeFilter);
    const topEarners = await database.getTopEarners(timeFilter);
    const totalTips = await database.getTotalTips();
    const recentTips = await database.getRecentTips(10);
    
    res.json({
      success: true,
      debug: {
        timeFilter,
        totalTipsInDB: totalTips,
        topTippers: topTippers.length,
        topEarners: topEarners.length,
        tippersData: topTippers,
        earnersData: topEarners,
        recentTips: recentTips.map(tip => ({
          from: tip.fromAddress,
          to: tip.toAddress,
          amount: tip.amount,
          action: tip.interactionType,
          processedAt: tip.processedAt
        }))
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error getting leaderboard debug data:', error);
    res.status(500).json({ error: 'Failed to get leaderboard debug data' });
  }
});

// Initialize user earnings table (run once to migrate existing data)
app.post('/api/admin/initialize-user-earnings', async (req, res) => {
  try {
    console.log('🔄 Starting user earnings initialization...');
    await database.initializeUserEarnings();
    res.json({ 
      success: true, 
      message: 'User earnings table initialized successfully' 
    });
  } catch (error) {
    console.error('Error initializing user earnings:', error);
    res.status(500).json({ error: 'Failed to initialize user earnings' });
  }
});

// Share preview endpoint - generates preview image for user stats
app.get('/api/share/:fid', async (req, res) => {
  try {
    const { fid } = req.params;
    const { time = 'total', type = 'earnings' } = req.query;
    
    // Get user earnings data
    const userStats = await database.getUserEarnings(parseInt(fid));
    if (!userStats) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    // Get user profile data
    const { getUserDataByFid } = require('./neynar');
    const userProfile = await getUserDataByFid(parseInt(fid));
    
    // Get amount based on time and type
    let amount = 0;
    let timeLabel = '';
    
    switch (time) {
      case '24h':
        amount = type === 'earnings' ? userStats.earnings24h : userStats.tippings24h;
        timeLabel = '24h';
        break;
      case '7d':
        amount = type === 'earnings' ? userStats.earnings7d : userStats.tippings7d;
        timeLabel = '7d';
        break;
      case '30d':
        amount = type === 'earnings' ? userStats.earnings30d : userStats.tippings30d;
        timeLabel = '30d';
        break;
      case 'total':
      default:
        amount = type === 'earnings' ? userStats.totalEarnings : userStats.totalTippings;
        timeLabel = 'Total';
        break;
    }
    
    // Generate simple HTML for preview (you can enhance this later)
    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta property="og:title" content="Ecion - ${type === 'earnings' ? 'Earnings' : 'Tippings'} ${timeLabel}">
        <meta property="og:description" content="${userProfile?.username || 'User'} ${type === 'earned' ? 'earned' : 'tipped'} ${amount.toFixed(2)} USDC in ${timeLabel.toLowerCase()}">
        <meta property="og:image" content="data:image/svg+xml;base64,${Buffer.from(`
          <svg width="400" height="200" xmlns="http://www.w3.org/2000/svg">
            <rect width="400" height="200" fill="#FFD700"/>
            <circle cx="60" cy="100" r="40" fill="#333"/>
            <text x="120" y="80" font-family="Arial" font-size="24" fill="#000">${userProfile?.username || 'User'}</text>
            <text x="120" y="110" font-family="Arial" font-size="18" fill="#000">${type === 'earnings' ? 'Earned' : 'Tipped'}: ${amount.toFixed(2)} USDC</text>
            <text x="120" y="130" font-family="Arial" font-size="16" fill="#000">In ${timeLabel}</text>
            <text x="200" y="180" font-family="Arial" font-size="14" fill="#000">Ecion</text>
          </svg>
        `).toString('base64')}">
        <meta property="og:url" content="https://ecion.vercel.app/share/${fid}?time=${time}&type=${type}">
        <meta name="twitter:card" content="summary_large_image">
        <title>Ecion - ${type === 'earnings' ? 'Earnings' : 'Tippings'} ${timeLabel}</title>
      </head>
      <body style="margin:0; padding:20px; background:#FFD700; font-family:Arial;">
        <div style="text-align:center;">
          <img src="${userProfile?.pfp_url || 'https://via.placeholder.com/80'}" style="width:80px; height:80px; border-radius:50%; margin-bottom:20px;">
          <h1 style="color:#000; margin:0;">${userProfile?.username || 'User'}</h1>
          <h2 style="color:#000; margin:10px 0;">${type === 'earnings' ? 'Earned' : 'Tipped'}: ${amount.toFixed(2)} USDC</h2>
          <p style="color:#000; margin:0;">In ${timeLabel}</p>
          <p style="color:#000; margin-top:20px;">Powered by Ecion</p>
        </div>
      </body>
      </html>
    `;
    
    res.setHeader('Content-Type', 'text/html');
    res.send(html);
    
  } catch (error) {
    console.error('Error generating share preview:', error);
    res.status(500).json({ error: 'Failed to generate preview' });
  }
});

// Embed image generation endpoint (3:2 aspect ratio - 600x400px)
app.get('/api/embed-image/:fid', async (req, res) => {
  try {
    const { fid } = req.params;
    const { time = 'total', type = 'earnings' } = req.query;
    
    // Get user earnings data
    const userStats = await database.getUserEarnings(parseInt(fid));
    if (!userStats) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    // Get user profile data
    const { getUserDataByFid } = require('./neynar');
    const userProfile = await getUserDataByFid(parseInt(fid));
    
    // Get amount based on time and type
    let amount = 0;
    let timeLabel = '';
    
    switch (time) {
      case '24h':
        amount = type === 'earnings' ? userStats.earnings24h : userStats.tippings24h;
        timeLabel = '24h';
        break;
      case '7d':
        amount = type === 'earnings' ? userStats.earnings7d : userStats.tippings7d;
        timeLabel = '7d';
        break;
      case '30d':
        amount = type === 'earnings' ? userStats.earnings30d : userStats.tippings30d;
        timeLabel = '30d';
        break;
      case 'total':
      default:
        amount = type === 'earnings' ? userStats.totalEarnings : userStats.totalTippings;
        timeLabel = 'Total';
        break;
    }
    
    // Generate SVG image (3:2 aspect ratio - 600x400px)
    const svg = `
      <svg width="600" height="400" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" style="stop-color:#FFD700;stop-opacity:1" />
            <stop offset="100%" style="stop-color:#FFA500;stop-opacity:1" />
          </linearGradient>
        </defs>
        <rect width="600" height="400" fill="url(#bg)"/>
        
        <!-- User Avatar -->
        <circle cx="100" cy="100" r="60" fill="#333" stroke="#fff" stroke-width="4"/>
        <text x="100" y="110" font-family="Arial, sans-serif" font-size="24" fill="#fff" text-anchor="middle">👤</text>
        
        <!-- Username -->
        <text x="200" y="80" font-family="Arial, sans-serif" font-size="32" font-weight="bold" fill="#000">
          ${userProfile?.username || 'User'}
        </text>
        
        <!-- Amount -->
        <text x="200" y="130" font-family="Arial, sans-serif" font-size="48" font-weight="bold" fill="#000">
          ${amount.toFixed(2)} USDC
        </text>
        
        <!-- Type and Time -->
        <text x="200" y="170" font-family="Arial, sans-serif" font-size="24" fill="#000">
          ${type === 'earnings' ? 'Earned' : 'Tipped'} in ${timeLabel}
        </text>
        
        <!-- Ecion Logo -->
        <text x="500" y="350" font-family="Arial, sans-serif" font-size="20" font-weight="bold" fill="#000">
          Ecion
        </text>
      </svg>
    `;
    
    res.setHeader('Content-Type', 'image/svg+xml');
    res.setHeader('Cache-Control', 'public, max-age=3600'); // Cache for 1 hour
    res.send(svg);
    
  } catch (error) {
    console.error('Error generating embed image:', error);
    res.status(500).json({ error: 'Failed to generate embed image' });
  }
});

// User earnings endpoint
app.get('/api/user-earnings/:fid', async (req, res) => {
  try {
    const { fid } = req.params;
    const userStats = await database.getUserEarnings(parseInt(fid));
    
    if (!userStats) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    res.json(userStats);
  } catch (error) {
    console.error('Error fetching user earnings:', error);
    res.status(500).json({ error: 'Failed to fetch user earnings' });
  }
});

// User profile endpoints
app.post('/api/user-profile', async (req, res) => {
  try {
    const { fid, username, displayName, pfpUrl, followerCount } = req.body;
    
    if (!fid) {
      return res.status(400).json({ error: 'FID is required' });
    }
    
    await database.saveUserProfile(fid, username, displayName, pfpUrl, followerCount);
    
    res.json({ success: true, message: 'User profile saved successfully' });
  } catch (error) {
    console.error('Error saving user profile:', error);
    res.status(500).json({ error: 'Failed to save user profile' });
  }
});

app.get('/api/user-profile/:fid', async (req, res) => {
  try {
    const { fid } = req.params;
    const { getUserDataByFid } = require('./neynar');
    const userProfile = await getUserDataByFid(parseInt(fid));
    
    if (!userProfile) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    res.json(userProfile);
  } catch (error) {
    console.error('Error fetching user profile:', error);
    res.status(500).json({ error: 'Failed to fetch user profile' });
  }
});

// Initialize user earnings endpoint
app.post('/api/initialize-user-earnings/:fid', async (req, res) => {
  try {
    const { fid } = req.params;
    console.log(`🔄 Initializing user earnings for FID: ${fid}`);
    
    // Get user's wallet address
    const userAddressResult = await database.pool.query(`
      SELECT user_address FROM user_configs WHERE fid = $1 LIMIT 1
    `, [fid]);
    
    if (userAddressResult.rows.length === 0) {
      return res.status(404).json({ error: 'User wallet address not found' });
    }
    
    const userAddress = userAddressResult.rows[0].user_address;
    console.log(`💰 User wallet address: ${userAddress}`);
    
    // Calculate earnings and tippings from tip history
    const tipHistoryResult = await database.pool.query(`
      SELECT 
        SUM(CASE WHEN LOWER(to_address) = LOWER($2) THEN CAST(amount AS DECIMAL) ELSE 0 END) as total_earnings,
        SUM(CASE WHEN LOWER(from_address) = LOWER($2) THEN CAST(amount AS DECIMAL) ELSE 0 END) as total_tippings
      FROM tip_history 
      WHERE LOWER(token_address) = '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913'
    `, [fid, userAddress]);
    
    const totalEarnings = parseFloat(tipHistoryResult.rows[0]?.total_earnings || 0);
    const totalTippings = parseFloat(tipHistoryResult.rows[0]?.total_tippings || 0);
    
    console.log(`📊 Calculated earnings: ${totalEarnings}, tippings: ${totalTippings}`);
    
    // Insert or update user earnings
    await database.pool.query(`
      INSERT INTO user_earnings (fid, total_earnings, total_tippings, last_updated)
      VALUES ($1, $2, $3, NOW())
      ON CONFLICT (fid) DO UPDATE SET
        total_earnings = EXCLUDED.total_earnings,
        total_tippings = EXCLUDED.total_tippings,
        last_updated = NOW()
    `, [fid, totalEarnings, totalTippings]);
    
    res.json({ 
      success: true, 
      message: 'User earnings initialized',
      data: {
        fid: parseInt(fid),
        totalEarnings,
        totalTippings
      }
    });
  } catch (error) {
    console.error('Error initializing user earnings:', error);
    res.status(500).json({ error: 'Failed to initialize user earnings' });
  }
});

// Migration endpoint to fetch and save all user profiles from tip_history
app.post('/api/migrate-user-profiles', async (req, res) => {
  try {
    console.log('🚀 Starting user profiles migration...');
    
    // Get all unique user addresses from tip_history
    const addressesResult = await database.pool.query(`
      SELECT DISTINCT from_address as user_address
      FROM tip_history 
      WHERE LOWER(token_address) = '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913'
      UNION
      SELECT DISTINCT to_address as user_address
      FROM tip_history 
      WHERE LOWER(token_address) = '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913'
    `);
    
    const addresses = addressesResult.rows.map(row => row.user_address);
    console.log(`📊 Found ${addresses.length} unique addresses from tip_history`);
    
    // Process addresses in batches of 350 (Neynar API limit)
    const { getUserDataByAddress } = require('./neynar');
    let successCount = 0;
    let errorCount = 0;
    const batchSize = 350;
    
    for (let i = 0; i < addresses.length; i += batchSize) {
      const batch = addresses.slice(i, i + batchSize);
      console.log(`🔍 Processing batch ${Math.floor(i/batchSize) + 1}: ${batch.length} addresses`);
      
      try {
        // Fetch all addresses in this batch at once
        const response = await fetch(`https://api.neynar.com/v2/farcaster/user/bulk-by-address?addresses=${batch.join(',')}`, {
          headers: {
            'api_key': process.env.NEYNAR_API_KEY,
            'Content-Type': 'application/json'
          }
        });

        if (!response.ok) {
          console.error(`❌ Neynar API error for batch:`, response.status, response.statusText);
          errorCount += batch.length;
          continue;
        }

        const data = await response.json();
        console.log(`📊 Neynar response for batch:`, JSON.stringify(data, null, 2));

        // Process each user in the response
        if (data.result && data.result.users) {
          for (const user of data.result.users) {
            try {
              await database.saveUserProfile(
                user.fid,
                user.username || `user_${user.custodyAddress?.slice(0, 8) || 'unknown'}`,
                user.displayName || `User ${user.custodyAddress?.slice(0, 8) || 'unknown'}`,
                user.pfp?.url || '',
                user.followerCount || 0
              );
              console.log(`✅ Saved profile for ${user.username || user.custodyAddress}`);
              successCount++;
            } catch (error) {
              console.error(`❌ Failed to save profile for ${user.username}:`, error.message);
              errorCount++;
            }
          }
        } else {
          console.log(`⚠️ No users found in batch`);
          errorCount += batch.length;
        }
      } catch (error) {
        console.error(`❌ Failed to fetch batch:`, error.message);
        errorCount += batch.length;
      }
    }
    
    console.log(`🎉 Migration completed! Migrated ${successCount} users, ${errorCount} errors`);
    res.json({ 
      success: true, 
      migrated: successCount, 
      errors: errorCount,
      message: `Successfully migrated ${successCount} user profiles from tip_history addresses`
    });
    
  } catch (error) {
    console.error('Migration error:', error);
    res.status(500).json({ error: 'Migration failed', details: error.message });
  }
});

// Migrate ALL user earnings from tip_history to user_earnings table
app.post('/api/migrate-all-user-earnings', async (req, res) => {
  try {
    console.log('🚀 Starting migration of ALL user earnings from tip_history...');
    
    // Get all unique addresses from tip_history
    const addressesResult = await database.pool.query(`
      SELECT DISTINCT from_address as user_address
      FROM tip_history 
      WHERE LOWER(token_address) = '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913'
      UNION
      SELECT DISTINCT to_address as user_address
      FROM tip_history 
      WHERE LOWER(token_address) = '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913'
    `);
    
    const addresses = addressesResult.rows.map(row => row.user_address);
    console.log(`📊 Found ${addresses.length} unique addresses from tip_history`);
    
    let migratedCount = 0;
    const results = [];
    
    for (const address of addresses) {
      console.log(`\n🔄 Processing address: ${address}`);
      
      try {
        // Calculate total earnings and tippings for this address
        const earningsResult = await database.pool.query(`
          SELECT 
            SUM(CASE WHEN LOWER(to_address) = LOWER($1) THEN CAST(amount AS DECIMAL) ELSE 0 END) as total_earnings,
            SUM(CASE WHEN LOWER(from_address) = LOWER($1) THEN CAST(amount AS DECIMAL) ELSE 0 END) as total_tippings,
            SUM(CASE WHEN LOWER(to_address) = LOWER($1) AND created_at >= NOW() - INTERVAL '24 hours' THEN CAST(amount AS DECIMAL) ELSE 0 END) as earnings_24h,
            SUM(CASE WHEN LOWER(from_address) = LOWER($1) AND created_at >= NOW() - INTERVAL '24 hours' THEN CAST(amount AS DECIMAL) ELSE 0 END) as tippings_24h,
            SUM(CASE WHEN LOWER(to_address) = LOWER($1) AND created_at >= NOW() - INTERVAL '7 days' THEN CAST(amount AS DECIMAL) ELSE 0 END) as earnings_7d,
            SUM(CASE WHEN LOWER(from_address) = LOWER($1) AND created_at >= NOW() - INTERVAL '7 days' THEN CAST(amount AS DECIMAL) ELSE 0 END) as tippings_7d,
            SUM(CASE WHEN LOWER(to_address) = LOWER($1) AND created_at >= NOW() - INTERVAL '30 days' THEN CAST(amount AS DECIMAL) ELSE 0 END) as earnings_30d,
            SUM(CASE WHEN LOWER(from_address) = LOWER($1) AND created_at >= NOW() - INTERVAL '30 days' THEN CAST(amount AS DECIMAL) ELSE 0 END) as tippings_30d
          FROM tip_history 
          WHERE LOWER(token_address) = '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913'
        `, [address]);
        
        const totalEarnings = parseFloat(earningsResult.rows[0]?.total_earnings || 0);
        const totalTippings = parseFloat(earningsResult.rows[0]?.total_tippings || 0);
        const earnings24h = parseFloat(earningsResult.rows[0]?.earnings_24h || 0);
        const tippings24h = parseFloat(earningsResult.rows[0]?.tippings_24h || 0);
        const earnings7d = parseFloat(earningsResult.rows[0]?.earnings_7d || 0);
        const tippings7d = parseFloat(earningsResult.rows[0]?.tippings_7d || 0);
        const earnings30d = parseFloat(earningsResult.rows[0]?.earnings_30d || 0);
        const tippings30d = parseFloat(earningsResult.rows[0]?.tippings_30d || 0);
        
        console.log(`📈 Total earnings: ${totalEarnings}, Total tippings: ${totalTippings}`);
        console.log(`📈 24h: earnings=${earnings24h}, tippings=${tippings24h}`);
        console.log(`📈 7d: earnings=${earnings7d}, tippings=${tippings7d}`);
        console.log(`📈 30d: earnings=${earnings30d}, tippings=${tippings30d}`);
        
        // Get FID for this address (if exists in user_profiles)
        const fidResult = await database.pool.query(`
          SELECT fid FROM user_profiles 
          WHERE LOWER(custody_address) = LOWER($1) OR LOWER(verification_address) = LOWER($1)
          LIMIT 1
        `, [address]);
        
        const fid = fidResult.rows.length > 0 ? fidResult.rows[0].fid : null;
        
        if (fid) {
          // Insert or update user earnings
          await database.pool.query(`
            INSERT INTO user_earnings (
              fid, 
              total_earnings, 
              earnings_24h, 
              earnings_7d, 
              earnings_30d,
              total_tippings, 
              tippings_24h, 
              tippings_7d, 
              tippings_30d,
              last_updated
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
            ON CONFLICT (fid) DO UPDATE SET
              total_earnings = EXCLUDED.total_earnings,
              earnings_24h = EXCLUDED.earnings_24h,
              earnings_7d = EXCLUDED.earnings_7d,
              earnings_30d = EXCLUDED.earnings_30d,
              total_tippings = EXCLUDED.total_tippings,
              tippings_24h = EXCLUDED.tippings_24h,
              tippings_7d = EXCLUDED.tippings_7d,
              tippings_30d = EXCLUDED.tippings_30d,
              last_updated = NOW()
          `, [
            fid, 
            totalEarnings, 
            earnings24h, 
            earnings7d, 
            earnings30d,
            totalTippings, 
            tippings24h, 
            tippings7d, 
            tippings30d
          ]);
          
          console.log(`✅ Migrated earnings for FID ${fid}: ${totalEarnings} earned, ${totalTippings} tipped`);
          migratedCount++;
        } else {
          console.log(`⚠️ No FID found for address ${address}, skipping earnings migration`);
        }
        
      } catch (error) {
        console.error(`❌ Error migrating address ${address}:`, error);
      }
    }
    
    console.log(`\n🎉 Migration completed! Migrated ${migratedCount} users.`);
    
    res.json({ 
      success: true, 
      message: `Migration completed successfully. Migrated ${migratedCount} users.`,
      migratedCount
    });
    
  } catch (error) {
    console.error('❌ Migration failed:', error);
    res.status(500).json({ error: 'Failed to migrate user earnings' });
  }
});

// Debug endpoint to check user_profiles table
app.get('/api/debug/user-profiles', async (req, res) => {
  try {
    const result = await database.pool.query('SELECT fid, username, display_name, pfp_url FROM user_profiles ORDER BY fid DESC LIMIT 10');
    res.json({
      count: result.rows.length,
      profiles: result.rows
    });
  } catch (error) {
    console.error('Debug user-profiles error:', error);
    res.status(500).json({ error: 'Failed to fetch user profiles' });
  }
});

// Debug endpoint to check user_earnings table
app.get('/api/debug/user-earnings', async (req, res) => {
  try {
    const result = await database.pool.query('SELECT fid, total_earnings, total_tippings FROM user_earnings ORDER BY total_earnings DESC LIMIT 10');
    res.json({
      count: result.rows.length,
      earnings: result.rows
    });
  } catch (error) {
    console.error('Debug user-earnings error:', error);
    res.status(500).json({ error: 'Failed to fetch user earnings' });
  }
});

// Simple test endpoint
app.get('/api/test', (req, res) => {
  res.json({ message: 'Backend is working!', timestamp: new Date().toISOString() });
});

// Test migration with just 1 address
app.post('/api/test-migration', async (req, res) => {
  try {
    console.log('🧪 Testing migration with 1 address...');
    
    // Import neynar functions
    const { getUserDataByAddress } = require('./neynar');
    
    // First check table structure
    const tableInfo = await database.pool.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'user_profiles'
      ORDER BY ordinal_position
    `);
    console.log('🧪 user_profiles table structure:', tableInfo.rows);
    
    // Get just 1 address from tip_history
    const addressesResult = await database.pool.query(`
      SELECT from_address 
      FROM tip_history 
      WHERE from_address IS NOT NULL
      LIMIT 1
    `);
    
    if (addressesResult.rows.length === 0) {
      return res.json({ success: false, message: 'No addresses found in tip_history' });
    }
    
    const testAddress = addressesResult.rows[0].from_address;
    console.log(`🧪 Testing with address: ${testAddress}`);
    
    // Test Neynar API call
    const neynarResponse = await getUserDataByAddress(testAddress);
    console.log(`🧪 Neynar response:`, JSON.stringify(neynarResponse, null, 2));
    
    // Test database save
    if (neynarResponse && neynarResponse.fid) {
      console.log(`🧪 Trying to save user:`, neynarResponse);
      
      const success = await database.saveUserProfile(
        neynarResponse.fid,
        neynarResponse.username,
        neynarResponse.displayName,
        neynarResponse.pfpUrl,
        neynarResponse.followerCount,
        testAddress
      );
      
      console.log(`🧪 Save result:`, success);
      
      res.json({ 
        success: true, 
        message: 'Test completed',
        address: testAddress,
        neynarResponse: neynarResponse,
        saveResult: success,
        tableStructure: tableInfo.rows
      });
    } else {
      res.json({ 
        success: false, 
        message: 'No user data found for test address',
        address: testAddress,
        neynarResponse,
        tableStructure: tableInfo.rows
      });
    }
    
  } catch (error) {
    console.error('Test migration error:', error);
    res.status(500).json({ error: 'Test migration failed', details: error.message });
  }
});

// Debug endpoint to check user_profiles table structure
app.get('/api/debug/table-structure', async (req, res) => {
  try {
    const result = await database.pool.query(`
      SELECT column_name, data_type, is_nullable, column_default
      FROM information_schema.columns 
      WHERE table_name = 'user_profiles'
      ORDER BY ordinal_position
    `);
    res.json({
      table: 'user_profiles',
      columns: result.rows
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to get table structure', details: error.message });
  }
});

// Migration endpoint to populate user_profiles from tip_history addresses
app.post('/api/migrate-user-profiles', async (req, res) => {
  try {
    console.log('🚀 Starting user profiles migration...');
    
    // Get all unique addresses from tip_history
    const addressesResult = await database.pool.query(`
      SELECT DISTINCT from_address, to_address 
      FROM tip_history 
      WHERE from_address IS NOT NULL OR to_address IS NOT NULL
    `);
    
    const allAddresses = new Set();
    addressesResult.rows.forEach(row => {
      if (row.from_address) allAddresses.add(row.from_address);
      if (row.to_address) allAddresses.add(row.to_address);
    });
    
    const addresses = Array.from(allAddresses);
    console.log(`📊 Found ${addresses.length} unique addresses from tip_history`);
    
    if (addresses.length === 0) {
      return res.json({ success: true, message: 'No addresses found in tip_history' });
    }
    
    // Process addresses in batches of 350 (Neynar API limit)
    const batchSize = 350;
    let successCount = 0;
    let errorCount = 0;
    
    for (let i = 0; i < addresses.length; i += batchSize) {
      const batch = addresses.slice(i, i + batchSize);
      console.log(`🔍 Processing batch ${Math.floor(i/batchSize) + 1}: ${batch.length} addresses`);
      
      try {
        const neynarResponse = await neynar.fetchBulkUsersByEthOrSolAddress(batch);
        console.log(`📊 Neynar response for batch:`, Object.keys(neynarResponse).length, 'users found');
        
        // Process each user from the response
        for (const [address, users] of Object.entries(neynarResponse)) {
          if (users && users.length > 0) {
            const user = users[0]; // Take the first user if multiple
            console.log(`💾 Saving user: FID ${user.fid}, username: ${user.username}, address: ${address}`);
            const success = await database.saveUserProfile(
              user.fid,
              user.username,
              user.display_name,
              user.pfp?.url || user.pfp_url,
              user.follower_count || 0,
              address // Save the address too
            );
            
            if (success) {
              successCount++;
              console.log(`✅ Successfully saved FID ${user.fid}`);
            } else {
              errorCount++;
              console.log(`❌ Failed to save FID ${user.fid}`);
            }
          } else {
            console.log(`⚠️ No user data found for address: ${address}`);
          }
        }
      } catch (error) {
        console.error(`❌ Error processing batch ${Math.floor(i/batchSize) + 1}:`, error);
        errorCount += batch.length;
      }
    }
    
    console.log(`🎉 Migration completed! Migrated ${successCount} users, ${errorCount} errors`);
    res.json({ 
      success: true, 
      message: `Migration completed! Migrated ${successCount} users, ${errorCount} errors`,
      migrated: successCount,
      errors: errorCount,
      total: addresses.length
    });
    
  } catch (error) {
    console.error('Migration error:', error);
    res.status(500).json({ error: 'Migration failed', details: error.message });
  }
});

// Migration endpoint to populate earnings/tippings data in user_profiles
app.post('/api/migrate-user-earnings', async (req, res) => {
  try {
    console.log('🚀 Starting user earnings migration...');
    
    // Get all unique addresses from tip_history (both from and to)
    const addressesResult = await database.pool.query(`
      SELECT DISTINCT from_address, to_address 
      FROM tip_history 
      WHERE from_address IS NOT NULL OR to_address IS NOT NULL
    `);
    
    const allAddresses = new Set();
    addressesResult.rows.forEach(row => {
      if (row.from_address) allAddresses.add(row.from_address);
      if (row.to_address) allAddresses.add(row.to_address);
    });
    
    const addresses = Array.from(allAddresses);
    console.log(`📊 Found ${addresses.length} unique addresses from tip_history`);
    
    let successCount = 0;
    let errorCount = 0;
    
    for (const address of addresses) {
      try {
        // Calculate earnings and tippings for this address
        const earningsResult = await database.pool.query(`
          SELECT 
            SUM(CASE WHEN to_address = $1 THEN amount ELSE 0 END) as total_earnings,
            SUM(CASE WHEN from_address = $1 THEN amount ELSE 0 END) as total_tippings,
            SUM(CASE WHEN to_address = $1 AND created_at >= NOW() - INTERVAL '24 hours' THEN amount ELSE 0 END) as earnings_24h,
            SUM(CASE WHEN from_address = $1 AND created_at >= NOW() - INTERVAL '24 hours' THEN amount ELSE 0 END) as tippings_24h,
            SUM(CASE WHEN to_address = $1 AND created_at >= NOW() - INTERVAL '7 days' THEN amount ELSE 0 END) as earnings_7d,
            SUM(CASE WHEN from_address = $1 AND created_at >= NOW() - INTERVAL '7 days' THEN amount ELSE 0 END) as tippings_7d,
            SUM(CASE WHEN to_address = $1 AND created_at >= NOW() - INTERVAL '30 days' THEN amount ELSE 0 END) as earnings_30d,
            SUM(CASE WHEN from_address = $1 AND created_at >= NOW() - INTERVAL '30 days' THEN amount ELSE 0 END) as tippings_30d
          FROM tip_history 
          WHERE (to_address = $1 OR from_address = $1)
            AND token_address = '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913'
        `, [address]);
        
        const stats = earningsResult.rows[0];
        const totalEarnings = parseFloat(stats.total_earnings) || 0;
        const totalTippings = parseFloat(stats.total_tippings) || 0;
        
        // Only update if there's actual activity
        if (totalEarnings > 0 || totalTippings > 0) {
          // Check if user exists in user_profiles
          const userResult = await database.pool.query(
            'SELECT fid FROM user_profiles WHERE user_address = $1',
            [address]
          );
          
          if (userResult.rows.length > 0) {
            // Update existing user
            await database.pool.query(`
              UPDATE user_profiles SET 
                total_earnings = $1,
                total_tippings = $2,
                earnings_24h = $3,
                tippings_24h = $4,
                earnings_7d = $5,
                tippings_7d = $6,
                earnings_30d = $7,
                tippings_30d = $8,
                updated_at = NOW()
              WHERE user_address = $9
            `, [
              totalEarnings,
              totalTippings,
              parseFloat(stats.earnings_24h) || 0,
              parseFloat(stats.tippings_24h) || 0,
              parseFloat(stats.earnings_7d) || 0,
              parseFloat(stats.tippings_7d) || 0,
              parseFloat(stats.earnings_30d) || 0,
              parseFloat(stats.tippings_30d) || 0,
              address
            ]);
            
            console.log(`✅ Updated earnings for address ${address}: ${totalEarnings} earned, ${totalTippings} tipped`);
            successCount++;
          } else {
            console.log(`⚠️ No user profile found for address ${address}, skipping earnings update`);
          }
        }
      } catch (error) {
        console.error(`❌ Error updating earnings for address ${address}:`, error);
        errorCount++;
      }
    }
    
    console.log(`🎉 Earnings migration completed! Updated ${successCount} users, ${errorCount} errors`);
    res.json({ 
      success: true, 
      message: `Earnings migration completed! Updated ${successCount} users, ${errorCount} errors`,
      updated: successCount,
      errors: errorCount
    });
    
  } catch (error) {
    console.error('Earnings migration error:', error);
    res.status(500).json({ error: 'Earnings migration failed', details: error.message });
  }
});
app.get('/api/debug/user-profiles', async (req, res) => {
  try {
    const result = await database.pool.query(`
      SELECT fid, username, display_name, pfp_url, follower_count, updated_at 
      FROM user_profiles 
      ORDER BY updated_at DESC 
      LIMIT 10
    `);
    
    res.json({
      count: result.rows.length,
      profiles: result.rows
    });
  } catch (error) {
    console.error('Error fetching user profiles:', error);
    res.status(500).json({ error: 'Failed to fetch user profiles' });
  }
});

// Test migration with just 1 address to verify the fix works
app.post('/api/test-migration', async (req, res) => {
  try {
    console.log('🧪 Testing migration with 1 address...');
    
    // Get just 1 address from tip_history
    const addressesResult = await database.pool.query(`
      SELECT DISTINCT from_address as user_address
      FROM tip_history 
      WHERE LOWER(token_address) = '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913'
      LIMIT 1
    `);
    
    if (addressesResult.rows.length === 0) {
      return res.json({ error: 'No addresses found in tip_history' });
    }
    
    const address = addressesResult.rows[0].user_address;
    console.log(`🔍 Testing with address: ${address}`);
    
    // Fetch user data from Neynar API
    const response = await fetch(`https://api.neynar.com/v2/farcaster/user/bulk-by-address?addresses=${address}`, {
      headers: {
        'api_key': process.env.NEYNAR_API_KEY,
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      return res.json({ error: `Neynar API error: ${response.status}` });
    }

    const data = await response.json();
    console.log('📊 Neynar response:', JSON.stringify(data, null, 2));

    if (data.result && data.result.users && data.result.users.length > 0) {
      const user = data.result.users[0];
      
      // Test the fixed saveUserProfile call
      await database.saveUserProfile(
        user.fid,
        user.username || `user_${user.custodyAddress?.slice(0, 8) || 'unknown'}`,
        user.displayName || `User ${user.custodyAddress?.slice(0, 8) || 'unknown'}`,
        user.pfp?.url || '',
        user.followerCount || 0
      );
      
      res.json({ 
        success: true, 
        message: 'Test migration successful!',
        user: {
          fid: user.fid,
          username: user.username,
          displayName: user.displayName
        }
      });
    } else {
      res.json({ error: 'No user found for this address' });
    }
    
  } catch (error) {
    console.error('Test migration error:', error);
    res.status(500).json({ error: 'Test migration failed', details: error.message });
  }
});

// Test endpoint to simulate a tip (for debugging leaderboard updates)
app.post('/api/debug/simulate-tip', async (req, res) => {
  try {
    const { fromAddress, toAddress, amount = '0.01', actionType = 'like' } = req.body;
    
    if (!fromAddress || !toAddress) {
      return res.status(400).json({ error: 'fromAddress and toAddress are required' });
    }
    
    console.log(`🧪 SIMULATING TIP: ${fromAddress} → ${toAddress} (${amount} ${actionType})`);
    
    // Simulate a tip being recorded
    await database.addTipHistory({
      fromAddress: fromAddress.toLowerCase(),
      toAddress: toAddress.toLowerCase(),
      tokenAddress: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', // USDC
      amount: amount,
      actionType: actionType,
      castHash: 'test-cast-hash-' + Date.now(),
      transactionHash: '0xtest' + Date.now()
    });
    
    console.log(`✅ TIP SIMULATED AND SAVED`);
    
    // Immediately check if it appears in 24h leaderboard
    const topTippers = await database.getTopTippers('24h');
    const topEarners = await database.getTopEarners('24h');
    
    res.json({
      success: true,
      message: 'Tip simulated successfully',
      tip: {
        fromAddress,
        toAddress,
        amount,
        actionType
      },
      verification: {
        tippersIn24h: topTippers.length,
        earnersIn24h: topEarners.length,
        foundTipper: topTippers.find(t => t.userAddress.toLowerCase() === fromAddress.toLowerCase()),
        foundEarner: topEarners.find(e => e.userAddress.toLowerCase() === toAddress.toLowerCase())
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error simulating tip:', error);
    res.status(500).json({ error: 'Failed to simulate tip', details: error.message });
  }
});

// Debug endpoint to check user's token configuration
app.get('/api/debug/user-token/:userAddress', async (req, res) => {
  try {
    const { userAddress } = req.params;
    const userConfig = await database.getUserConfig(userAddress.toLowerCase());
    
    if (!userConfig) {
      return res.json({
        success: false,
        message: 'No user config found',
        userAddress: userAddress.toLowerCase()
      });
    }
    
    // Get token info
    let tokenInfo = null;
    if (userConfig.tokenAddress) {
      try {
        const tokenDecimals = await getTokenDecimals(userConfig.tokenAddress);
        tokenInfo = {
          address: userConfig.tokenAddress,
          decimals: tokenDecimals
        };
      } catch (error) {
        tokenInfo = { error: 'Could not fetch token info' };
      }
    }
    
    res.json({
      success: true,
      userAddress: userAddress.toLowerCase(),
      config: {
        tokenAddress: userConfig.tokenAddress,
        isActive: userConfig.isActive,
        likeAmount: userConfig.likeAmount,
        replyAmount: userConfig.replyAmount,
        recastAmount: userConfig.recastAmount,
        spendingLimit: userConfig.spendingLimit
      },
      tokenInfo,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error getting user token config:', error);
    res.status(500).json({ error: 'Failed to get user token config' });
  }
});

// Test SQL query directly
app.get('/api/debug/test-sql', async (req, res) => {
  try {
    const { timeFilter = '24h' } = req.query;
    
    if (!database.pool) {
      return res.status(500).json({ error: 'No database pool available' });
    }
    
    const intervalValue = timeFilter === '24h' ? '1 day' :
                         timeFilter === '7d' ? '7 days' : '30 days';
    
    console.log(`🧪 Testing SQL query with interval: ${intervalValue}`);
    
    // Test the exact queries used in leaderboard
    const tippersQuery = `
      SELECT 
        from_address as user_address,
        SUM(CAST(amount AS DECIMAL)) as total_amount,
        COUNT(*) as tip_count,
        MIN(processed_at) as earliest_tip,
        MAX(processed_at) as latest_tip
      FROM tip_history 
      WHERE processed_at > NOW() - INTERVAL $1
      GROUP BY from_address 
      ORDER BY total_amount DESC 
      LIMIT 10
    `;
    
    const earnersQuery = `
      SELECT 
        to_address as user_address,
        SUM(CAST(amount AS DECIMAL)) as total_amount,
        COUNT(*) as tip_count,
        MIN(processed_at) as earliest_tip,
        MAX(processed_at) as latest_tip
      FROM tip_history 
      WHERE processed_at > NOW() - INTERVAL $1
      GROUP BY to_address 
      ORDER BY total_amount DESC 
      LIMIT 10
    `;
    
    const [tippersResult, earnersResult, allTipsResult] = await Promise.all([
      database.pool.query(tippersQuery, [intervalValue]),
      database.pool.query(earnersQuery, [intervalValue]),
      database.pool.query(`
        SELECT from_address, to_address, amount, processed_at, 
               NOW() as current_time,
               NOW() - INTERVAL $1 as cutoff_time
        FROM tip_history 
        ORDER BY processed_at DESC 
        LIMIT 5
      `, [intervalValue])
    ]);
    
    res.json({
      success: true,
      timeFilter,
      intervalValue,
      results: {
        tippers: tippersResult.rows,
        earners: earnersResult.rows,
        recentTips: allTipsResult.rows
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('❌ SQL test failed:', error);
    res.status(500).json({ error: error.message });
  }
});

// Simple endpoint to check database connection and tip count
app.get('/api/debug/db-status', async (req, res) => {
  try {
    console.log('🔍 Checking database status...');
    
    // Check database connection
    const totalTips = await database.getTotalTips();
    const recentTips = await database.getRecentTips(5);
    
    // Check if we can query tip_history table directly
    let directQuery = null;
    try {
      if (database.pool) {
        const result = await database.pool.query('SELECT COUNT(*) as count, MAX(processed_at) as latest FROM tip_history');
        directQuery = {
          totalCount: result.rows[0].count,
          latestTip: result.rows[0].latest
        };
      }
    } catch (error) {
      directQuery = { error: error.message };
    }
    
    res.json({
      success: true,
      database: {
        totalTips,
        recentTipsCount: recentTips.length,
        recentTips: recentTips.map(tip => ({
          from: tip.fromAddress,
          to: tip.toAddress,
          amount: tip.amount,
          processedAt: tip.processedAt
        })),
        directQuery
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('❌ Database status check failed:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Debug endpoint to verify EcionBatch contract status
app.get('/api/debug/ecionbatch-status', async (req, res) => {
  try {
    const { ethers } = require('ethers');
    const provider = new ethers.JsonRpcProvider(process.env.BASE_RPC_URL);
    const wallet = new ethers.Wallet(process.env.BACKEND_WALLET_PRIVATE_KEY, provider);
    
    const ecionBatchAddress = process.env.ECION_BATCH_CONTRACT_ADDRESS || '0x2f47bcc17665663d1b63e8d882faa0a366907bb8';
    
    // Check if contract exists
    const code = await provider.getCode(ecionBatchAddress);
    const contractExists = code !== '0x';
    
    let contractInfo = {
      address: ecionBatchAddress,
      exists: contractExists,
      backendWallet: wallet.address
    };
    
    if (contractExists) {
      try {
        // Check if backend wallet is an executor
        const contract = new ethers.Contract(ecionBatchAddress, [
          "function isExecutor(address executor) external view returns (bool)",
          "function owner() public view virtual returns (address)"
        ], provider);
        
        const isExecutor = await contract.isExecutor(wallet.address);
        const owner = await contract.owner();
        
        contractInfo.isExecutor = isExecutor;
        contractInfo.owner = owner;
        contractInfo.status = isExecutor ? 'Ready' : 'Backend wallet not authorized as executor';
      } catch (error) {
        contractInfo.error = error.message;
        contractInfo.status = 'Contract call failed';
      }
    } else {
      contractInfo.status = 'Contract not deployed at this address';
    }
    
    res.json({
      success: true,
      contract: contractInfo,
      note: 'EcionBatch supports all ERC20 tokens via tokens[] parameter',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error checking EcionBatch status:', error);
    res.status(500).json({ error: 'Failed to check EcionBatch status' });
  }
});

// Debug endpoint to check blocklist status
app.get('/api/debug/blocklist-status/:userAddress', async (req, res) => {
  try {
    const { userAddress } = req.params;
    console.log(`🔧 DEBUG: Checking blocklist status for ${userAddress}`);
    
    // Check database blocklist
    const databaseBlocklist = await database.getBlocklist();
    const isInDatabaseBlocklist = databaseBlocklist.includes(userAddress.toLowerCase());
    
    // Check memory blocklist
    const isInMemoryBlocklist = batchTransferManager ? batchTransferManager.isUserBlocked(userAddress) : 'N/A';
    
    // Check user config
    const userConfig = await database.getUserConfig(userAddress);
    const minTipAmount = userConfig ? 
      parseFloat(userConfig.likeAmount || '0') + 
      parseFloat(userConfig.recastAmount || '0') + 
      parseFloat(userConfig.replyAmount || '0') : 'N/A';
    
    res.json({
      success: true,
      userAddress,
      databaseBlocklist: databaseBlocklist,
      isInDatabaseBlocklist,
      isInMemoryBlocklist,
      userConfig: userConfig ? {
        likeAmount: userConfig.likeAmount,
        recastAmount: userConfig.recastAmount,
        replyAmount: userConfig.replyAmount,
        minTipAmount
      } : null,
      batchTransferManagerAvailable: !!batchTransferManager,
      removeFromBlocklistAvailable: !!(batchTransferManager && batchTransferManager.removeFromBlocklist)
    });
  } catch (error) {
    console.error('Error checking blocklist status:', error);
    res.status(500).json({ error: 'Failed to check blocklist status' });
  }
});

// Debug endpoint to check and clean blocklist
app.post('/api/debug/clean-blocklist', async (req, res) => {
  try {
    console.log(`🔧 CLEANING: Checking all blocklisted users for sufficient allowance`);
    
    const currentBlocklist = await database.getBlocklist();
    console.log(`🔧 Current blocklist:`, currentBlocklist);
    
    const cleanedBlocklist = [];
    const removedUsers = [];
    
    for (const userAddress of currentBlocklist || []) {
      try {
        // Get user config
        const userConfig = await database.getUserConfig(userAddress);
        if (!userConfig) {
          console.log(`🔧 User ${userAddress} not found in config, removing from blocklist`);
          removedUsers.push(userAddress);
          continue;
        }
        
        const { tokenAddress, likeAmount, recastAmount, replyAmount } = userConfig;
        const minTipAmount = likeAmount + recastAmount + replyAmount;
        
        // Check current blockchain allowance
        const currentBlockchainAllowance = await batchTransferManager.getCurrentBlockchainAllowance(userAddress, tokenAddress);
        
        console.log(`🔧 Checking ${userAddress}: allowance=${currentBlockchainAllowance}, minTip=${minTipAmount}`);
        
        if (currentBlockchainAllowance >= minTipAmount) {
          console.log(`✅ User ${userAddress} has sufficient allowance, removing from blocklist`);
          removedUsers.push(userAddress);
        } else {
          console.log(`❌ User ${userAddress} still has insufficient allowance, keeping in blocklist`);
          cleanedBlocklist.push(userAddress);
        }
      } catch (error) {
        console.error(`❌ Error checking ${userAddress}:`, error);
        // Keep in blocklist if we can't check
        cleanedBlocklist.push(userAddress);
      }
    }
    
    // Update database with cleaned blocklist
    await database.setBlocklist(cleanedBlocklist);
    
    // Update BlocklistService memory
    if (global.blocklistService) {
      global.blocklistService.clearBlocklist();
      // Reload from database
      await global.blocklistService.loadFromDatabase();
    }
    
    res.json({ 
      success: true, 
      message: `Blocklist cleaned`,
      removedUsers,
      cleanedBlocklist,
      removedCount: removedUsers.length,
      remainingCount: cleanedBlocklist.length
    });
  } catch (error) {
    console.error('Error cleaning blocklist:', error);
    res.status(500).json({ error: 'Failed to clean blocklist' });
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Ecion Backend running on port ${PORT}`);
  console.log(`📊 Environment: ${process.env.NODE_ENV}`);
  console.log(`⏰ Batch interval: ${process.env.BATCH_INTERVAL_MINUTES || 1} minutes`);
  if (process.env.NODE_ENV === 'production') {
    console.log(`🌐 Frontend also served from this Railway service`);
  }
  
  // Blocklist persists - only updates on approve/revoke transactions
  console.log(`📋 BlocklistService initialized with ${global.blocklistService ? global.blocklistService.getBlocklistSize() : 0} blocked users`);
  
  // Run cleanup once on startup (non-blocking)
  setTimeout(() => {
    database.cleanupOldTips().catch(err => console.log('Cleanup failed:', err.message));
  }, 30000); // Wait 30 seconds after startup
});

// Export functions for use in other modules
module.exports = {
  app,
  getUserFid,
  sendNeynarNotification,
  sendFarcasterNotification,
  sendBulkNotification,
  hasNotificationTokens
};
// Clear all blocklist entries
app.post('/api/clear-blocklist', async (req, res) => {
  try {
    console.log('🧹 Clearing all blocklist entries...');
    
    // Clear blocklist table (only if using PostgreSQL)
    if (database.pool) {
      await database.pool.query('DELETE FROM blocklist');
      console.log('✅ Cleared blocklist table');
    } else {
      console.log('ℹ️ Using file-based storage - no database table to clear');
    }
    
    // Clear blocklistService cache
    if (global.blocklistService) {
      global.blocklistService.clearBlocklist();
      console.log('✅ Cleared blocklistService cache');
    }
    
    res.json({
      success: true,
      message: 'Blocklist cleared - system will rebuild based on current allowances',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('❌ Error clearing blocklist:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Force process current batch
app.post('/api/force-process-batch', async (req, res) => {
  try {
    console.log('🚀 Force processing current batch...');
    
    if (batchTransferManager) {
      const result = await batchTransferManager.forceProcessBatch();
      const status = batchTransferManager.getBatchStatus();
      
      res.json({
        success: result.success,
        message: result.success ? 'Batch processed successfully' : result.reason,
        batchStatus: status,
        timestamp: new Date().toISOString()
      });
    } else {
      res.status(500).json({
        success: false,
        error: 'BatchTransferManager not available'
      });
    }
  } catch (error) {
    console.error('❌ Error force processing batch:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});
