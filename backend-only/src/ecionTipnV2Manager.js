// EcionTipnV2 Manager - Advanced batch tipping system
// Based on the sophisticated TipnV2 contract

const { ethers } = require('ethers');

class EcionTipnV2Manager {
  constructor(provider, wallet) {
    this.provider = provider;
    this.wallet = wallet;
    
    // EcionTipnV2 contract ABI
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
            "name": "actions",
            "type": "address[]"
          },
          {
            "internalType": "uint256[]",
            "name": "usdcAmounts",
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
    
    // Contract address (will be deployed)
    this.contractAddress = process.env.ECION_TIPN_V2_CONTRACT_ADDRESS || '0x0000000000000000000000000000000000000000';
  }
  
  /**
   * Execute batch tips using EcionTipnV2 contract
   * @param {Array} tips - Array of tip objects
   * @returns {Promise<Object>} - Transaction result
   */
  async executeBatchTips(tips) {
    try {
      console.log(`🎯 Executing advanced batch tips with EcionTipnV2: ${tips.length} tips`);
      
      // Create contract instance
      const contract = new ethers.Contract(
        this.contractAddress, 
        this.contractABI, 
        this.wallet
      );
      
      // Check if we're an executor
      const isExecutor = await contract.isExecutor(this.wallet.address);
      if (!isExecutor) {
        throw new Error('Backend wallet is not an executor on EcionTipnV2 contract');
      }
      
      // Prepare batch data
      const froms = tips.map(tip => tip.from);
      const tos = tips.map(tip => tip.to);
      const casts = tips.map(tip => tip.cast || ethers.ZeroAddress); // Use cast address or zero
      const actions = tips.map(tip => tip.action || ethers.ZeroAddress); // Use action or zero
      const usdcAmounts = tips.map(tip => tip.amount);
      const data = tips.map(tip => tip.data || '0x');
      
      console.log(`📋 Batch data prepared:`, {
        froms: froms.length,
        tos: tos.length,
        casts: casts.length,
        actions: actions.length,
        usdcAmounts: usdcAmounts.length,
        data: data.length
      });
      
      // Execute batch tip
      const tx = await contract.batchTip(froms, tos, casts, actions, usdcAmounts, data, {
        gasLimit: 2000000
      });
      
      console.log(`✅ Batch tip transaction submitted: ${tx.hash}`);
      
      // Wait for confirmation
      const receipt = await tx.wait();
      
      if (receipt.status === 1) {
        console.log(`✅ Batch tip confirmed: ${tx.hash} (Gas: ${receipt.gasUsed.toString()})`);
        
        // Parse success results from events or return data
        const successResults = await this.parseBatchResults(contract, receipt);
        
        return {
          success: true,
          hash: tx.hash,
          gasUsed: receipt.gasUsed.toString(),
          type: 'ecion_tipn_v2_batch',
          results: successResults
        };
      } else {
        throw new Error('Batch tip transaction reverted');
      }
      
    } catch (error) {
      console.log(`❌ EcionTipnV2 batch tip failed: ${error.message}`);
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
          amount: parsed.args.quantity.toString(),
          fee: parsed.args.fee.toString()
        });
      } catch (error) {
        console.log(`⚠️ Could not parse tip event ${index}: ${error.message}`);
      }
    });
    
    return results;
  }
  
  /**
   * Prepare tip data for USDC transfers
   * @param {Array} transfers - Array of transfer objects
   * @returns {Array} - Formatted tip data
   */
  prepareUSDCTips(transfers) {
    return transfers.map(transfer => ({
      from: transfer.from,
      to: transfer.to,
      cast: transfer.cast || ethers.ZeroAddress,
      action: ethers.ZeroAddress, // No action for USDC
      amount: transfer.amount,
      data: '0x'
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
      console.log(`❌ EcionTipnV2 contract not ready: ${error.message}`);
      return false;
    }
  }
}

module.exports = EcionTipnV2Manager;