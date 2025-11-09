// RPC Provider with request throttling
// ONLY uses Alchemy (BASE_RPC_URL) - no fallbacks

const { ethers } = require('ethers');

// Request queue to throttle RPC calls and prevent exceeding Alchemy rate limits
class RPCRequestQueue {
  constructor() {
    this.queue = [];
    this.processing = false;
    this.lastRequestTime = 0;
    this.minRequestInterval = 100; // Minimum 100ms between requests (10 requests/second max)
  }
  
  async add(fn) {
    return new Promise((resolve, reject) => {
      this.queue.push({ fn, resolve, reject });
      this.process();
    });
  }
  
  async process() {
    if (this.processing || this.queue.length === 0) {
      return;
    }
    
    this.processing = true;
    
    while (this.queue.length > 0) {
      const now = Date.now();
      const timeSinceLastRequest = now - this.lastRequestTime;
      
      // Wait if needed to maintain rate limit
      if (timeSinceLastRequest < this.minRequestInterval) {
        await new Promise(resolve => setTimeout(resolve, this.minRequestInterval - timeSinceLastRequest));
      }
      
      const { fn, resolve, reject } = this.queue.shift();
      this.lastRequestTime = Date.now();
      
      try {
        const result = await fn();
        resolve(result);
      } catch (error) {
        reject(error);
      }
    }
    
    this.processing = false;
  }
}

// Global request queue instance
const rpcRequestQueue = new RPCRequestQueue();

class RPCProviderManager {
  constructor() {
    // ONLY use Alchemy - no fallbacks
    this.providers = [];
    this.lastErrorSignature = null;
    this.lastErrorLoggedAt = 0;
    
    // ONLY Alchemy (from BASE_RPC_URL)
    if (process.env.BASE_RPC_URL) {
      this.providers.push({
        name: 'Alchemy',
        url: process.env.BASE_RPC_URL,
        priority: 1
      });
    } else {
      throw new Error('BASE_RPC_URL environment variable is required');
    }
    
    // Current active provider
    this.currentProvider = null;
    this.currentProviderIndex = 0;
    
    // Initialize with Alchemy provider
    this.initializeProvider();
  }
  
  initializeProvider() {
    if (this.providers.length === 0) {
      throw new Error('No RPC providers configured');
    }
    
    // Start with primary provider
    this.currentProviderIndex = 0;
    const providerConfig = this.providers[this.currentProviderIndex];
    this.currentProvider = new ethers.JsonRpcProvider(providerConfig.url);
    console.log(`🔌 Initialized RPC provider: ${providerConfig.name} (${providerConfig.url.substring(0, 30)}...)`);
  }
  
  /**
   * Get the current provider (with automatic fallback on failure)
   * REMOVED: Health check to avoid excessive RPC calls
   * Provider will be tested only when actually used
   */
  async getProvider() {
    // Return current provider without health check to avoid rate limits
    // Health check happens only when provider actually fails during use
    if (this.currentProvider) {
      return this.currentProvider;
    }
    
    // Initialize if not set
    this.initializeProvider();
    return this.currentProvider;
  }
  
  /**
   * Fallback to next available provider
   * DISABLED: Only using Alchemy, no fallbacks
   */
  async fallbackToNextProvider() {
    // No fallbacks - only Alchemy
    throw new Error('Only Alchemy provider is configured. No fallbacks available.');
  }
  
  /**
   * Execute a function with automatic provider fallback and request throttling
   * @param {Function} fn - Function that takes a provider as argument
   * @param {Number} maxRetries - Maximum retries with fallback
   */
  async executeWithFallback(fn, maxRetries = 3) {
    // Use request queue to throttle RPC calls
    return await rpcRequestQueue.add(async () => {
      let lastError = null;
      let retryCount = 0;
      
      while (retryCount < maxRetries) {
        try {
          const provider = await this.getProvider();
          return await fn(provider);
        } catch (error) {
          lastError = error;
          const now = Date.now();
          const signature = `${error?.code || ''}-${error?.message || error}`;
          if (this.lastErrorSignature !== signature || now - this.lastErrorLoggedAt > 5000) {
            console.log(`⚠️ RPC error on attempt ${retryCount + 1}/${maxRetries}: ${error?.message || error}`);
            this.lastErrorSignature = signature;
            this.lastErrorLoggedAt = now;
          }
          
          retryCount++;
          
          // Check if it's a rate limit or batch limit error - don't retry immediately
          const isRateLimitError = error.message?.includes('rate limit') ||
                                   error.message?.includes('over rate limit') ||
                                   error.message?.includes('maximum 10 calls') ||
                                   error.message?.includes('compute units') ||
                                   error?.code === 429 ||
                                   error?.code === -32016 || // over rate limit
                                   error?.code === -32014;   // maximum calls in batch
          
          // Check if it's a provider/RPC error
          const isRpcError = error.message?.includes('503') ||
                            error.message?.includes('Service Unavailable') ||
                            error.message?.includes('SERVER_ERROR') ||
                            error.message?.includes('network') ||
                            error.message?.includes('missing revert data') ||
                            error.message?.includes('CALL_EXCEPTION') ||
                            error?.code === 'SERVER_ERROR' ||
                            error?.code === 'NETWORK_ERROR' ||
                            error?.code === 'CALL_EXCEPTION';
          
          if (isRateLimitError) {
            // Rate limit errors - wait longer before retry (exponential backoff)
            const waitTime = Math.min(5000 * Math.pow(2, retryCount - 1), 30000); // Max 30 seconds
            console.log(`⏳ Rate limit error detected, waiting ${waitTime}ms before retry...`);
            await new Promise(resolve => setTimeout(resolve, waitTime));
            
            // Don't try fallback - only Alchemy is configured
            if (retryCount >= maxRetries) {
              throw error; // Max retries reached
            }
            continue; // Retry with same provider
          } else if (isRpcError && retryCount < maxRetries) {
            // Wait before retry (no fallback, only Alchemy)
            await new Promise(resolve => setTimeout(resolve, 1000 * retryCount));
            continue;
          } else {
            // Non-RPC error or max retries reached
            throw error;
          }
        }
      }
      
      throw lastError || new Error('All retries exhausted');
    });
  }
  
  /**
   * Get provider info for logging
   */
  getProviderInfo() {
    if (this.currentProviderIndex < this.providers.length) {
      const current = this.providers[this.currentProviderIndex];
      return {
        name: current.name,
        url: current.url.substring(0, 50) + '...',
        index: this.currentProviderIndex + 1,
        total: this.providers.length
      };
    }
    return { name: 'Unknown', url: 'N/A', index: 0, total: 0 };
  }
}

// Singleton instance
let rpcProviderManager = null;

/**
 * Get or create the RPC provider manager singleton
 */
function getRPCProviderManager() {
  if (!rpcProviderManager) {
    rpcProviderManager = new RPCProviderManager();
  }
  return rpcProviderManager;
}

/**
 * Get a provider with automatic fallback
 */
async function getProvider() {
  const manager = getRPCProviderManager();
  return await manager.getProvider();
}

/**
 * Execute function with automatic provider fallback
 */
async function executeWithFallback(fn, maxRetries = 3) {
  const manager = getRPCProviderManager();
  return await manager.executeWithFallback(fn, maxRetries);
}

module.exports = {
  getProvider,
  executeWithFallback,
  getRPCProviderManager,
  RPCProviderManager
};
