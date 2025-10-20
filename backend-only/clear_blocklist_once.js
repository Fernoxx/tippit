// One-time script to clear the current blocklist
const { Pool } = require('pg');
require('dotenv').config();

async function clearBlocklistOnce() {
  let pool;
  
  try {
    console.log('🧹 ONE-TIME: Clearing current blocklist to start fresh...');
    
    // Try PostgreSQL first
    if (process.env.DATABASE_URL) {
      pool = new Pool({
        connectionString: process.env.DATABASE_URL,
        ssl: { rejectUnauthorized: false }
      });
      
      console.log('🗄️ Connected to PostgreSQL database');
      
      // Clear blocklist table
      const result = await pool.query('DELETE FROM blocklist');
      console.log(`✅ Cleared ${result.rowCount} users from blocklist table`);
      
      // Clear follow_tips table too
      try {
        const followResult = await pool.query('DELETE FROM follow_tips');
        console.log(`✅ Cleared ${followResult.rowCount} users from follow_tips table`);
      } catch (err) {
        console.log('ℹ️ follow_tips table may not exist');
      }
      
    } else {
      console.log('❌ No DATABASE_URL - using file storage');
      console.log('ℹ️ File-based blocklist will be rebuilt automatically');
    }
    
    console.log('✅ ONE-TIME CLEAR COMPLETE - Blocklist will now work properly');
    console.log('📋 From now on, blocklist only updates on approve/revoke transactions');
    
  } catch (error) {
    console.error('❌ Error clearing blocklist:', error.message);
  } finally {
    if (pool) {
      await pool.end();
    }
  }
}

clearBlocklistOnce();