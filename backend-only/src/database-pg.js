const { Pool } = require('pg');

class Database {
  constructor() {
    this.pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
    });
  }

  async initialize() {
    try {
      console.log('🔌 Connecting to database...');
      
      // Create tip_history table
      await this.pool.query(`
        CREATE TABLE IF NOT EXISTS tip_history (
          id SERIAL PRIMARY KEY,
          from_address VARCHAR(255) NOT NULL,
          to_address VARCHAR(255) NOT NULL,
          token_address VARCHAR(255) NOT NULL,
          amount TEXT NOT NULL,
          action_type VARCHAR(50) NOT NULL,
          cast_hash VARCHAR(255),
          transaction_hash VARCHAR(255),
          processed_at TIMESTAMP DEFAULT NOW()
        )
      `);

      // Create user_profiles table
      await this.pool.query(`
        CREATE TABLE IF NOT EXISTS user_profiles (
          fid INTEGER PRIMARY KEY,
          username VARCHAR(255),
          display_name VARCHAR(255),
          pfp_url TEXT,
          follower_count INTEGER DEFAULT 0,
          user_address VARCHAR(255),
          created_at TIMESTAMP DEFAULT NOW(),
          updated_at TIMESTAMP DEFAULT NOW()
        )
      `);

      // Add user_address column if it doesn't exist
      await this.pool.query(`
        ALTER TABLE user_profiles 
        ADD COLUMN IF NOT EXISTS user_address VARCHAR(255)
      `);

      // Create user_configs table
      await this.pool.query(`
        CREATE TABLE IF NOT EXISTS user_configs (
          user_address VARCHAR(255) PRIMARY KEY,
          config JSONB,
          updated_at TIMESTAMP DEFAULT NOW()
        )
      `);

      // Create webhook_config table
      await this.pool.query(`
        CREATE TABLE IF NOT EXISTS webhook_config (
          id SERIAL PRIMARY KEY,
          webhook_id TEXT,
          webhook_url TEXT,
          is_active BOOLEAN DEFAULT true,
          created_at TIMESTAMP DEFAULT NOW()
        )
      `);

      // Create app_settings table for blocklist and other settings
      await this.pool.query(`
        CREATE TABLE IF NOT EXISTS app_settings (
          key TEXT PRIMARY KEY,
          value TEXT NOT NULL,
          updated_at TIMESTAMP DEFAULT NOW()
        )
      `);

      console.log('✅ Database tables initialized successfully');
    } catch (error) {
      console.error('❌ Database initialization error:', error);
      throw error;
    }
  }

  // User profiles
  async getUserProfiles(fids) {
    try {
      if (fids.length === 0) return [];
      
      console.log('🔍 getUserProfiles called with FIDs:', fids.slice(0, 5));
      const result = await this.pool.query(
        'SELECT * FROM user_profiles WHERE fid = ANY($1)',
        [fids]
      );
      console.log('📊 getUserProfiles found:', result.rows.length, 'profiles');
      
      // If no profiles found in database, try to get them from Neynar API
      if (result.rows.length === 0) {
        console.log('❌ No profiles in database, trying Neynar API...');
        // For now, return empty array - we'll handle this in the leaderboard
        return [];
      }
      
      return result.rows;
    } catch (error) {
      console.error('Error getting user profiles:', error);
      return [];
    }
  }

  // Calculate earnings for a specific user address from tip_history
  async calculateUserEarnings(userAddress, timeFilter = 'total') {
    try {
      let timeCondition = '';
      if (timeFilter === '24h') {
        timeCondition = "AND processed_at >= NOW() - INTERVAL '24 hours'";
      } else if (timeFilter === '7d') {
        timeCondition = "AND processed_at >= NOW() - INTERVAL '7 days'";
      } else if (timeFilter === '30d') {
        timeCondition = "AND processed_at >= NOW() - INTERVAL '30 days'";
      }

      const result = await this.pool.query(`
        SELECT 
          SUM(CASE WHEN LOWER(to_address) = LOWER($1) THEN amount::NUMERIC ELSE 0 END) as total_earnings,
          SUM(CASE WHEN LOWER(from_address) = LOWER($1) THEN amount::NUMERIC ELSE 0 END) as total_tippings
        FROM tip_history 
        WHERE token_address = '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913'
        ${timeCondition}
      `, [userAddress]);

      const stats = result.rows[0];
      return {
        totalEarnings: parseFloat(stats.total_earnings) || 0,
        totalTippings: parseFloat(stats.total_tippings) || 0
      };
    } catch (error) {
      console.error('Error calculating user earnings:', error);
      return { totalEarnings: 0, totalTippings: 0 };
    }
  }

  // Get leaderboard data with real-time earnings calculation
  async getLeaderboardData(timeFilter = 'total', page = 1, limit = 10) {
    try {
      // Get all users from user_profiles
      const usersResult = await this.pool.query(`
        SELECT fid, username, display_name, pfp_url, follower_count, user_address
        FROM user_profiles 
        ORDER BY fid DESC
      `);

      const users = usersResult.rows;
      const usersWithEarnings = [];

      // Calculate earnings for each user using their address
      for (const user of users) {
        if (user.user_address) {
          const earnings = await this.calculateUserEarnings(user.user_address, timeFilter);
          usersWithEarnings.push({
            ...user,
            ...earnings
          });
        }
      }

      // Sort by earnings
      usersWithEarnings.sort((a, b) => b.totalEarnings - a.totalEarnings);

      // Pagination
      const startIndex = (page - 1) * limit;
      const endIndex = startIndex + limit;
      const paginatedUsers = usersWithEarnings.slice(startIndex, endIndex);

      return {
        users: paginatedUsers,
        pagination: {
          page,
          limit,
          total: usersWithEarnings.length,
          totalPages: Math.ceil(usersWithEarnings.length / limit)
        }
      };
    } catch (error) {
      console.error('Error getting leaderboard data:', error);
      return { users: [], pagination: { page: 1, limit: 10, total: 0, totalPages: 0 } };
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

  // Save user profile (general function)
  async saveUserProfile(fid, username, displayName, pfpUrl, followerCount, userAddress = null) {
    try {
      const result = await this.pool.query(`
        INSERT INTO user_profiles (fid, username, display_name, pfp_url, follower_count, user_address, created_at, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())
        ON CONFLICT (fid) 
        DO UPDATE SET 
          username = EXCLUDED.username,
          display_name = EXCLUDED.display_name,
          pfp_url = EXCLUDED.pfp_url,
          follower_count = EXCLUDED.follower_count,
          user_address = COALESCE(EXCLUDED.user_address, user_profiles.user_address),
          updated_at = NOW()
      `, [fid, username, displayName, pfpUrl, followerCount, userAddress]);

      console.log(`✅ Saved user profile for FID ${fid} with address ${userAddress}`);
      return true;
    } catch (error) {
      console.error('Error saving user profile:', error);
      return false;
    }
  }

  // Save user profile when they approve USDC (called from backend)
  async saveUserProfileFromApproval(userAddress, fid, username, displayName, pfpUrl) {
    try {
      const result = await this.pool.query(`
        INSERT INTO user_profiles (fid, username, display_name, pfp_url, user_address, created_at, updated_at)
        VALUES ($1, $2, $3, $4, $5, NOW(), NOW())
        ON CONFLICT (fid) 
        DO UPDATE SET 
          username = EXCLUDED.username,
          display_name = EXCLUDED.display_name,
          pfp_url = EXCLUDED.pfp_url,
          user_address = EXCLUDED.user_address,
          updated_at = NOW()
      `, [fid, username, displayName, pfpUrl, userAddress]);

      console.log(`✅ Saved user profile for FID ${fid} with address ${userAddress}`);
      return true;
    } catch (error) {
      console.error('Error saving user profile from approval:', error);
      return false;
    }
  }

  async setUserConfig(userAddress, config) {
    try {
      await this.pool.query(`
        INSERT INTO user_configs (user_address, config, updated_at) 
        VALUES ($1, $2, NOW())
        ON CONFLICT (user_address) 
        DO UPDATE SET 
          config = EXCLUDED.config,
          updated_at = NOW()
      `, [userAddress.toLowerCase(), config]);
      
      console.log(`💾 Saved config for ${userAddress}`);
      return true;
    } catch (error) {
      console.error('💾 Error saving user config:', error.message);
      return false;
    }
  }

  // Tip history
  async addTip(fromAddress, toAddress, tokenAddress, amount, actionType, castHash, transactionHash) {
    try {
      const result = await this.pool.query(`
        INSERT INTO tip_history (from_address, to_address, token_address, amount, action_type, cast_hash, transaction_hash, processed_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
        RETURNING id
      `, [fromAddress, toAddress, tokenAddress, amount, actionType, castHash, transactionHash]);
      
      console.log(`✅ Tip added with ID: ${result.rows[0].id}`);
      return result.rows[0].id;
    } catch (error) {
      console.error('❌ Error adding tip:', error);
      throw error;
    }
  }

  async getTipHistory(userAddress, limit = 50, offset = 0) {
    try {
      const result = await this.pool.query(`
        SELECT * FROM tip_history 
        WHERE LOWER(from_address) = LOWER($1) OR LOWER(to_address) = LOWER($1)
        ORDER BY processed_at DESC 
        LIMIT $2 OFFSET $3
      `, [userAddress, limit, offset]);
      
      return result.rows;
    } catch (error) {
      console.error('Error getting tip history:', error);
      return [];
    }
  }

  // Webhook management
  async saveWebhookConfig(webhookId, webhookUrl) {
    try {
      await this.pool.query(`
        INSERT INTO webhook_config (webhook_id, webhook_url, is_active, created_at)
        VALUES ($1, $2, true, NOW())
        ON CONFLICT (webhook_id) 
        DO UPDATE SET 
          webhook_url = EXCLUDED.webhook_url,
          is_active = true,
          created_at = NOW()
      `, [webhookId, webhookUrl]);
      
      console.log(`✅ Webhook config saved: ${webhookId}`);
      return true;
    } catch (error) {
      console.error('Error saving webhook config:', error);
      return false;
    }
  }

  async getWebhookConfig() {
    try {
      const result = await this.pool.query(`
        SELECT * FROM webhook_config 
        WHERE is_active = true 
        ORDER BY created_at DESC 
        LIMIT 1
      `);
      
      return result.rows[0] || null;
    } catch (error) {
      console.error('Error getting webhook config:', error);
      return null;
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
      
      console.log(`🧹 Cleaned up ${result.rowCount} old tips`);
      
      // Update last cleanup date
      await this.pool.query(`
        INSERT INTO app_settings (key, value) 
        VALUES ('last_cleanup', $1)
        ON CONFLICT (key) 
        DO UPDATE SET value = EXCLUDED.value
      `, [today]);
      
    } catch (error) {
      console.error('Error cleaning up old tips:', error);
    }
  }

  // Blocklist management
  async setBlocklist(blocklist) {
    try {
      await this.pool.query(`
        INSERT INTO app_settings (key, value) 
        VALUES ('blocklist', $1)
        ON CONFLICT (key) 
        DO UPDATE SET value = EXCLUDED.value
      `, [JSON.stringify(blocklist)]);
      
      console.log('✅ Blocklist saved to database');
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
      console.error('Error adding to blocklist:', error);
      return false;
    }
  }

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
      console.error('Error removing from blocklist:', error);
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

  async close() {
    await this.pool.end();
  }
}

module.exports = Database;