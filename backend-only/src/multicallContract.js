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

        // Execute batch using our custom contract (exactly like Noice)
        console.log(`📋 Using EcionBatch executeBatch function like Noice`);
        console.log(`📋 Call data structure:`, JSON.stringify(callData, null, 2));
        
        // Our deployed contract address
        const batchTransferAddress = process.env.BATCH_TRANSFER_CONTRACT_ADDRESS || '0x894df225e6674d67d1fb0c7b059b3201e5074432';
        
        if (batchTransferAddress === '0x0000000000000000000000000000000000000000') {
          throw new Error('BATCH_TRANSFER_CONTRACT_ADDRESS not set - using individual transfers');
        }
        
        const batchTransferABI = [
          {
            "inputs": [],
            "stateMutability": "nonpayable",
            "type": "constructor"
          },
          {
            "anonymous": false,
            "inputs": [
              {
                "indexed": false,
                "internalType": "uint256",
                "name": "totalTransfers",
                "type": "uint256"
              },
              {
                "indexed": false,
                "internalType": "uint256",
                "name": "gasUsed",
                "type": "uint256"
              }
            ],
            "name": "BatchTransferExecuted",
            "type": "event"
          },
          {
            "inputs": [
              {
                "internalType": "address",
                "name": "token",
                "type": "address"
              },
              {
                "internalType": "uint256",
                "name": "amount",
                "type": "uint256"
              }
            ],
            "name": "emergencyWithdraw",
            "outputs": [],
            "stateMutability": "nonpayable",
            "type": "function"
          },
          {
            "inputs": [
              {
                "components": [
                  {
                    "internalType": "address",
                    "name": "token",
                    "type": "address"
                  },
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
                "internalType": "struct EcionBatch.TransferCall[]",
                "name": "calls",
                "type": "tuple[]"
              }
            ],
            "name": "executeBatch",
            "outputs": [],
            "stateMutability": "nonpayable",
            "type": "function"
          },
          {
            "inputs": [
              {
                "internalType": "address",
                "name": "newOwner",
                "type": "address"
              }
            ],
            "name": "transferOwnership",
            "outputs": [],
            "stateMutability": "nonpayable",
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
        
        const batchTransferContract = new ethers.Contract(batchTransferAddress, batchTransferABI, this.wallet);
        
        // Convert our call data to the format expected by executeBatch
        const transferCalls = callData.map(call => {
          // Decode the transferFrom call data to get from, to, amount
          const callDataBytes = ethers.getBytes(call.callData);
          const dataWithoutSelector = callDataBytes.slice(4); // Skip function selector
          const decoded = ethers.AbiCoder.defaultAbiCoder().decode(
            ['address', 'address', 'uint256'],
            dataWithoutSelector
          );
          
          // Return as tuple array for contract compatibility
          // The contract will call transferFrom(from, to, amount) using the backend wallet
          return [
            call.target,  // token address
            decoded[0],   // from address (author)
            decoded[1],   // to address (recipient)
            decoded[2]    // amount
          ];
        });
        
        console.log(`📋 Executing batch with ${transferCalls.length} transfers...`);
        console.log(`📋 Transfer calls:`, transferCalls.map(call => [
          call[0], // token
          call[1], // from
          call[2], // to
          call[3].toString() // amount as string
        ]));
        
        // Check if transferCalls is valid
        if (!transferCalls || transferCalls.length === 0) {
          throw new Error('No valid transfer calls to execute');
        }
        
        // Validate each transfer call
        for (let i = 0; i < transferCalls.length; i++) {
          const call = transferCalls[i];
          if (!call || !Array.isArray(call) || call.length !== 4) {
            throw new Error(`Invalid transfer call at index ${i}: ${JSON.stringify(call)}`);
          }
          if (!call[0] || !call[1] || !call[2] || call[3] === undefined) {
            throw new Error(`Invalid transfer call data at index ${i}: token=${call[0]}, from=${call[1]}, to=${call[2]}, amount=${call[3]?.toString()}`);
          }
        }
        
        // Call the contract with the correct parameter structure
        // The contract expects: executeBatch(TransferCall[] calldata calls)
        console.log(`📋 About to call executeBatch with:`, {
          transferCallsLength: transferCalls.length,
          firstCall: transferCalls[0],
          contractAddress: batchTransferAddress
        });
        
        // Check if we're the owner of the contract
        try {
          const owner = await batchTransferContract.owner();
          console.log(`📋 Contract owner: ${owner}`);
          console.log(`📋 Our wallet: ${this.wallet.address}`);
          
          if (owner.toLowerCase() !== this.wallet.address.toLowerCase()) {
            throw new Error(`Contract ownership issue: Owner is ${owner}, but our wallet is ${this.wallet.address}. Please transfer ownership to our wallet.`);
          }
        } catch (ownerError) {
          console.error(`❌ Owner check failed:`, ownerError.message);
          throw new Error(`Contract ownership check failed: ${ownerError.message}`);
        }
        
        // Check if authors have approved the batch contract
        console.log(`📋 Checking if authors have approved the batch contract...`);
        
        // For now, let's try the batch transfer and see what happens
        try {
          const gasEstimate = await batchTransferContract.executeBatch.estimateGas(transferCalls);
          console.log(`📋 Gas estimate: ${gasEstimate.toString()}`);
        } catch (gasError) {
          console.error(`❌ Gas estimation failed:`, gasError.message);
          if (gasError.message.includes("Transfer failed")) {
            console.log(`⚠️ Authors need to approve the batch contract first`);
            throw new Error(`Authors need to approve batch contract: ${gasError.message}`);
          }
          throw new Error(`Contract call validation failed: ${gasError.message}`);
        }
        
        const tx = await batchTransferContract.executeBatch(transferCalls, {
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
