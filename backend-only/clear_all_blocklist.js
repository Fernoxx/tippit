const database = require('./src/database-pg');

async function clearAllBlocklist() {
  try {
    console.log('🧹 Clearing all blocklist entries...');
    
    // Clear blocklist table
    await database.pool.query('DELETE FROM blocklist');
    console.log('✅ Cleared blocklist table');
    
    // Clear any cached blocklist data
    console.log('✅ Blocklist cleared - system will rebuild based on current allowances');
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Error clearing blocklist:', error);
    process.exit(1);
  }
}

clearAllBlocklist();
