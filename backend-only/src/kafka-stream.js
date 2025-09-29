const { Kafka } = require('kafkajs');
const database = require('./database');

class NeynarKafkaStream {
  constructor() {
    this.kafka = new Kafka({
      clientId: 'ecion-tipping-app',
      brokers: [process.env.NEYNAR_KAFKA_BROKER || 'kafka.neynar.com:9092'],
      ssl: true,
      sasl: {
        mechanism: 'plain',
        username: process.env.NEYNAR_KAFKA_USERNAME,
        password: process.env.NEYNAR_KAFKA_PASSWORD
      }
    });
    
    this.consumer = this.kafka.consumer({ 
      groupId: 'ecion-tip-processor',
      sessionTimeout: 30000,
      heartbeatInterval: 3000
    });
    
    this.isConnected = false;
  }

  async connect() {
    try {
      await this.consumer.connect();
      console.log('🔗 Connected to Neynar Kafka stream');
      
      // Subscribe to Farcaster event streams
      await this.consumer.subscribe({ 
        topics: [
          'farcaster.reactions', // likes, recasts
          'farcaster.casts',     // replies, quotes
          'farcaster.follows'    // follows
        ],
        fromBeginning: false // Only new events
      });
      
      this.isConnected = true;
      this.startProcessing();
      
    } catch (error) {
      console.error('❌ Kafka connection failed:', error);
      console.log('💡 Kafka streams require enterprise Neynar subscription');
      throw error;
    }
  }

  async startProcessing() {
    console.log('🔄 Starting Kafka stream processing...');
    
    await this.consumer.run({
      eachMessage: async ({ topic, partition, message }) => {
        try {
          const event = JSON.parse(message.value.toString());
          console.log(`📨 Kafka event from ${topic}:`, event.type);
          
          // Process the event just like webhook
          await this.processEvent(event);
          
        } catch (error) {
          console.error('❌ Kafka message processing error:', error);
        }
      },
    });
  }

  async processEvent(event) {
    // Same logic as webhook handler
    const interaction = await this.parseKafkaEvent(event);
    
    if (!interaction) {
      console.log('❌ Invalid interaction from Kafka event');
      return;
    }
    
    // Check if author has active tipping config
    const authorConfig = await database.getUserConfig(interaction.authorAddress);
    if (!authorConfig || !authorConfig.isActive) {
      console.log(`❌ Author ${interaction.authorAddress} has no active config`);
      return;
    }
    
    // Add to pending tips
    await database.addPendingTip(interaction);
    console.log(`✅ Kafka tip added: ${interaction.interactionType} from ${interaction.interactorFid} to ${interaction.authorFid}`);
  }

  async parseKafkaEvent(event) {
    // Same parsing logic as webhook
    let interactionType = null;
    let authorFid = null;
    let interactorFid = null;
    let castHash = '';
    
    switch (event.type) {
      case 'reaction.created':
        if (event.data.reaction_type === 1) {
          interactionType = 'like';
        } else if (event.data.reaction_type === 2) {
          interactionType = 'recast';
        }
        
        // Only original casts, not replies
        if (event.data.cast?.parent_hash) {
          return null;
        }
        
        authorFid = event.data.cast?.author?.fid;
        interactorFid = event.data.user?.fid;
        castHash = event.data.cast?.hash || '';
        break;
        
      case 'cast.created':
        if (event.data.parent_hash) {
          interactionType = 'reply';
          // Get parent cast info
          authorFid = event.data.parent_author?.fid;
          castHash = event.data.parent_hash;
        }
        interactorFid = event.data.author?.fid;
        break;
        
      case 'follow.created':
        interactionType = 'follow';
        authorFid = event.data.target_user?.fid;
        interactorFid = event.data.user?.fid;
        break;
    }
    
    if (!interactionType || !authorFid || !interactorFid) {
      return null;
    }
    
    // Get Ethereum addresses (same as webhook)
    const { getUserByFid } = require('./neynar');
    const authorUser = await getUserByFid(authorFid);
    const interactorUser = await getUserByFid(interactorFid);
    
    const authorAddress = authorUser?.verified_addresses?.eth_addresses?.[0];
    const interactorAddress = interactorUser?.verified_addresses?.eth_addresses?.[0];
    
    if (!authorAddress || !interactorAddress) {
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

  async disconnect() {
    if (this.isConnected) {
      await this.consumer.disconnect();
      console.log('🔌 Disconnected from Neynar Kafka stream');
    }
  }
}

module.exports = NeynarKafkaStream;