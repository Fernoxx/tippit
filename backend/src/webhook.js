const crypto = require('crypto');
const batchProcessor = require('./batchProcessor');

// Verify webhook signature from Neynar
function verifyWebhookSignature(req) {
  const signature = req.headers['x-neynar-signature'];
  const webhookSecret = process.env.WEBHOOK_SECRET;
  
  if (!signature || !webhookSecret) {
    console.log('❌ Missing signature or secret');
    return false;
  }
  
  const hmac = crypto.createHmac('sha256', webhookSecret);
  hmac.update(JSON.stringify(req.body));
  const expectedSignature = hmac.digest('hex');
  
  const isValid = signature === expectedSignature;
  if (!isValid) {
    console.log('❌ Invalid webhook signature');
  }
  
  return isValid;
}

// Parse Neynar webhook event
function parseWebhookEvent(event) {
  let interactionType = null;
  let authorFid = null;
  let interactorFid = null;
  let castHash = '';
  
  switch (event.type) {
    case 'reaction.created':
      if (event.data.reactionType === 'like') {
        interactionType = 'like';
      } else if (event.data.reactionType === 'recast') {
        interactionType = 'recast';
      }
      authorFid = event.data.cast?.author?.fid;
      interactorFid = event.data.author?.fid;
      castHash = event.data.cast?.hash || '';
      break;
      
    case 'cast.created':
      // Check if it's a reply to another cast
      if (event.data.cast?.hash) {
        interactionType = 'reply';
        // Note: For replies, we'd need to fetch parent cast info
        // This is simplified - in production, you'd call Neynar API
      }
      break;
      
    case 'follow.created':
      interactionType = 'follow';
      authorFid = event.data.targetUser?.fid;
      interactorFid = event.data.author?.fid;
      break;
  }
  
  if (!interactionType || !authorFid || !interactorFid) {
    return null;
  }
  
  // Get Ethereum addresses from FIDs
  const authorAddress = event.data.cast?.author?.verifiedAddresses?.ethAddresses?.[0] || 
                       event.data.targetUser?.verifiedAddresses?.ethAddresses?.[0];
  const interactorAddress = event.data.author?.verifiedAddresses?.ethAddresses?.[0];
  
  if (!authorAddress || !interactorAddress) {
    console.log('❌ No verified addresses found');
    return null;
  }
  
  return {
    interactionType,
    authorFid,
    interactorFid,
    authorAddress,
    interactorAddress,
    castHash,
    timestamp: Date.now()
  };
}

// Main webhook handler
async function webhookHandler(req, res) {
  try {
    // Verify webhook signature
    if (!verifyWebhookSignature(req)) {
      return res.status(401).json({ error: 'Invalid signature' });
    }
    
    console.log('✅ Valid webhook received:', req.body.type);
    
    // Parse the event
    const interaction = parseWebhookEvent(req.body);
    
    if (!interaction) {
      return res.status(200).json({ 
        success: true, 
        processed: false,
        reason: 'Not a tippable interaction or missing data'
      });
    }
    
    // Add to batch processor
    const added = await batchProcessor.addInteraction(interaction);
    
    if (added) {
      console.log(`📝 Added interaction: ${interaction.interactionType} from ${interaction.interactorFid} to ${interaction.authorFid}`);
      
      res.status(200).json({
        success: true,
        processed: false, // Will be processed in batch
        queued: true,
        interactionType: interaction.interactionType
      });
    } else {
      res.status(200).json({
        success: true,
        processed: false,
        reason: 'Interaction already queued or invalid'
      });
    }
    
  } catch (error) {
    console.error('❌ Webhook processing error:', error);
    res.status(500).json({
      error: 'Failed to process webhook',
      details: error.message
    });
  }
}

module.exports = webhookHandler;