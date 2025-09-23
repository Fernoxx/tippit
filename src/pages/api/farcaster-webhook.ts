import type { NextApiRequest, NextApiResponse } from 'next';
import { ethers } from 'ethers';
import { CONTRACTS } from '@/utils/contracts';

// This webhook would be called by a Farcaster indexer service
// when interactions happen on the protocol

interface FarcasterInteraction {
  type: 'like' | 'reply' | 'recast' | 'quote' | 'follow';
  authorFid: number;
  interactorFid: number;
  castHash: string;
  timestamp: number;
}

// In production, use proper RPC provider
const provider = new ethers.JsonRpcProvider('https://mainnet.base.org');

// Oracle contract instance
const oracleContract = new ethers.Contract(
  CONTRACTS.FarcasterOracle.address,
  CONTRACTS.FarcasterOracle.abi,
  provider
);

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const interaction: FarcasterInteraction = req.body;
    
    // Validate interaction
    if (!interaction.type || !interaction.authorFid || !interaction.interactorFid) {
      return res.status(400).json({ error: 'Invalid interaction data' });
    }

    // Create interaction hash to prevent duplicates
    const interactionHash = ethers.keccak256(
      ethers.AbiCoder.defaultAbiCoder().encode(
        ['uint256', 'uint256', 'string', 'bytes32', 'uint256'],
        [
          interaction.authorFid,
          interaction.interactorFid,
          interaction.type,
          interaction.castHash,
          interaction.timestamp
        ]
      )
    );

    // In production, this would be signed by a secure wallet
    const signer = new ethers.Wallet(
      process.env.ORACLE_PRIVATE_KEY || '',
      provider
    );

    const oracleWithSigner = oracleContract.connect(signer);

    // Process the interaction
    const tx = await oracleWithSigner.processInteraction(
      interaction.authorFid,
      interaction.interactorFid,
      interaction.type,
      interaction.castHash,
      interactionHash
    );

    await tx.wait();

    res.status(200).json({
      success: true,
      transactionHash: tx.hash,
      interactionHash,
    });
  } catch (error) {
    console.error('Error processing interaction:', error);
    res.status(500).json({
      error: 'Failed to process interaction',
      details: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}