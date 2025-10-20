const { Pool } = require('pg');
require('dotenv').config();

async function clearBlocklist() {
  let pool;
  
  try {
    // Connect to PostgreSQL
    if (process.env.DATABASE_URL) {
      pool = new Pool({
        connectionString: process.env.DATABASE_URL,
        ssl: { rejectUnauthorized: false }
      });
      
      console.log('🗄️ Connected to PostgreSQL database');
      
      // Clear blocklist table
      const result = await pool.query('DELETE FROM blocklist');
      console.log(`✅ Cleared ${result.rowCount} users from blocklist table`);
      
      // Also clear any other related tables if they exist
      try {
        await pool.query('DELETE FROM follow_tips');
        console.log('✅ Cleared follow_tips table');
      } catch (err) {
        console.log('ℹ️ follow_tips table may not exist or already empty');
      }
      
    } else {
      console.log('❌ No DATABASE_URL found - cannot clear PostgreSQL blocklist');
      console.log('ℹ️ If using file-based database, the blocklist will be rebuilt automatically');
    }
    
  } catch (error) {
    console.error('❌ Error clearing blocklist:', error.message);
  } finally {
    if (pool) {
      await pool.end();
    }
  }
}

clearBlocklist();