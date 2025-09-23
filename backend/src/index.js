const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const cron = require('node-cron');
require('dotenv').config();

const webhookHandler = require('./webhook');
const batchProcessor = require('./batchProcessor');
const { initializeContracts } = require('./contracts');

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(helmet());
app.use(cors());
app.use(morgan('combined'));
app.use(express.json({ limit: '10mb' }));

// Health check
app.get('/health', (req, res) => {
  res.json({ 
    status: 'healthy', 
    timestamp: new Date().toISOString(),
    version: '1.0.0'
  });
});

// Webhook endpoint for Neynar
app.post('/webhook/neynar', webhookHandler);

// Batch processing endpoint (for manual triggers)
app.post('/batch/process', async (req, res) => {
  try {
    const result = await batchProcessor.processBatch();
    res.json({ success: true, result });
  } catch (error) {
    console.error('Batch processing error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get pending interactions
app.get('/interactions/pending', (req, res) => {
  const pending = batchProcessor.getPendingInteractions();
  res.json({ 
    count: pending.length,
    interactions: pending.slice(0, 10) // Show first 10
  });
});

// Initialize contracts
async function startServer() {
  try {
    await initializeContracts();
    console.log('✅ Contracts initialized');
    
    // Start batch processing cron job
    cron.schedule(`*/${process.env.BATCH_INTERVAL_MINUTES || 1} * * * *`, async () => {
      console.log('🔄 Running batch processing...');
      try {
        await batchProcessor.processBatch();
      } catch (error) {
        console.error('❌ Batch processing failed:', error);
      }
    });
    
    app.listen(PORT, () => {
      console.log(`🚀 PIT Backend running on port ${PORT}`);
      console.log(`📡 Webhook endpoint: http://localhost:${PORT}/webhook/neynar`);
      console.log(`⏰ Batch processing every ${process.env.BATCH_INTERVAL_MINUTES || 1} minute(s)`);
    });
  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
}

startServer();