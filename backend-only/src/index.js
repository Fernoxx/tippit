const express = require('express');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const webhookHandler = require('./webhook');
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

// Token allowance endpoint
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
    
    console.log(`📊 Allowance check: User ${userAddress} approved ${formattedAllowance} tokens (${tokenAddress}) to EcionBatch contract ${ecionBatchAddress}`);
    
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
      const user = data.users?.[0];
      if (user?.fid) {
        // Cache the FID
        userFidMap.set(userAddress.toLowerCase(), user.fid);
        console.log(`✅ Found FID ${user.fid} for address ${userAddress}`);
        return user.fid;
      } else {
        console.log(`⚠️ No Farcaster account found for address: ${userAddress}`);
      }
    } else if (response.status === 402) {
      console.log(`⚠️ Neynar API requires payment for address lookup - skipping ${userAddress}`);
    } else {
      console.log(`⚠️ Neynar API error for ${userAddress}: ${response.status} - skipping`);
    }
  } catch (error) {
    console.log(`⚠️ Error getting FID for ${userAddress}: ${error.message} - skipping`);
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
    
    // Calculate minimum tip amount
    const likeAmount = parseFloat(userConfig.likeAmount || '0');
    const recastAmount = parseFloat(userConfig.recastAmount || '0');
    const replyAmount = parseFloat(userConfig.replyAmount || '0');
    const tipAmounts = [likeAmount, recastAmount, replyAmount].filter(amount => amount > 0);
    const minTipAmount = tipAmounts.length > 0 ? Math.min(...tipAmounts) : 0;
    
    const hasAllowance = allowanceAmount >= minTipAmount;
    console.log(`🔍 Allowance check: ${userAddress} - allowance: ${allowanceAmount}, min tip: ${minTipAmount}, has allowance: ${hasAllowance}`);
    
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
      const success = await removeFidFromWebhook(fid);
      if (success) {
        console.log(`✅ User ${userAddress} (FID: ${fid}) has insufficient allowance - removed from webhook`);
      }
    }
    
    return true;
  } catch (error) {
    console.log(`⚠️ Error updating webhook status for ${userAddress}: ${error.message} - skipping`);
    return false;
  }
}

// OLD PERIODIC CLEANUP REMOVED - Now using allowance sync system that updates webhooks every 3 hours

// Send Neynar Frame V2 notification using correct API
async function sendNeynarNotification(recipientFid, title, message, targetUrl = "https://ecion.vercel.app") {
  try {
    // Use the correct Neynar API format from docs
    const response = await fetch('https://api.neynar.com/v2/farcaster/notifications', {
      method: 'POST',
      headers: {
        'x-api-key': process.env.NEYNAR_API_KEY,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        target_fids: [recipientFid], // Target specific FID
        filters: {}, // No additional filters
        notification: {
          title: title,
          body: message,
          target_url: targetUrl
        }
      })
    });
    
    if (response.ok) {
      const result = await response.json();
      console.log(`✅ Notification sent to FID ${recipientFid}: ${title}`, result);
      return true;
    } else {
      const errorText = await response.text();
      console.log(`❌ Failed to send notification to FID ${recipientFid}: ${errorText}`);
      return false;
    }
  } catch (error) {
    console.log(`⚠️ Error sending notification to FID ${recipientFid}: ${error.message}`);
    return false;
  }
}

// Send notification to multiple users with filters
async function sendBulkNotification(targetFids, title, message, filters = {}, targetUrl = "https://ecion.vercel.app") {
  try {
    const response = await fetch('https://api.neynar.com/v2/farcaster/notifications', {
      method: 'POST',
      headers: {
        'x-api-key': process.env.NEYNAR_API_KEY,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        target_fids: targetFids, // Array of FIDs or empty for all users
        filters: filters, // Filtering criteria
        notification: {
          title: title,
          body: message,
          target_url: targetUrl
        }
      })
    });
    
    if (response.ok) {
      const result = await response.json();
      console.log(`✅ Bulk notification sent to ${targetFids.length} users: ${title}`, result);
      return true;
    } else {
      const errorText = await response.text();
      console.log(`❌ Failed to send bulk notification: ${errorText}`);
      return false;
    }
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
      const tipAmounts = [likeAmount, recastAmount, replyAmount].filter(amount => amount > 0);
      const minTipAmount = tipAmounts.length > 0 ? Math.min(...tipAmounts) : 0;
      
      if (allowanceAmount < minTipAmount) {
        console.log(`🚫 User ${userAddress} allowance ${allowanceAmount} < min tip ${minTipAmount} - removing from webhook`);
        const fid = await getUserFid(userAddress);
        if (fid) {
          await removeFidFromWebhook(fid);
          
          // Send allowance empty notification ONLY if:
          // 1. Previous allowance was > 0 (user had allowance before)
          // 2. Current allowance is 0 (now empty)
          // 3. Haven't sent notification yet for this allowance drop
          if (previousAllowance > 0 && allowanceAmount === 0 && !userConfig.allowanceEmptyNotificationSent) {
            await sendNeynarNotification(
              fid,
              "Allowance Empty",
              "Approve more USDC to continue tip your audience!",
              "https://ecion.vercel.app"
            );
            
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
      
      // Add to daily earnings for this specific token
      dailyEarningsByUser[recipientAddress][tokenAddress] += amount;
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
          tokenEarningsList.push(`Earned ${formattedAmount} $${symbol}`);
        }
        
        // Join all earnings with " and " separator
        dailyEarningsMessage = tokenEarningsList.join(" and ");
        
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

// Real-time allowance monitoring for active users (every 30 seconds)
setInterval(async () => {
  try {
    console.log('🔍 Running real-time allowance check...');
    await checkActiveUsersAllowances();
  } catch (error) {
    console.log('⚠️ Error in real-time allowance check:', error.message);
  }
}, 30 * 1000); // Every 30 seconds

// Check allowances for recently active users in real-time
async function checkActiveUsersAllowances() {
  try {
    // Get users who have been active in the last hour
    const oneHourAgo = Date.now() - (60 * 60 * 1000);
    const activeUsers = await database.getActiveUsersWithApprovals();
    
    if (!activeUsers || activeUsers.length === 0) {
      return;
    }
    
    const { ethers } = require('ethers');
    const provider = new ethers.JsonRpcProvider(process.env.BASE_RPC_URL);
    const ecionBatchAddress = process.env.ECION_BATCH_CONTRACT_ADDRESS || '0x2f47bcc17665663d1b63e8d882faa0a366907bb8';
    
    let checkedCount = 0;
    let updatedCount = 0;
    
    for (const userAddress of activeUsers) {
      try {
        // Get user config to check if they were recently active
        const userConfig = await database.getUserConfig(userAddress);
        if (!userConfig) continue;
        
        // Only check users who have been active in the last hour
        const lastActivity = userConfig.lastActivity || 0;
        if (lastActivity < oneHourAgo) {
          continue; // Skip inactive users
        }
        
        const tokenAddress = userConfig.tokenAddress || '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
        const currentDatabaseAllowance = userConfig.lastAllowance || 0;
        
        // Get current allowance from blockchain
        const tokenContract = new ethers.Contract(tokenAddress, [
          "function decimals() view returns (uint8)"
        ], provider);
        
        const decimals = await tokenContract.decimals();
        
        const allowanceContract = new ethers.Contract(tokenAddress, [
          "function allowance(address owner, address spender) view returns (uint256)"
        ], provider);
        
        const allowance = await allowanceContract.allowance(userAddress, ecionBatchAddress);
        const currentBlockchainAllowance = parseFloat(ethers.formatUnits(allowance, decimals));
        
        // Check if allowance has changed significantly (more than 1% difference)
        const allowanceDifference = Math.abs(currentBlockchainAllowance - currentDatabaseAllowance);
        const significantChange = allowanceDifference > Math.max(currentDatabaseAllowance * 0.01, 0.001); // 1% or 0.001 minimum
        
        if (significantChange) {
          console.log(`🔄 Allowance changed for ${userAddress}: ${currentDatabaseAllowance} → ${currentBlockchainAllowance}`);
          
          // Update database with new allowance
          await updateDatabaseAllowance(userAddress, currentBlockchainAllowance);
          
          // Update webhook status immediately
          try {
            await updateUserWebhookStatus(userAddress);
            console.log(`🔗 Updated webhook status for ${userAddress} after real-time allowance change`);
          } catch (webhookError) {
            console.log(`⚠️ Webhook update failed for ${userAddress}: ${webhookError.message}`);
          }
          
          updatedCount++;
        }
        
        checkedCount++;
        
        // Small delay to avoid rate limits
        await new Promise(resolve => setTimeout(resolve, 100));
        
      } catch (error) {
        console.log(`⚠️ Error checking allowance for ${userAddress}: ${error.message}`);
      }
    }
    
    if (checkedCount > 0) {
      console.log(`🔍 Real-time allowance check completed: ${checkedCount} checked, ${updatedCount} updated`);
    }
    
  } catch (error) {
    console.log(`⚠️ Error in real-time allowance check: ${error.message}`);
  }
}

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

// Test endpoint for bulk notifications with filters
app.post('/api/test-bulk-notification', async (req, res) => {
  try {
    const { targetFids = [], filters = {}, title, message, targetUrl } = req.body;
    
    if (!title || !message) {
      return res.status(400).json({ error: 'Title and message are required' });
    }
    
    const result = await sendBulkNotification(
      targetFids,
      title,
      message,
      filters,
      targetUrl || 'https://ecion.vercel.app'
    );
    
    res.json({ 
      success: result,
      message: 'Bulk notification sent',
      targetFids: targetFids.length,
      filters: filters
    });
  } catch (error) {
    console.error('Test bulk notification error:', error);
    res.status(500).json({ error: 'Failed to send bulk notification' });
  }
});

// ===== END DYNAMIC FID MANAGEMENT SYSTEM =====

// Export functions for use in other modules
module.exports = {
  updateUserWebhookStatus,
  getUserFid,
  checkUserAllowanceForWebhook,
  addFidToWebhook,
  removeFidFromWebhook,
  sendNeynarNotification,
  sendBulkNotification,
  updateDatabaseAllowance
};

// Homepage endpoint - Show casts from users with remaining allowance (sorted by allowance)
app.get('/api/homepage', async (req, res) => {
  try {
    const { timeFilter = '24h', page = 1, limit = 50 } = req.query;
    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    
    // Get users with active configurations and token approvals
    const activeUsers = await database.getActiveUsersWithApprovals();
    const { ethers } = require('ethers');
    const provider = new ethers.JsonRpcProvider(process.env.BASE_RPC_URL);
    const ecionBatchAddress = process.env.ECION_BATCH_CONTRACT_ADDRESS || '0x2f47bcc17665663d1b63e8d882faa0a366907bb8';
    
    // Get allowance and cast for each user
    const usersWithAllowance = [];
    
    for (const userAddress of activeUsers) {
      try {
        // Get user's configured token address
        const userConfig = await database.getUserConfig(userAddress);
        const tokenAddress = userConfig?.tokenAddress || '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913'; // Default to USDC
        const tokenDecimals = await getTokenDecimals(tokenAddress);
        
        const tokenContract = new ethers.Contract(tokenAddress, [
          "function allowance(address owner, address spender) view returns (uint256)"
        ], provider);
        
        // Use database allowance (no API calls needed)
        const allowanceAmount = userConfig.lastAllowance || 0;
        console.log(`💾 Using database allowance for ${userAddress}: ${allowanceAmount}`);
        
        // Skip users with EXACTLY 0 allowance (not 0.1 or 0.2, must be 0.000000)
        if (allowanceAmount === 0) {
          console.log(`⏭️ Skipping ${userAddress} - allowance is exactly 0`);
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
        
        // Find the minimum non-zero tip amount
        const tipAmounts = [likeAmount, recastAmount, replyAmount].filter(amount => amount > 0);
        const minTipAmount = tipAmounts.length > 0 ? Math.min(...tipAmounts) : 0;
        
        // Skip if allowance is less than minimum tip amount
        if (allowanceAmount < minTipAmount) {
          console.log(`⏭️ Skipping ${userAddress} - allowance ${allowanceAmount} < min tip ${minTipAmount} (like: ${likeAmount}, recast: ${recastAmount}, reply: ${replyAmount})`);
          continue;
        }
        
        console.log(`✅ User ${userAddress} - allowance ${allowanceAmount} >= min tip ${minTipAmount} - keeping cast`);
        
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
  } catch (error) {
    console.error('Homepage fetch error:', error);
    res.status(500).json({ error: 'Failed to fetch homepage data' });
  }
});

// Leaderboard endpoints  
app.get('/api/leaderboard', async (req, res) => {
  try {
    const { timeFilter = '24h', page = 1, limit = 10 } = req.query;
    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const offset = (pageNum - 1) * limitNum;
    
    // Get top tippers and earners with amounts
    const topTippers = await database.getTopTippers(timeFilter);
    const topEarners = await database.getTopEarners(timeFilter);
    
    // Get paginated slices
    const paginatedTippers = topTippers.slice(offset, offset + limitNum);
    const paginatedEarners = topEarners.slice(offset, offset + limitNum);
    
    // Enrich tippers with user profiles and token info
    const enrichedTippers = [];
    for (const tipper of paginatedTippers) {
      try {
        // Fetch user profile
        const userResponse = await fetch(
          `https://api.neynar.com/v2/farcaster/user/bulk-by-address/?addresses=${tipper.userAddress}`,
          {
            headers: { 
              'x-api-key': process.env.NEYNAR_API_KEY,
              'x-neynar-experimental': 'false'
            }
          }
        );
        
        let farcasterUser = null;
        if (userResponse.ok) {
          const userData = await userResponse.json();
          farcasterUser = userData[tipper.userAddress]?.[0];
        }
        
        // Fetch token info
        let tokenInfo = null;
        try {
          const { ethers } = require('ethers');
          const provider = new ethers.JsonRpcProvider(process.env.BASE_RPC_URL);
          const tokenContract = new ethers.Contract(tipper.tokenAddress, [
            "function name() view returns (string)",
            "function symbol() view returns (string)",
            "function decimals() view returns (uint8)"
          ], provider);
          
          const [name, symbol, decimals] = await Promise.all([
            tokenContract.name(),
            tokenContract.symbol(),
            tokenContract.decimals()
          ]);
          
          tokenInfo = { name, symbol, decimals: Number(decimals) };
        } catch (error) {
          console.log(`Could not fetch token info for ${tipper.tokenAddress}:`, error.message);
          tokenInfo = { name: 'Unknown', symbol: 'UNK', decimals: 18 };
        }
        
        enrichedTippers.push({
          ...tipper,
          username: farcasterUser?.username,
          displayName: farcasterUser?.display_name,
          pfpUrl: farcasterUser?.pfp_url,
          tokenInfo: tokenInfo
        });
      } catch (error) {
        console.log(`Could not fetch profile for tipper ${tipper.userAddress}:`, error.message);
        enrichedTippers.push({
          ...tipper,
          tokenInfo: { name: 'Unknown', symbol: 'UNK', decimals: 18 }
        });
      }
    }
    
    // Enrich earners with user profiles and token info
    const enrichedEarners = [];
    for (const earner of paginatedEarners) {
      try {
        // Fetch user profile
        const userResponse = await fetch(
          `https://api.neynar.com/v2/farcaster/user/bulk-by-address/?addresses=${earner.userAddress}`,
          {
            headers: { 
              'x-api-key': process.env.NEYNAR_API_KEY,
              'x-neynar-experimental': 'false'
            }
          }
        );
        
        let farcasterUser = null;
        if (userResponse.ok) {
          const userData = await userResponse.json();
          farcasterUser = userData[earner.userAddress]?.[0];
        }
        
        // Fetch token info
        let tokenInfo = null;
        try {
          const { ethers } = require('ethers');
          const provider = new ethers.JsonRpcProvider(process.env.BASE_RPC_URL);
          const tokenContract = new ethers.Contract(earner.tokenAddress, [
            "function name() view returns (string)",
            "function symbol() view returns (string)",
            "function decimals() view returns (uint8)"
          ], provider);
          
          const [name, symbol, decimals] = await Promise.all([
            tokenContract.name(),
            tokenContract.symbol(),
            tokenContract.decimals()
          ]);
          
          tokenInfo = { name, symbol, decimals: Number(decimals) };
        } catch (error) {
          console.log(`Could not fetch token info for ${earner.tokenAddress}:`, error.message);
          tokenInfo = { name: 'Unknown', symbol: 'UNK', decimals: 18 };
        }
        
        enrichedEarners.push({
          ...earner,
          username: farcasterUser?.username,
          displayName: farcasterUser?.display_name,
          pfpUrl: farcasterUser?.pfp_url,
          tokenInfo: tokenInfo
        });
      } catch (error) {
        console.log(`Could not fetch profile for earner ${earner.userAddress}:`, error.message);
        enrichedEarners.push({
          ...earner,
          tokenInfo: { name: 'Unknown', symbol: 'UNK', decimals: 18 }
        });
      }
    }
    
    // Calculate pagination info
    const totalTippers = topTippers.length;
    const totalEarners = topEarners.length;
    const totalPages = Math.ceil(Math.max(totalTippers, totalEarners) / limitNum);
    const hasMore = pageNum < totalPages;
    
    res.json({
      tippers: enrichedTippers,
      earners: enrichedEarners,
      users: enrichedTippers.map(t => t.userAddress),
      amounts: enrichedTippers.map(t => t.totalAmount),
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
    const batchTransferManager = require('./src/batchTransferManager');
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
    const batchTransferManager = require('./src/batchTransferManager');
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
        
        const tipAmounts = [likeAmount, recastAmount, replyAmount].filter(amount => amount > 0);
        const minTipAmount = tipAmounts.length > 0 ? Math.min(...tipAmounts) : 0;
        
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

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Ecion Backend running on port ${PORT}`);
  console.log(`📊 Environment: ${process.env.NODE_ENV}`);
  console.log(`⏰ Batch interval: ${process.env.BATCH_INTERVAL_MINUTES || 1} minutes`);
  if (process.env.NODE_ENV === 'production') {
    console.log(`🌐 Frontend also served from this Railway service`);
  }
  
  // Run cleanup once on startup (non-blocking)
  setTimeout(() => {
    database.cleanupOldTips().catch(err => console.log('Cleanup failed:', err.message));
  }, 30000); // Wait 30 seconds after startup
});

module.exports = app;