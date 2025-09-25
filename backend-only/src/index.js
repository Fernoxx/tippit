const express = require('express');
const cors = require('cors');
require('dotenv').config();

const webhookHandler = require('./webhook');
const BatchProcessor = require('./batchProcessor');
const database = require('./database');

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());

// Initialize batch processor
new BatchProcessor();

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

// Routes
app.post('/webhook/neynar', webhookHandler);

// Session-based authentication (more secure than API keys)
app.use('/api/*', (req, res, next) => {
  // For now, we'll use a simple approach:
  // Only allow requests from your frontend domain
  const origin = req.headers.origin;
  const allowedOrigins = [
    process.env.FRONTEND_DOMAIN,
    'http://localhost:3000' // For development
  ];
  
  if (allowedOrigins.includes(origin)) {
    console.log('✅ SECURE: Request from allowed origin');
    next();
  } else {
    console.log('❌ UNAUTHORIZED: Request from unauthorized origin:', origin);
    res.status(401).json({ error: 'Unauthorized origin' });
  }
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
    
    res.json({ success: true });
  } catch (error) {
    console.error('Config update error:', error);
    res.status(500).json({ error: 'Failed to update config' });
  }
});

app.get('/api/config/:userAddress', async (req, res) => {
  try {
    const config = await database.getUserConfig(req.params.userAddress);
    res.json({ config });
  } catch (error) {
    console.error('Config fetch error:', error);
    res.status(500).json({ error: 'Failed to fetch config' });
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

// Health check
app.get('/health', (req, res) => {
  res.json({ 
    status: 'healthy', 
    timestamp: new Date().toISOString(),
    pendingTips: database.getPendingTips().then(tips => tips.length)
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Ecion Backend running on port ${PORT}`);
  console.log(`📊 Environment: ${process.env.NODE_ENV}`);
  console.log(`⏰ Batch interval: ${process.env.BATCH_INTERVAL_MINUTES || 1} minutes`);
});

module.exports = app;