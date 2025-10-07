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

        // Execute individual transfers directly (this was working!)
        console.log(`📋 Using direct individual transfers (working approach)`);
        console.log(`📋 Call data structure:`, JSON.stringify(callData, null, 2));
        
        // Execute each transfer directly using the backend wallet
        const results = [];
        for (let i = 0; i < callData.length; i++) {
          const call = callData[i];
          const tokenAddress = call.target;
          const callDataBytes = call.callData;
          
          try {
            console.log(`📤 Direct transfer ${i + 1}/${callData.length} to ${tokenAddress}`);
            
            // Create ERC20 contract instance
            const erc20Contract = new ethers.Contract(tokenAddress, [
              "function transferFrom(address from, address to, uint256 amount) external returns (bool)"
            ], this.wallet);
            
            // Execute transferFrom directly
            const tx = await erc20Contract.transferFrom(
              // Decode the call data to get from, to, amount
              ...this.decodeTransferFromCallData(callDataBytes),
              {
                gasLimit: 100000
              }
            );
            
            console.log(`✅ Transfer ${i + 1} submitted: ${tx.hash}`);
            
            // Wait for confirmation
            const receipt = await tx.wait();
            if (receipt.status === 1) {
              console.log(`✅ Transfer ${i + 1} confirmed: ${tx.hash}`);
              results.push({
                success: true,
                hash: tx.hash,
                gasUsed: receipt.gasUsed.toString()
              });
            } else {
              throw new Error(`Transfer ${i + 1} failed: transaction reverted`);
            }
            
            // Small delay between transfers
            if (i < callData.length - 1) {
              await new Promise(resolve => setTimeout(resolve, 1000));
            }
            
          } catch (error) {
            console.error(`❌ Transfer ${i + 1} failed:`, error.message);
            results.push({
              success: false,
              error: error.message
            });
          }
        }
        
        return results;

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
  
  // Helper function to decode transferFrom call data
  decodeTransferFromCallData(callData) {
    const callDataBytes = ethers.getBytes(callData);
    const dataWithoutSelector = callDataBytes.slice(4); // Skip function selector
    const decoded = ethers.AbiCoder.defaultAbiCoder().decode(
      ['address', 'address', 'uint256'],
      dataWithoutSelector
    );
    return decoded; // [from, to, amount]
  }
  
  // Execute batch transaction like Noice (single transaction with multiple calls)
  async executeBatchTransaction(callData) {
    // For now, we'll use individual transfers but group them
    // In the future, we can implement a proper batch transaction
    // that groups all transfers into a single transaction
    
    console.log(`📋 Creating batch transaction with ${callData.length} transfers`);
    
    // Group transfers by token to optimize gas usage
    const transfersByToken = {};
    for (const call of callData) {
      const tokenAddress = call.target;
      if (!transfersByToken[tokenAddress]) {
        transfersByToken[tokenAddress] = [];
      }
      transfersByToken[tokenAddress].push(call);
    }
    
    // Execute transfers for each token
    const results = [];
    for (const [tokenAddress, tokenCalls] of Object.entries(transfersByToken)) {
      console.log(`📋 Processing ${tokenCalls.length} transfers for token ${tokenAddress}`);
      
      for (const call of tokenCalls) {
        const callDataBytes = call.callData;
        
        // Create ERC20 contract instance
        const erc20Contract = new ethers.Contract(tokenAddress, [
          "function transferFrom(address from, address to, uint256 amount) external returns (bool)"
        ], this.wallet);
        
        // Execute transferFrom
        const tx = await erc20Contract.transferFrom(
          ...this.decodeTransferFromCallData(callDataBytes),
          {
            gasLimit: 100000
          }
        );
        
        console.log(`✅ Batch transfer submitted: ${tx.hash}`);
        
        // Wait for confirmation
        const receipt = await tx.wait();
        if (receipt.status !== 1) {
          throw new Error(`Batch transfer failed: transaction reverted`);
        }
        
        results.push({
          hash: tx.hash,
          gasUsed: receipt.gasUsed
        });
      }
    }
    
    // Return the first result as the "batch" transaction
    return {
      hash: results[0].hash,
      gasUsed: results.reduce((total, r) => total + r.gasUsed, 0n)
    };
  }
}

module.exports = MulticallContract;
