const { Pool } = require('pg');

class PostgresDatabase {
  constructor() {
    this.pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
    });
    
    console.log('🗄️ PostgreSQL Database initialized');
    this.init();
  }

  async init() {
    try {
      // Create tables if they don't exist
      await this.pool.query(`
        CREATE TABLE IF NOT EXISTS user_configs (
          user_address TEXT PRIMARY KEY,
          config JSONB NOT NULL,
          updated_at TIMESTAMP DEFAULT NOW()
        )
      `);
      
      await this.pool.query(`
        CREATE TABLE IF NOT EXISTS pending_tips (
          id SERIAL PRIMARY KEY,
          interaction_type TEXT NOT NULL,
          author_fid INTEGER NOT NULL,
          interactor_fid INTEGER NOT NULL,
          author_address TEXT NOT NULL,
          interactor_address TEXT NOT NULL,
          cast_hash TEXT,
          amount TEXT,
          token_address TEXT,
          added_at TIMESTAMP DEFAULT NOW()
        )
      `);
      
      await this.pool.query(`
        CREATE TABLE IF NOT EXISTS tip_history (
          id SERIAL PRIMARY KEY,
          from_address TEXT NOT NULL,
          to_address TEXT NOT NULL,
          token_address TEXT NOT NULL,
          amount TEXT NOT NULL,
          action_type TEXT NOT NULL,
          cast_hash TEXT,
          transaction_hash TEXT,
          processed_at TIMESTAMP DEFAULT NOW()
        )
      `);
      
      await this.pool.query(`
        CREATE TABLE IF NOT EXISTS webhook_config (
          id SERIAL PRIMARY KEY,
          webhook_id TEXT,
          tracked_fids INTEGER[],
          updated_at TIMESTAMP DEFAULT NOW()
        )
      `);
      
      await this.pool.query(`
        CREATE TABLE IF NOT EXISTS user_casts (
          id SERIAL PRIMARY KEY,
          user_fid INTEGER NOT NULL,
          cast_hash TEXT NOT NULL,
          is_main_cast BOOLEAN DEFAULT true,
          created_at TIMESTAMP DEFAULT NOW(),
          UNIQUE(user_fid, cast_hash)
        )
      `);
      
      console.log('✅ Database tables initialized');
    } catch (error) {
      console.error('❌ Database initialization error:', error);
    }
  }

  // User configurations
  async getUserConfig(userAddress) {
    try {
      const result = await this.pool.query(
        'SELECT config FROM user_configs WHERE user_address = $1',
        [userAddress.toLowerCase()]
      );
      const config = result.rows[0]?.config || null;
      console.log(`📖 Retrieved config for ${userAddress}:`, !!config);
      return config;
    } catch (error) {
      console.error('📖 Error reading user config:', error.message);
      return null;
    }
  }

  async setUserConfig(userAddress, config) {
    try {
      await this.pool.query(`
        INSERT INTO user_configs (user_address, config, updated_at) 
        VALUES ($1, $2, NOW())
        ON CONFLICT (user_address) 
        DO UPDATE SET config = $2, updated_at = NOW()
      `, [userAddress.toLowerCase(), JSON.stringify({
        ...config,
        updatedAt: Date.now()
      })]);
      console.log(`💾 Saved config for ${userAddress}`);
    } catch (error) {
      console.error('💾 Error saving user config:', error.message);
      throw error;
    }
  }

  async updateUserConfig(userAddress, config) {
    const existing = await this.getUserConfig(userAddress);
    const updated = {
      ...existing,
      ...config,
      updatedAt: Date.now()
    };
    await this.setUserConfig(userAddress, updated);
  }

  async getAllActiveUsers() {
    try {
      const result = await this.pool.query(`
        SELECT user_address FROM user_configs 
        WHERE config->>'isActive' = 'true'
      `);
      return result.rows.map(row => row.user_address);
    } catch (error) {
      console.error('Error getting active users:', error);
      return [];
    }
  }

  async getAllUserConfigs() {
    try {
      const result = await this.pool.query('SELECT user_address, config FROM user_configs');
      const configs = {};
      result.rows.forEach(row => {
        configs[row.user_address] = row.config;
      });
      return configs;
    } catch (error) {
      console.error('Error getting all configs:', error);
      return {};
    }
  }

  // Homepage and leaderboard functions
  async getActiveUsers() {
    return this.getAllActiveUsers();
  }

  async getActiveUsersWithApprovals() {
    try {
      const result = await this.pool.query(`
        SELECT DISTINCT LOWER(user_address) as user_address FROM user_configs 
        WHERE config->>'isActive' = 'true' 
        AND config->>'tokenAddress' IS NOT NULL
      `);
      return result.rows.map(row => row.user_address);
    } catch (error) {
      console.error('Error getting users with approvals:', error);
      return [];
    }
  }

  // Pending tips
  async addPendingTip(tip) {
    try {
      const result = await this.pool.query(`
        INSERT INTO pending_tips 
        (interaction_type, author_fid, interactor_fid, author_address, interactor_address, cast_hash, amount, token_address)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        RETURNING id
      `, [
        tip.interactionType,
        tip.authorFid,
        tip.interactorFid,
        tip.authorAddress,
        tip.interactorAddress,
        tip.castHash,
        tip.amount,
        tip.tokenAddress
      ]);
      
      console.log(`📝 Added pending tip with ID: ${result.rows[0].id}`);
      return result.rows[0].id;
    } catch (error) {
      console.error('Error adding pending tip:', error);
      throw error;
    }
  }

  async getPendingTips() {
    try {
      const result = await this.pool.query('SELECT * FROM pending_tips ORDER BY added_at ASC');
      return result.rows.map(row => ({
        interactionType: row.interaction_type,
        actionType: row.interaction_type, // Add actionType for batch processor
        authorFid: row.author_fid,
        interactorFid: row.interactor_fid,
        authorAddress: row.author_address,
        interactorAddress: row.interactor_address,
        castHash: row.cast_hash,
        amount: row.amount,
        tokenAddress: row.token_address,
        timestamp: row.added_at
      }));
    } catch (error) {
      console.error('Error getting pending tips:', error);
      return [];
    }
  }

  async clearPendingTips() {
    try {
      await this.pool.query('DELETE FROM pending_tips');
      console.log('🧹 Cleared all pending tips');
    } catch (error) {
      console.error('Error clearing pending tips:', error);
    }
  }

  // Tip history
  async addTipHistory(tip) {
    try {
      const result = await this.pool.query(`
        INSERT INTO tip_history 
        (from_address, to_address, token_address, amount, action_type, cast_hash, transaction_hash)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING id, processed_at
      `, [
        tip.fromAddress,
        tip.toAddress,
        tip.tokenAddress,
        tip.amount,
        tip.actionType,
        tip.castHash,
        tip.transactionHash
      ]);
      
      console.log(`💾 Tip recorded: ${tip.fromAddress} → ${tip.toAddress} (${tip.amount} ${tip.actionType})`);
      
    } catch (error) {
      console.error('Error adding tip history:', error);
      throw error;
    }
  }

  async getTipHistory(userAddress, limit = 50) {
    try {
      const result = await this.pool.query(`
        SELECT * FROM tip_history 
        WHERE from_address = $1 OR to_address = $1 
        ORDER BY processed_at DESC 
        LIMIT $2
      `, [userAddress.toLowerCase(), limit]);
      
      return result.rows;
    } catch (error) {
      console.error('Error getting tip history:', error);
      return [];
    }
  }

  async getTopTippers(timeFilter = '30d') {
    try {
      const timeMs = timeFilter === '24h' ? '24 hours' :
                     timeFilter === '7d' ? '7 days' : '30 days';
      
      // Note: Cleanup moved to a separate scheduled task to avoid blocking batch processing
      
      const result = await this.pool.query(`
        SELECT 
          from_address as user_address,
          token_address,
          SUM(CAST(amount AS DECIMAL)) as total_amount,
          COUNT(*) as tip_count
        FROM tip_history 
        WHERE processed_at > NOW() - INTERVAL '${timeMs}'
        AND LOWER(token_address) = '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913'
        GROUP BY from_address, token_address 
        ORDER BY total_amount DESC 
        LIMIT 50
      `);
      
      
      return result.rows.map(row => ({
        userAddress: row.user_address,
        tokenAddress: row.token_address,
        totalAmount: parseFloat(row.total_amount),
        tipCount: parseInt(row.tip_count)
      }));
    } catch (error) {
      console.error('Error getting top tippers:', error);
      return [];
    }
  }

  async getTopEarners(timeFilter = '30d') {
    try {
      const timeMs = timeFilter === '24h' ? '24 hours' :
                     timeFilter === '7d' ? '7 days' : '30 days';
      
      const result = await this.pool.query(`
        SELECT 
          to_address as user_address,
          token_address,
          SUM(CAST(amount AS DECIMAL)) as total_amount,
          COUNT(*) as tip_count
        FROM tip_history 
        WHERE processed_at > NOW() - INTERVAL '${timeMs}'
        AND LOWER(token_address) = '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913'
        GROUP BY to_address, token_address 
        ORDER BY total_amount DESC 
        LIMIT 50
      `);
      
      return result.rows.map(row => ({
        userAddress: row.user_address,
        tokenAddress: row.token_address,
        totalAmount: parseFloat(row.total_amount),
        tipCount: parseInt(row.tip_count)
      }));
    } catch (error) {
      console.error('Error getting top earners:', error);
      return [];
    }
  }

  // Admin functions for total stats
  async getTotalTips() {
    try {
      const result = await this.pool.query('SELECT COUNT(*) as count FROM tip_history');
      return parseInt(result.rows[0].count);
    } catch (error) {
      console.error('Error getting total tips:', error);
      return 0;
    }
  }

  async getTotalAmountTipped() {
    try {
      const result = await this.pool.query('SELECT SUM(CAST(amount AS DECIMAL)) as total FROM tip_history');
      return parseFloat(result.rows[0].total || 0);
    } catch (error) {
      console.error('Error getting total amount tipped:', error);
      return 0;
    }
  }

  async getTotalUsers() {
    try {
      const result = await this.pool.query('SELECT COUNT(DISTINCT from_address) as count FROM tip_history');
      return parseInt(result.rows[0].count);
    } catch (error) {
      console.error('Error getting total users:', error);
      return 0;
    }
  }

  async getTotalTransactions() {
    try {
      const result = await this.pool.query('SELECT COUNT(DISTINCT transaction_hash) as count FROM tip_history WHERE transaction_hash IS NOT NULL');
      return parseInt(result.rows[0].count);
    } catch (error) {
      console.error('Error getting total transactions:', error);
      return 0;
    }
  }

  async getRecentTips(limit = 50) {
    try {
      const result = await this.pool.query(`
        SELECT 
          from_address,
          to_address,
          amount,
          token_address,
          transaction_hash,
          processed_at,
          action_type
        FROM tip_history 
        ORDER BY processed_at DESC 
        LIMIT $1
      `, [limit]);
      
      return result.rows.map(row => ({
        fromAddress: row.from_address,
        toAddress: row.to_address,
        amount: parseFloat(row.amount),
        tokenAddress: row.token_address,
        txHash: row.transaction_hash,
        processedAt: row.processed_at,
        interactionType: row.action_type
      }));
    } catch (error) {
      console.error('Error getting recent tips:', error);
      return [];
    }
  }

  // Clean up tips older than 30 days to save database space
  async cleanupOldTips() {
    try {
      // Only run cleanup once per day to avoid performance issues
      const lastCleanup = await this.pool.query(`
        SELECT value FROM app_settings WHERE key = 'last_cleanup' LIMIT 1
      `).catch(() => ({ rows: [] }));
      
      const today = new Date().toDateString();
      if (lastCleanup.rows.length > 0 && lastCleanup.rows[0].value === today) {
        return; // Already cleaned up today
      }
      
      // Delete tips older than 30 days
      const result = await this.pool.query(`
        DELETE FROM tip_history 
        WHERE processed_at < NOW() - INTERVAL '30 days'
      `);
      
      if (result.rowCount > 0) {
        console.log(`🧹 Cleaned up ${result.rowCount} old tips (older than 30 days)`);
      }
      
      // Update last cleanup date
      await this.pool.query(`
        INSERT INTO app_settings (key, value) 
        VALUES ('last_cleanup', $1)
        ON CONFLICT (key) DO UPDATE SET value = $1
      `, [today]).catch(() => {
        // Create table if it doesn't exist
        this.pool.query(`
          CREATE TABLE IF NOT EXISTS app_settings (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL,
            updated_at TIMESTAMP DEFAULT NOW()
          )
        `).then(() => {
          this.pool.query(`
            INSERT INTO app_settings (key, value) VALUES ('last_cleanup', $1)
          `, [today]);
        });
      });
      
    } catch (error) {
      console.error('Error during cleanup:', error);
      // Don't fail the main query if cleanup fails
    }
  }
  
  // Webhook configuration methods
  async setWebhookId(webhookId) {
    try {
      console.log('💾 Saving webhook ID to database:', webhookId);
      await this.pool.query(`
        INSERT INTO webhook_config (webhook_id, tracked_fids) 
        VALUES ($1, $2)
        ON CONFLICT (id) DO UPDATE SET 
          webhook_id = EXCLUDED.webhook_id,
          updated_at = NOW()
      `, [webhookId, []]);
      console.log('✅ Webhook ID saved successfully');
    } catch (error) {
      console.error('❌ Error setting webhook ID:', error);
    }
  }
  
  async getWebhookId() {
    try {
      const result = await this.pool.query(`
        SELECT webhook_id FROM webhook_config ORDER BY updated_at DESC LIMIT 1
      `);
      const webhookId = result.rows[0]?.webhook_id || null;
      console.log('🔍 Retrieved webhook ID from database:', webhookId);
      return webhookId;
    } catch (error) {
      console.error('❌ Error getting webhook ID:', error);
      return null;
    }
  }
  
  async setTrackedFids(fids) {
    try {
      await this.pool.query(`
        INSERT INTO webhook_config (webhook_id, tracked_fids) 
        VALUES ($1, $2)
        ON CONFLICT (id) DO UPDATE SET 
          tracked_fids = EXCLUDED.tracked_fids,
          updated_at = NOW()
      `, [await this.getWebhookId(), fids]);
    } catch (error) {
      console.error('Error setting tracked FIDs:', error);
    }
  }
  
  async getTrackedFids() {
    try {
      const result = await this.pool.query(`
        SELECT tracked_fids FROM webhook_config ORDER BY updated_at DESC LIMIT 1
      `);
      return result.rows[0]?.tracked_fids || [];
    } catch (error) {
      console.error('Error getting tracked FIDs:', error);
      return [];
    }
  }
  
  // User casts management methods
  async addUserCast(userFid, castHash, isMainCast = true) {
    try {
      await this.pool.query(`
        INSERT INTO user_casts (user_fid, cast_hash, is_main_cast)
        VALUES ($1, $2, $3)
        ON CONFLICT (user_fid, cast_hash) DO NOTHING
      `, [userFid, castHash, isMainCast]);
      
      // Keep only latest 1 main cast for each user (since only latest cast is earnable)
      await this.pool.query(`
        DELETE FROM user_casts 
        WHERE user_fid = $1 AND is_main_cast = true
        AND id NOT IN (
          SELECT id FROM user_casts 
          WHERE user_fid = $1 AND is_main_cast = true
          ORDER BY created_at DESC 
          LIMIT 1
        )
      `, [userFid]);
    } catch (error) {
      console.error('Error adding user cast:', error);
    }
  }
  
  async getEligibleCasts(userFid) {
    try {
      const result = await this.pool.query(`
        SELECT cast_hash FROM user_casts 
        WHERE user_fid = $1 AND is_main_cast = true
        ORDER BY created_at DESC 
        LIMIT 1
      `, [userFid]);
      
      return result.rows.map(row => row.cast_hash);
    } catch (error) {
      console.error('Error getting eligible casts:', error);
      return [];
    }
  }
  
  async isCastEligibleForTips(userFid, castHash) {
    try {
      const eligibleCasts = await this.getEligibleCasts(userFid);
      const isEligible = eligibleCasts.includes(castHash);
      
      console.log(`🔍 Cast eligibility check for FID ${userFid}:`, {
        castHash,
        eligibleCasts,
        isEligible
      });
      
      return isEligible;
    } catch (error) {
      console.error('Error checking cast eligibility:', error);
      return false;
    }
  }

  // Check if user has already been tipped for this cast and action type
  async hasUserBeenTippedForCast(authorAddress, interactorAddress, castHash, actionType) {
    try {
      const result = await this.pool.query(`
        SELECT COUNT(*) as count FROM tip_history 
        WHERE from_address = $1 AND to_address = $2 AND cast_hash = $3 AND action_type = $4
      `, [authorAddress.toLowerCase(), interactorAddress.toLowerCase(), castHash, actionType]);
      
      const hasBeenTipped = parseInt(result.rows[0].count) > 0;
      console.log(`🔍 Duplicate check: ${interactorAddress} ${hasBeenTipped ? 'HAS' : 'HAS NOT'} been tipped for ${actionType} on cast ${castHash}`);
      return hasBeenTipped;
    } catch (error) {
      console.error('Error checking tip history:', error);
      return false;
    }
  }

  // Get tips since a specific date
  async getTipsSince(sinceDate) {
    try {
      const result = await this.pool.query(`
        SELECT 
          from_address as "fromAddress",
          to_address as "toAddress", 
          token_address as "tokenAddress",
          amount,
          action_type as "actionType",
          cast_hash as "castHash",
          timestamp
        FROM tip_history 
        WHERE timestamp >= $1
        ORDER BY timestamp DESC
      `, [sinceDate]);
      
      console.log(`📊 Found ${result.rows.length} tips since ${sinceDate.toISOString()}`);
      return result.rows;
    } catch (error) {
      console.error('Error getting tips since date:', error);
      return [];
    }
  }

  // Get a config value
  async getConfig(key) {
    try {
      const result = await this.pool.query(`
        SELECT value FROM app_settings WHERE key = $1
      `, [key]);
      
      return result.rows.length > 0 ? result.rows[0].value : null;
    } catch (error) {
      console.error('Error getting config:', error);
      return null;
    }
  }

  // Set a config value
  async setConfig(key, value) {
    try {
      await this.pool.query(`
        INSERT INTO app_settings (key, value) 
        VALUES ($1, $2) 
        ON CONFLICT (key) 
        DO UPDATE SET value = $2, updated_at = NOW()
      `, [key, value]);
      
      console.log(`💾 Config updated: ${key} = ${value}`);
    } catch (error) {
      console.error('Error setting config:', error);
    }
  }

  // Get all user addresses
  async getAllUsers() {
    try {
      const result = await this.pool.query(`
        SELECT user_address FROM user_configs
      `);
      
      return result.rows.map(row => row.user_address);
    } catch (error) {
      console.error('Error getting all users:', error);
      return [];
    }
  }

  // Save blocklist to database
  async setBlocklist(blockedUsers) {
    try {
      await this.pool.query(`
        INSERT INTO app_settings (key, value) 
        VALUES ('blocklist', $1) 
        ON CONFLICT (key) 
        DO UPDATE SET value = $1, updated_at = NOW()
      `, [JSON.stringify(blockedUsers)]);
      
      console.log(`💾 Blocklist saved: ${blockedUsers.length} users`);
    } catch (error) {
      console.error('Error saving blocklist:', error);
    }
  }

  // Get blocklist from database
  async getBlocklist() {
    try {
      const result = await this.pool.query(`
        SELECT value FROM app_settings WHERE key = 'blocklist'
      `);
      
      if (result.rows.length > 0) {
        return JSON.parse(result.rows[0].value);
      }
      return [];
    } catch (error) {
      console.error('Error getting blocklist:', error);
      return [];
    }
  }

  // Add user to blocklist
  async addToBlocklist(userAddress) {
    try {
      const normalizedAddress = userAddress.toLowerCase();
      
      // Get current blocklist
      const currentBlocklist = await this.getBlocklist();
      
      // Add user if not already present
      if (!currentBlocklist.includes(normalizedAddress)) {
        currentBlocklist.push(normalizedAddress);
        await this.setBlocklist(currentBlocklist);
        console.log(`📝 Added ${normalizedAddress} to database blocklist`);
        return true;
      } else {
        console.log(`ℹ️ User ${normalizedAddress} already in database blocklist`);
        return false;
      }
    } catch (error) {
      console.error(`❌ Error adding ${userAddress} to blocklist:`, error);
      return false;
    }
  }

  // Remove user from blocklist
  async removeFromBlocklist(userAddress) {
    try {
      const normalizedAddress = userAddress.toLowerCase();
      
      // Get current blocklist
      const currentBlocklist = await this.getBlocklist();
      
      // Remove user if present
      const index = currentBlocklist.indexOf(normalizedAddress);
      if (index > -1) {
        currentBlocklist.splice(index, 1);
        await this.setBlocklist(currentBlocklist);
        console.log(`📝 Removed ${normalizedAddress} from database blocklist`);
        return true;
      } else {
        console.log(`ℹ️ User ${normalizedAddress} not in database blocklist`);
        return false;
      }
    } catch (error) {
      console.error(`❌ Error removing ${userAddress} from blocklist:`, error);
      return false;
    }
  }

  // Check if user is in blocklist
  async isUserBlocked(userAddress) {
    try {
      const normalizedAddress = userAddress.toLowerCase();
      const blocklist = await this.getBlocklist();
      return blocklist.includes(normalizedAddress);
    } catch (error) {
      console.error(`❌ Error checking if ${userAddress} is blocked:`, error);
      return false;
    }
  }
}

module.exports = new PostgresDatabase();