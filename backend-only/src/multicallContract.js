// Multicall contract for batch transfers (similar to Noice's approach)
// This contract allows multiple transferFrom calls in a single transaction

const { ethers } = require('ethers');

const MULTICALL_ABI = [
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
          return encoded;
        });

        console.log(`📋 Call data array length: ${callData.length}`);
        console.log(`📋 First call data: ${callData[0]?.substring(0, 50)}...`);

        // Execute multicall
        const tx = await this.multicallContract.multicall(callData, {
          gasLimit: 2000000 // Higher gas limit for batch operations
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
