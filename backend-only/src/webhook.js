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
const instantTipProcessor = require('./instantTipProcessor');
const tipQueueManager = require('./tipQueueManager');
const batchTransferManager = require('./batchTransferManager');

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
      console.log(`🔍 Processing cast.created event:`, {
        hash: event.data.hash,
        authorFid: event.data.author?.fid,
        parentHash: event.data.parent_hash,
        hasEmbeds: !!event.data.embeds?.length,
        embedTypes: event.data.embeds?.map(e => Object.keys(e))
      });
      
      // event.data is the full Cast object
      // Check if it's a reply to another cast
      if (event.data.parent_hash) {
        interactionType = 'reply';
        console.log(`🔍 Processing reply to parent cast: ${event.data.parent_hash}`);
        const parentCast = await getCastByHash(event.data.parent_hash);
        if (parentCast) {
          // For replies: the person being replied to (parent author) pays the tip
          // The person doing the replying gets the tip
          authorFid = parentCast.author.fid;  // Person being replied to (pays tip)
          interactorFid = event.data.author?.fid;  // Person doing the replying (gets tip)
          castHash = parentCast.hash;
          console.log(`✅ Reply parsed: ${interactionType} by FID ${interactorFid} to cast by FID ${authorFid}`);
        } else {
          console.log(`❌ Could not fetch parent cast: ${event.data.parent_hash}`);
        }
      } else {
        console.log(`ℹ️ Cast is not a reply - skipping tip processing`);
      }
      break;
      
    case 'follow.created':
      interactionType = 'follow';
      authorFid = event.data.target_user?.fid; // Fixed: target_user, not targetUser
      interactorFid = event.data.user?.fid; // Fixed: user, not author
      break;
  }
  
  if (!interactionType || !authorFid || !interactorFid) {
    console.log(`❌ Missing interaction data:`, {
      interactionType,
      authorFid,
      interactorFid,
      castHash
    });
    return null;
  }
  
  console.log(`✅ Parsed interaction:`, {
    interactionType,
    authorFid,
    interactorFid,
    castHash
  });
  
  console.log(`🔍 About to get user data for address lookup...`);
  
  // Get user data to get Ethereum addresses
  const authorUser = await getUserByFid(authorFid);
  const interactorUser = await getUserByFid(interactorFid);
  
  // Get primary address (the address set as primary in Farcaster)
  const authorAddress = authorUser?.verified_addresses?.primary?.eth_address || 
                       authorUser?.verified_addresses?.eth_addresses?.[0];
  const interactorAddress = interactorUser?.verified_addresses?.primary?.eth_address || 
                           interactorUser?.verified_addresses?.eth_addresses?.[0];
  
  console.log('🔍 Address lookup:', {
    authorFid,
    authorAddress,
    authorAddressLower: authorAddress?.toLowerCase(),
    interactorFid, 
    interactorAddress,
    interactorAddressLower: interactorAddress?.toLowerCase(),
    authorVerifiedAddresses: authorUser?.verified_addresses,
    interactorVerifiedAddresses: interactorUser?.verified_addresses,
    fullAuthorUser: authorUser,
    fullInteractorUser: interactorUser
  });
  
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
    
    // Handle cast.created events to track user's latest casts AND quote casts
    if (eventData.type === 'cast.created') {
      const castData = eventData.data;
      const authorFid = castData.author?.fid;
      const castHash = castData.hash;
      
      if (authorFid && castHash) {
        // Check if this is a main cast (not a reply)
        const isMainCast = !castData.parent_hash && (!castData.parent_author || !castData.parent_author.fid || castData.parent_author.fid === null);
        
        if (isMainCast) {
          // Check if this user has active tipping config
          const trackedFids = await database.getTrackedFids();
          if (trackedFids.includes(authorFid)) {
            console.log(`📝 Tracked user FID ${authorFid} posted new main cast: ${castHash}`);
            // Update this as their latest earnable cast
            await database.addUserCast(authorFid, castHash, true);
          }
        }
      }
    }
    
    // Parse the event
    const interaction = await parseWebhookEvent(eventData);
    
    console.log(`🔍 Parse result:`, { hasInteraction: !!interaction });
    
    if (!interaction) {
      console.log(`❌ No interaction parsed - returning early`);
      return res.status(200).json({ 
        success: true, 
        processed: false,
        reason: 'Not a tippable interaction or missing data'
      });
    }
    
    console.log(`✅ Interaction parsed successfully, proceeding to validation...`);
    
    // Check if author has active tipping config
    console.log(`🔍 Getting config for author address: ${interaction.authorAddress}`);
    const authorConfig = await database.getUserConfig(interaction.authorAddress);
    console.log(`🔍 Author config result:`, { hasConfig: !!authorConfig, isActive: authorConfig?.isActive });
    
    if (!authorConfig || !authorConfig.isActive) {
      console.log(`❌ Author ${interaction.authorAddress} has no active tipping config`);
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
    
    // Check if interactor has verified address before processing
    if (!interaction.interactorAddress) {
      console.log(`⚠️ Cannot process tip: Interactor ${interaction.interactorFid} has no verified address`);
      return res.status(200).json({
        success: true,
        processed: false,
        instant: true,
        interactionType: interaction.interactionType,
        reason: 'Interactor has no verified address'
      });
    }

    // Process tip through batch system (like Noice - 1 minute batches for gas efficiency)
    console.log(`🔄 Adding tip to batch: ${interaction.interactionType} from ${interaction.interactorFid} to ${interaction.authorFid}`);
    const result = await batchTransferManager.addTipToBatch(interaction, authorConfig);
    
    if (result.success) {
      console.log(`✅ TIP BATCHED SUCCESS: ${interaction.interactionType} tip added to batch (${result.batchSize} total pending)`);
      res.status(200).json({
        success: true,
        processed: true,
        batched: true,
        interactionType: interaction.interactionType,
        batchSize: result.batchSize,
        message: 'Tip added to batch for gas-efficient processing'
      });
    } else {
      console.log(`❌ TIP BATCH FAILED: ${result.reason}`);
      res.status(200).json({
        success: true,
        processed: false,
        batched: false,
        interactionType: interaction.interactionType,
        reason: result.reason
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

function getActionEnabled(config, actionType) {
  switch (actionType) {
    case 'like': return config.likeEnabled;
    case 'reply': return config.replyEnabled;
    case 'recast': return config.recastEnabled;
    case 'follow': return config.followEnabled;
    default: return false;
  }
}

module.exports = webhookHandler;