import type { NextApiRequest, NextApiResponse } from 'next';
import { ethers } from 'ethers';
import { CONTRACTS } from '@/utils/contracts';
import crypto from 'crypto';

// Verify webhook signature from Neynar
function verifyWebhookSignature(req: NextApiRequest): boolean {
  const signature = req.headers['x-neynar-signature'] as string;
  const webhookSecret = process.env.WEBHOOK_SECRET!;
  
  if (!signature || !webhookSecret) return false;
  
  const hmac = crypto.createHmac('sha256', webhookSecret);
  hmac.update(JSON.stringify(req.body));
  const expectedSignature = hmac.digest('hex');
  
  return signature === expectedSignature;
}

// Webhook types from Neynar
interface NeynarWebhookEvent {
  type: 'cast.created' | 'reaction.created' | 'follow.created';
  data: {
    author: {
      fid: number;
      username: string;
      verifiedAddresses: {
        ethAddresses: string[];
      };
    };
    cast?: {
      hash: string;
      author: {
        fid: number;
        verifiedAddresses: {
          ethAddresses: string[];
        };
      };
    };
    reactionType?: 'like' | 'recast';
    targetUser?: {
      fid: number;
      verifiedAddresses: {
        ethAddresses: string[];
      };
    };
  };
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Verify webhook signature
  if (!verifyWebhookSignature(req)) {
    return res.status(401).json({ error: 'Invalid signature' });
  }

  try {
    const event: NeynarWebhookEvent = req.body;
    
    let interactionType: string | null = null;
    let authorFid: number | null = null;
    let interactorFid: number | null = null;
    let castHash: string = '';
    
    // Parse the event based on type
    switch (event.type) {
      case 'reaction.created':
        if (event.data.reactionType === 'like') {
          interactionType = 'like';
        } else if (event.data.reactionType === 'recast') {
          interactionType = 'recast';
        }
        authorFid = event.data.cast!.author.fid;
        interactorFid = event.data.author.fid;
        castHash = event.data.cast!.hash;
        break;
        
      case 'cast.created':
        // Check if it's a reply to another cast
        if (event.data.cast?.hash) {
          interactionType = 'reply';
          // Need to fetch parent cast info
          // This would require additional API call to Neynar
        }
        break;
        
      case 'follow.created':
        interactionType = 'follow';
        authorFid = event.data.targetUser!.fid;
        interactorFid = event.data.author.fid;
        break;
    }
    
    // If we have a valid interaction, process the tip
    if (interactionType && authorFid && interactorFid) {
      // Get Ethereum addresses from FIDs
      const authorAddress = event.data.cast?.author.verifiedAddresses.ethAddresses[0] || 
                           event.data.targetUser?.verifiedAddresses.ethAddresses[0];
      const interactorAddress = event.data.author.verifiedAddresses.ethAddresses[0];
      
      if (!authorAddress || !interactorAddress) {
        return res.status(200).json({ 
          success: false, 
          reason: 'No verified addresses' 
        });
      }
      
      // Create interaction hash
      const interactionHash = ethers.keccak256(
        ethers.AbiCoder.defaultAbiCoder().encode(
          ['uint256', 'uint256', 'string', 'bytes32', 'uint256'],
          [
            authorFid,
            interactorFid,
            interactionType,
            castHash || '0x0000000000000000000000000000000000000000000000000000000000000000',
            Math.floor(Date.now() / 1000)
          ]
        )
      );
      
      // Forward to backend for batch processing
      const backendUrl = process.env.BACKEND_URL || 'http://localhost:3001';
      const processResponse = await fetch(
        `${backendUrl}/webhook/neynar`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-neynar-signature': req.headers['x-neynar-signature'] as string,
          },
          body: JSON.stringify(req.body),
        }
      );
      
      const result = await processResponse.json();
      
      res.status(200).json({
        success: true,
        processed: result.processed || false,
        queued: result.queued || false,
        interactionType: result.interactionType,
      });
    } else {
      res.status(200).json({ 
        success: true, 
        processed: false,
        reason: 'Not a tippable interaction' 
      });
    }
  } catch (error) {
    console.error('Error processing webhook:', error);
    res.status(500).json({
      error: 'Failed to process webhook',
      details: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}