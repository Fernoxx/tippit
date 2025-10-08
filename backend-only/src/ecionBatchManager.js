// EcionBatch Manager - Simple batch tipping system
// Based on the EcionBatch contract (no fees, no NFTs)

const { ethers } = require('ethers');

class EcionBatchManager {
  constructor(provider, wallet) {
    this.provider = provider;
    this.wallet = wallet;
    
    // EcionBatch contract ABI
    this.contractABI = [
      {
        "inputs": [
          {
            "internalType": "address[]",
            "name": "froms",
            "type": "address[]"
          },
          {
            "internalType": "address[]",
            "name": "tos",
            "type": "address[]"
          },
          {
            "internalType": "address[]",
            "name": "casts",
            "type": "address[]"
          },
          {
            "internalType": "address[]",
            "name": "tokens",
            "type": "address[]"
          },
          {
            "internalType": "uint256[]",
            "name": "amounts",
            "type": "uint256[]"
          },
          {
            "internalType": "bytes[]",
            "name": "data",
            "type": "bytes[]"
          }
        ],
        "name": "batchTip",
        "outputs": [
          {
            "internalType": "bool[]",
            "name": "",
            "type": "bool[]"
          }
        ],
        "stateMutability": "nonpayable",
        "type": "function"
      },
      {
        "inputs": [
          {
            "internalType": "address",
            "name": "executor",
            "type": "address"
          }
        ],
        "name": "isExecutor",
        "outputs": [
          {
            "internalType": "bool",
            "name": "",
            "type": "bool"
          }
        ],
        "stateMutability": "view",
        "type": "function"
      },
      {
        "inputs": [],
        "name": "owner",
        "outputs": [
          {
            "internalType": "address",
            "name": "",
            "type": "address"
          }
        ],
        "stateMutability": "view",
        "type": "function"
      }
    ];
    
    // Contract address (deploy on Remix)
    this.contractAddress = process.env.ECION_BATCH_CONTRACT_ADDRESS || '0x0000000000000000000000000000000000000000';
  }
  
  /**
   * Execute batch tips using EcionBatch contract
   * @param {Array} tips - Array of tip objects
   * @returns {Promise<Object>} - Transaction result
   */
  async executeBatchTips(tips) {
    try {
      console.log(`🎯 Executing batch tips with EcionBatch: ${tips.length} tips`);
      
      // Create contract instance
      const contract = new ethers.Contract(
        this.contractAddress, 
        this.contractABI, 
        this.wallet
      );
      
      // Check if we're an executor
      const isExecutor = await contract.isExecutor(this.wallet.address);
      if (!isExecutor) {
        throw new Error('Backend wallet is not an executor on EcionBatch contract');
      }
      
      // Prepare batch data
      const froms = tips.map(tip => tip.from);
      const tos = tips.map(tip => tip.to);
      const casts = tips.map(tip => tip.cast || ethers.ZeroAddress); // Use cast address or zero
      const tokens = tips.map(tip => tip.token); // Token addresses
      const amounts = tips.map(tip => tip.amount);
      const data = tips.map(tip => '0x'); // No data needed
      
      console.log(`📋 Batch data prepared:`, {
        froms: froms.length,
        tos: tos.length,
        casts: casts.length,
        tokens: tokens.length,
        amounts: amounts.length,
        data: data.length
      });
      
      // Execute batch tip
      const tx = await contract.batchTip(froms, tos, casts, tokens, amounts, data, {
        gasLimit: 2000000
      });
      
      console.log(`✅ Batch tip transaction submitted: ${tx.hash}`);
      
      // Wait for confirmation
      const receipt = await tx.wait();
      
      if (receipt.status === 1) {
        console.log(`✅ Batch tip confirmed: ${tx.hash} (Gas: ${receipt.gasUsed.toString()})`);
        
        // Parse success results from events
        const successResults = await this.parseBatchResults(contract, receipt);
        
        return {
          success: true,
          hash: tx.hash,
          gasUsed: receipt.gasUsed.toString(),
          type: 'ecion_batch',
          results: successResults
        };
      } else {
        throw new Error('Batch tip transaction reverted');
      }
      
    } catch (error) {
      console.log(`❌ EcionBatch batch tip failed: ${error.message}`);
      throw error;
    }
  }
  
  /**
   * Parse batch results from transaction receipt
   * @param {Contract} contract - Contract instance
   * @param {Object} receipt - Transaction receipt
   * @returns {Array} - Success results
   */
  async parseBatchResults(contract, receipt) {
    const results = [];
    
    // Parse Tip events
    const tipEvent = contract.interface.getEvent('Tip');
    const tipLogs = receipt.logs.filter(log => {
      try {
        return contract.interface.parseLog(log)?.name === 'Tip';
      } catch {
        return false;
      }
    });
    
    tipLogs.forEach((log, index) => {
      try {
        const parsed = contract.interface.parseLog(log);
        results.push({
          index,
          success: true,
          from: parsed.args.from,
          to: parsed.args.to,
          cast: parsed.args.cast,
          token: parsed.args.token,
          amount: parsed.args.quantity.toString()
        });
      } catch (error) {
        console.log(`⚠️ Could not parse tip event ${index}: ${error.message}`);
      }
    });
    
    return results;
  }
  
  /**
   * Prepare tip data for any ERC-20 token transfers
   * @param {Array} transfers - Array of transfer objects
   * @returns {Array} - Formatted tip data
   */
  prepareTokenTips(transfers) {
    return transfers.map(transfer => ({
      from: transfer.from,
      to: transfer.to,
      cast: transfer.cast || ethers.ZeroAddress,
      token: transfer.tokenAddress,
      amount: transfer.amount
    }));
  }
  
  /**
   * Check if contract is deployed and accessible
   * @returns {Promise<boolean>} - Contract status
   */
  async isContractReady() {
    try {
      if (this.contractAddress === '0x0000000000000000000000000000000000000000') {
        return false;
      }
      
      const contract = new ethers.Contract(
        this.contractAddress, 
        this.contractABI, 
        this.wallet
      );
      
      await contract.owner();
      return true;
    } catch (error) {
      console.log(`❌ EcionBatch contract not ready: ${error.message}`);
      return false;
    }
  }
}

module.exports = EcionBatchManager;