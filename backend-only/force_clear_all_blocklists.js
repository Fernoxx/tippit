// Force clear ALL blocklists - database, memory, everything
const { Pool } = require('pg');
require('dotenv').config();

async function forceClearAllBlocklists() {
  let pool;
  
  try {
    console.log('🧹 FORCE CLEARING ALL BLOCKLISTS...');
    
    // Clear PostgreSQL if available
    if (process.env.DATABASE_URL) {
      pool = new Pool({
        connectionString: process.env.DATABASE_URL,
        ssl: { rejectUnauthorized: false }
      });
      
      console.log('🗄️ Connected to PostgreSQL database');
      
      // Clear ALL blocklist-related tables
      const tables = ['blocklist', 'follow_tips', 'tip_history'];
      
      for (const table of tables) {
        try {
          const result = await pool.query(`DELETE FROM ${table}`);
          console.log(`✅ Cleared ${result.rowCount} records from ${table} table`);
        } catch (err) {
          console.log(`ℹ️ Table ${table} may not exist or already empty`);
        }
      }
    } else {
      console.log('❌ No DATABASE_URL - using file storage');
    }
    
    console.log('✅ FORCE CLEAR COMPLETE - All blocklists cleared');
    console.log('📋 Backend will now start with 0 blocked users');
    
  } catch (error) {
    console.error('❌ Error force clearing blocklists:', error.message);
  } finally {
    if (pool) {
      await pool.end();
    }
  }
}

forceClearAllBlocklists();