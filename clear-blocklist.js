// Simple script to clear the in-memory blocklist
// This will be used by the running server to clear the blocklist

const express = require('express');
const app = express();

// Import the batchTransferManager
const { batchTransferManager } = require('./backend-only/src/batchTransferManager');

app.get('/clear-blocklist', (req, res) => {
  try {
    console.log('Current blocklist before clear:', Array.from(batchTransferManager.blockedUsers));
    batchTransferManager.blockedUsers.clear();
    console.log('Blocklist cleared!');
    console.log('New blocklist:', Array.from(batchTransferManager.blockedUsers));
    
    res.json({
      success: true,
      message: 'Blocklist cleared successfully',
      previousCount: batchTransferManager.blockedUsers.size,
      currentCount: 0
    });
  } catch (error) {
    console.error('Error clearing blocklist:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

app.listen(3002, () => {
  console.log('Blocklist clear server running on port 3002');
  console.log('Visit: http://localhost:3002/clear-blocklist');
});