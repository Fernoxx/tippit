// Multicall contract for batch transfers (similar to Noice's approach)
// This contract allows multiple transferFrom calls in a single transaction

const { ethers } = require('ethers');

const MULTICALL_ABI = [
  {
    "inputs": [
      {
        "components": [
          {
            "internalType": "address",
            "name": "target",
            "type": "address"
          },
          {
            "internalType": "bytes",
            "name": "callData",
            "type": "bytes"
          }
        ],
        "internalType": "struct Multicall3.Call[]",
        "name": "calls",
        "type": "tuple[]"
      }
    ],
    "name": "aggregate",
    "outputs": [
      {
        "internalType": "uint256",
        "name": "blockNumber",
        "type": "uint256"
      },
      {
        "internalType": "bytes[]",
        "name": "returnData",
        "type": "bytes[]"
      }
    ],
    "stateMutability": "payable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "bytes[]",
        "name": "data",
        "type": "bytes[]"
      }
    ],
    "name": "multicall",
    "outputs": [
      {
        "internalType": "bytes[]",
        "name": "results",
        "type": "bytes[]"
      }
    ],
    "stateMutability": "payable",
    "type": "function"
  }
];

const ERC20_ABI = [
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "from",
        "type": "address"
      },
      {
        "internalType": "address",
        "name": "to",
        "type": "address"
      },
      {
        "internalType": "uint256",
        "name": "amount",
        "type": "uint256"
      }
    ],
    "name": "transferFrom",
    "outputs": [
      {
        "internalType": "bool",
        "name": "",
        "type": "bool"
      }
    ],
    "stateMutability": "nonpayable",
    "type": "function"
  }
];

class MulticallContract {
  constructor(provider, wallet) {
    this.provider = provider;
    this.wallet = wallet;
    
    // Use a known multicall contract address on Base
    // This is the Multicall3 contract deployed on Base
    this.multicallAddress = "0xcA11bde05977b3631167028862bE2a173976CA11";
    
    this.multicallContract = new ethers.Contract(
      this.multicallAddress,
      MULTICALL_ABI,
      wallet
    );
  }

  // Encode transferFrom call data
  encodeTransferFrom(tokenAddress, from, to, amount) {
    const erc20Interface = new ethers.Interface(ERC20_ABI);
    return erc20Interface.encodeFunctionData("transferFrom", [from, to, amount]);
  }

  // Execute batch transfers using multicall
  async executeBatchTransfers(transfers) {
    try {
      console.log(`🔄 Executing ${transfers.length} transfers via multicall...`);
      
      // Group transfers by token address
      const transfersByToken = {};
      for (const transfer of transfers) {
        if (!transfersByToken[transfer.tokenAddress]) {
          transfersByToken[transfer.tokenAddress] = [];
        }
        transfersByToken[transfer.tokenAddress].push(transfer);
      }

      const results = [];
      
      // Process each token separately (since each token needs its own contract)
      for (const [tokenAddress, tokenTransfers] of Object.entries(transfersByToken)) {
        console.log(`💸 Processing ${tokenTransfers.length} transfers for token ${tokenAddress}`);
        
        // Create ERC20 contract instance for this token
        const erc20Contract = new ethers.Contract(tokenAddress, ERC20_ABI, this.wallet);
        
        // Encode all transferFrom calls for this token
        const callData = tokenTransfers.map(transfer => {
          const encoded = erc20Contract.interface.encodeFunctionData("transferFrom", [
            transfer.from,
            transfer.to,
            transfer.amount
          ]);
          console.log(`📝 Encoded call data: ${encoded.substring(0, 20)}...`);
          // Return the call data with the target address
          return {
            target: tokenAddress,
            callData: encoded
          };
        });

        console.log(`📋 Call data array length: ${callData.length}`);
        console.log(`📋 First call data: ${callData[0]?.callData?.substring(0, 50)}...`);

        // Execute multicall using direct transaction
        console.log(`📋 Sending multicall with ${callData.length} calls`);
        console.log(`📋 Call data structure:`, JSON.stringify(callData, null, 2));
        
        // Encode the multicall function call manually
        const multicallData = this.multicallContract.interface.encodeFunctionData("multicall", [
          callData.map(call => call.callData)
        ]);
        
        console.log(`📋 Encoded multicall data: ${multicallData.substring(0, 50)}...`);
        
        const tx = await this.wallet.sendTransaction({
          to: this.multicallAddress,
          data: multicallData,
          gasLimit: 2000000
        });

        console.log(`✅ Multicall transaction submitted: ${tx.hash}`);
        const receipt = await tx.wait();
        console.log(`✅ Multicall confirmed: ${tx.hash} (Gas: ${receipt.gasUsed.toString()})`);

        results.push({
          tokenAddress,
          transactionHash: tx.hash,
          gasUsed: receipt.gasUsed.toString(),
          transfers: tokenTransfers.length,
          success: true
        });
      }

      return results;

    } catch (error) {
      console.error('❌ Multicall execution failed:', error);
      throw error;
    }
  }

  // Calculate gas savings
  calculateGasSavings(transferCount) {
    const individualGasCost = 100000; // Approximate gas per individual transfer
    const batchGasCost = 2000000; // Approximate gas for batch operation
    
    const individualTotal = transferCount * individualGasCost;
    const savings = individualTotal - batchGasCost;
    const savingsPercent = (savings / individualTotal) * 100;
    
    return {
      individualTotal,
      batchTotal: batchGasCost,
      savings,
      savingsPercent: Math.max(0, savingsPercent)
    };
  }
}

module.exports = MulticallContract;
