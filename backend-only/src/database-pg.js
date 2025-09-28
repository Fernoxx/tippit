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
        SELECT user_address FROM user_configs 
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
      await this.pool.query(`
        INSERT INTO tip_history 
        (from_address, to_address, token_address, amount, action_type, cast_hash, transaction_hash)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
      `, [
        tip.fromAddress,
        tip.toAddress,
        tip.tokenAddress,
        tip.amount,
        tip.actionType,
        tip.castHash,
        tip.transactionHash
      ]);
      console.log(`📋 Added tip history: ${tip.amount} from ${tip.fromAddress} to ${tip.toAddress}`);
    } catch (error) {
      console.error('Error adding tip history:', error);
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
      
      const result = await this.pool.query(`
        SELECT 
          from_address as user_address,
          SUM(CAST(amount AS DECIMAL)) as total_amount,
          COUNT(*) as tip_count
        FROM tip_history 
        WHERE processed_at > NOW() - INTERVAL '${timeMs}'
        GROUP BY from_address 
        ORDER BY total_amount DESC 
        LIMIT 50
      `);
      
      return result.rows.map(row => ({
        userAddress: row.user_address,
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
          SUM(CAST(amount AS DECIMAL)) as total_amount,
          COUNT(*) as tip_count
        FROM tip_history 
        WHERE processed_at > NOW() - INTERVAL '${timeMs}'
        GROUP BY to_address 
        ORDER BY total_amount DESC 
        LIMIT 50
      `);
      
      return result.rows.map(row => ({
        userAddress: row.user_address,
        totalAmount: parseFloat(row.total_amount),
        tipCount: parseInt(row.tip_count)
      }));
    } catch (error) {
      console.error('Error getting top earners:', error);
      return [];
    }
  }
}

module.exports = new PostgresDatabase();