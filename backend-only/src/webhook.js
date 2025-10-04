const crypto = require('crypto');
// Use PostgreSQL database if available, fallback to file storage
let database;
try {
  if (process.env.DATABASE_URL) {
    database = require('./database-pg');
  } else {
    database = require('./database');
  }
} catch (error) {
  database = require('./database');
}
const { getUserByFid, getCastByHash } = require('./neynar');

// Verify webhook signature from Neynar
function verifyWebhookSignature(req) {
  // Check all possible header variations
  const signature = req.headers['x-neynar-signature'] || 
                   req.headers['X-Neynar-Signature'] ||
                   req.headers['x-neynar-signature'] ||
                   req.headers['X-NEYNAR-SIGNATURE'];
  
  const webhookSecret = process.env.WEBHOOK_SECRET;
  
  console.log('🔐 Signature verification:', {
    hasSignature: !!signature,
    hasSecret: !!webhookSecret,
    signature: signature ? signature.substring(0, 10) + '...' : 'none',
    secretLength: webhookSecret ? webhookSecret.length : 0,
    bodyType: typeof req.body,
    bodyLength: req.body ? req.body.length : 0,
    rawBodyType: typeof req.rawBody,
    rawBodyLength: req.rawBody ? req.rawBody.length : 0,
    allHeaders: Object.keys(req.headers).filter(h => h.toLowerCase().includes('signature') || h.toLowerCase().includes('neynar'))
  });
  
  if (!signature || !webhookSecret) {
    console.log('❌ Missing signature or secret');
    return false;
  }
  
  // Use raw body for signature verification (as per Neynar docs)
  const rawBody = req.rawBody ? req.rawBody.toString() : 
                  (Buffer.isBuffer(req.body) ? req.body.toString() : JSON.stringify(req.body));
  
  const hmac = crypto.createHmac('sha512', webhookSecret);
  hmac.update(rawBody);
  const expectedSignature = hmac.digest('hex');
  
  const isValid = signature === expectedSignature;
  console.log('🔐 Signature check:', {
    received: signature.substring(0, 10) + '...',
    expected: expectedSignature.substring(0, 10) + '...',
    rawBodyLength: rawBody.length,
    isValid
  });
  
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
      
      // Check if the cast being liked/recasted is an original cast (not a reply)
      const cast = event.data.cast;
      if (cast?.parent_hash) {
        console.log('❌ Skipping reaction to reply cast - only original casts get tips for reactions');
        return null;
      }
      
      authorFid = cast?.author?.fid;
      interactorFid = event.data.user?.fid;
      castHash = cast?.hash || '';
      
      console.log(`✅ Reaction to original cast: ${interactionType} by FID ${interactorFid} on cast by FID ${authorFid}`);
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
    // Parse the raw body to JSON for processing
    let eventData;
    if (Buffer.isBuffer(req.body)) {
      eventData = JSON.parse(req.body.toString());
    } else if (typeof req.body === 'string') {
      eventData = JSON.parse(req.body);
    } else {
      eventData = req.body;
    }
    
    console.log('🔔 Webhook received:', {
      type: eventData.type,
      timestamp: new Date().toISOString(),
      data: JSON.stringify(eventData, null, 2)
    });
    
    // Verify webhook signature
    const isValidSignature = verifyWebhookSignature(req);
    if (!isValidSignature) {
      console.log('❌ Webhook signature verification failed');
      return res.status(401).json({ error: 'Invalid signature' });
    }
    
    console.log('✅ Signature verification passed');
    
    console.log('✅ Valid webhook received:', eventData.type);
    
    // Handle cast.created events to track user's latest casts
    if (eventData.type === 'cast.created') {
      const castData = eventData.data;
      const authorFid = castData.author?.fid;
      const castHash = castData.hash;
      
      if (authorFid && castHash) {
        // Check if this is a main cast (not a reply)
        const isMainCast = !castData.parent_hash && (!castData.parent_author || !castData.parent_author.fid || castData.parent_author.fid === null);
        
        if (isMainCast) {
          console.log(`📝 New main cast from FID ${authorFid}: ${castHash}`);
          // Add this cast to user's eligible casts (database will handle keeping only latest 1)
          await database.addUserCast(authorFid, castHash, true);
        }
      }
    }
    
    // Parse the event
    const interaction = await parseWebhookEvent(eventData);
    
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
    
    // Check if cast is eligible for tips (only latest main cast)
    if (interaction.castHash) {
      const isCastEligible = await database.isCastEligibleForTips(interaction.authorFid, interaction.castHash);
      if (!isCastEligible) {
        console.log(`🚫 Cast ${interaction.castHash} not eligible for tips (not the latest main cast)`);
        return res.status(200).json({
          success: true,
          processed: false,
          reason: 'Cast not eligible for tips (not the latest main cast)'
        });
      }
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