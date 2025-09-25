const fs = require('fs').promises;
const path = require('path');

class Database {
  constructor() {
    this.dataDir = path.join(__dirname, '../data');
    this.usersFile = path.join(this.dataDir, 'users.json');
    this.pendingTipsFile = path.join(this.dataDir, 'pendingTips.json');
    this.tipHistoryFile = path.join(this.dataDir, 'tipHistory.json');
    this.init();
  }

  async init() {
    try {
      await fs.mkdir(this.dataDir, { recursive: true });
      await this.ensureFiles();
    } catch (error) {
      console.error('Database initialization error:', error);
    }
  }

  async ensureFiles() {
    const files = [
      { path: this.usersFile, default: {} },
      { path: this.pendingTipsFile, default: [] },
      { path: this.tipHistoryFile, default: [] }
    ];

    for (const file of files) {
      try {
        await fs.access(file.path);
      } catch {
        await fs.writeFile(file.path, JSON.stringify(file.default, null, 2));
      }
    }
  }

  // User configurations
  async getUserConfig(userAddress) {
    const data = await fs.readFile(this.usersFile, 'utf8');
    const users = JSON.parse(data);
    return users[userAddress.toLowerCase()] || null;
  }

  async setUserConfig(userAddress, config) {
    const data = await fs.readFile(this.usersFile, 'utf8');
    const users = JSON.parse(data);
    users[userAddress.toLowerCase()] = {
      ...config,
      updatedAt: Date.now()
    };
    await fs.writeFile(this.usersFile, JSON.stringify(users, null, 2));
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
    const data = await fs.readFile(this.usersFile, 'utf8');
    const users = JSON.parse(data);
    return Object.values(users).filter(user => user.isActive);
  }

  // Pending tips
  async addPendingTip(tip) {
    const data = await fs.readFile(this.pendingTipsFile, 'utf8');
    const pendingTips = JSON.parse(data);
    pendingTips.push({
      ...tip,
      id: Date.now() + Math.random(),
      addedAt: Date.now()
    });
    await fs.writeFile(this.pendingTipsFile, JSON.stringify(pendingTips, null, 2));
    return pendingTips.length;
  }

  async getPendingTips() {
    const data = await fs.readFile(this.pendingTipsFile, 'utf8');
    return JSON.parse(data);
  }

  async clearPendingTips() {
    await fs.writeFile(this.pendingTipsFile, JSON.stringify([], null, 2));
  }

  // Tip history
  async addTipHistory(tip) {
    const data = await fs.readFile(this.tipHistoryFile, 'utf8');
    const history = JSON.parse(data);
    history.push({
      ...tip,
      processedAt: Date.now()
    });
    await fs.writeFile(this.tipHistoryFile, JSON.stringify(history, null, 2));
  }

  async getTipHistory(userAddress, limit = 50) {
    const data = await fs.readFile(this.tipHistoryFile, 'utf8');
    const history = JSON.parse(data);
    return history
      .filter(tip => 
        tip.fromAddress?.toLowerCase() === userAddress.toLowerCase() ||
        tip.toAddress?.toLowerCase() === userAddress.toLowerCase()
      )
      .slice(0, limit);
  }

  // Token allowances
  async getUserTokenAllowance(userAddress, tokenAddress) {
    const config = await this.getUserConfig(userAddress);
    if (!config) return { allowance: 0, balance: 0 };
    
    // In a real system, you'd check the actual on-chain allowance
    // For now, we'll assume users have approved tokens to backend
    return {
      allowance: config.allowance || 0,
      balance: config.balance || 0
    };
  }
}

module.exports = new Database();