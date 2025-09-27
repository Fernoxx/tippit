const crypto = require('crypto');
const database = require('./database');
const { getUserByFid, getCastByHash } = require('./neynar');

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
async function parseWebhookEvent(event) {
  let interactionType = null;
  let authorFid = null;
  let interactorFid = null;
  let castHash = '';
  
  switch (event.type) {
    case 'reaction.created':
      // reaction_type: 1 = like, 2 = recast
      if (event.data.reaction_type === 1) {
        interactionType = 'like';
      } else if (event.data.reaction_type === 2) {
        interactionType = 'recast';
      }
      authorFid = event.data.cast?.author?.fid;
      interactorFid = event.data.user?.fid; // Fixed: user, not author
      castHash = event.data.cast?.hash || '';
      break;
      
    case 'cast.created':
      // event.data is the full Cast object
      // Check if it's a reply to another cast
      if (event.data.parent_hash) {
        interactionType = 'reply';
        const parentCast = await getCastByHash(event.data.parent_hash);
        if (parentCast) {
          authorFid = parentCast.author.fid;
          castHash = parentCast.hash;
        }
      } else if (event.data.embeds?.some(embed => embed.cast_id)) {
        interactionType = 'quote';
        // Find the quoted cast in embeds
        const quotedEmbed = event.data.embeds.find(embed => embed.cast_id);
        if (quotedEmbed) {
          const parentCast = await getCastByHash(quotedEmbed.cast_id.hash);
          if (parentCast) {
            authorFid = parentCast.author.fid;
            castHash = parentCast.hash;
          }
        }
      }
      interactorFid = event.data.author?.fid;
      break;
      
    case 'follow.created':
      interactionType = 'follow';
      authorFid = event.data.target_user?.fid; // Fixed: target_user, not targetUser
      interactorFid = event.data.user?.fid; // Fixed: user, not author
      break;
  }
  
  if (!interactionType || !authorFid || !interactorFid) {
    return null;
  }
  
  // Get user data to get Ethereum addresses
  const authorUser = await getUserByFid(authorFid);
  const interactorUser = await getUserByFid(interactorFid);
  
  const authorAddress = authorUser?.verified_addresses?.eth_addresses?.[0];
  const interactorAddress = interactorUser?.verified_addresses?.eth_addresses?.[0];
  
  if (!authorAddress || !interactorAddress) {
    console.log('❌ No verified addresses found');
    return null;
  }
  
  return {
    interactionType,
    authorFid,
    interactorFid,
    authorAddress: authorAddress.toLowerCase(),
    interactorAddress: interactorAddress.toLowerCase(),
    castHash,
    timestamp: Date.now()
  };
}

// Main webhook handler
async function webhookHandler(req, res) {
  try {
    console.log('🔔 Webhook received:', {
      type: req.body.type,
      timestamp: new Date().toISOString(),
      data: JSON.stringify(req.body, null, 2)
    });
    
    // Verify webhook signature
    if (!verifyWebhookSignature(req)) {
      console.log('❌ Webhook signature verification failed');
      return res.status(401).json({ error: 'Invalid signature' });
    }
    
    console.log('✅ Valid webhook received:', req.body.type);
    
    // Parse the event
    const interaction = await parseWebhookEvent(req.body);
    
    if (!interaction) {
      return res.status(200).json({ 
        success: true, 
        processed: false,
        reason: 'Not a tippable interaction or missing data'
      });
    }
    
    // Check if author has active tipping config
    const authorConfig = await database.getUserConfig(interaction.authorAddress);
    if (!authorConfig || !authorConfig.isActive) {
      return res.status(200).json({
        success: true,
        processed: false,
        reason: 'Author has no active tipping config'
      });
    }
    
    // Check if action type is enabled
    const isEnabled = getActionEnabled(authorConfig, interaction.interactionType);
    if (!isEnabled) {
      return res.status(200).json({
        success: true,
        processed: false,
        reason: `${interaction.interactionType} not enabled`
      });
    }
    
    // Add to pending tips
    await database.addPendingTip(interaction);
    
    console.log(`📝 Added tip: ${interaction.interactionType} from ${interaction.interactorFid} to ${interaction.authorFid}`);
    
    res.status(200).json({
      success: true,
      processed: false, // Will be processed in batch
      queued: true,
      interactionType: interaction.interactionType
    });
    
  } catch (error) {
    console.error('❌ Webhook processing error:', error);
    res.status(500).json({
      error: 'Failed to process webhook',
      details: error.message
    });
  }
}

function getActionEnabled(config, actionType) {
  switch (actionType) {
    case 'like': return config.likeEnabled;
    case 'reply': return config.replyEnabled;
    case 'recast': return config.recastEnabled;
    case 'quote': return config.quoteEnabled;
    case 'follow': return config.followEnabled;
    default: return false;
  }
}

module.exports = webhookHandler;