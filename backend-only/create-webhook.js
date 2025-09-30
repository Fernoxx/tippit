const { NeynarAPIClient, Configuration } = require("@neynar/nodejs-sdk");
require('dotenv').config();

// Ensure your NEYNAR_API_KEY is set in the .env file
const config = new Configuration({
  apiKey: process.env.NEYNAR_API_KEY,
});

if (!process.env.NEYNAR_API_KEY) {
  throw new Error("NEYNAR_API_KEY is not set");
}

const client = new NeynarAPIClient(config);

async function createWebhook() {
  try {
    console.log('🔗 Creating webhook with Neynar SDK...');
    
    // Get your Railway backend URL
    const webhookUrl = process.env.RAILWAY_PUBLIC_DOMAIN || process.env.WEBHOOK_URL;
    
    if (!webhookUrl) {
      throw new Error("RAILWAY_PUBLIC_DOMAIN or WEBHOOK_URL must be set");
    }
    
    const fullWebhookUrl = `${webhookUrl}/webhook/neynar`;
    console.log('📡 Webhook URL:', fullWebhookUrl);
    
    const webhook = await client.publishWebhook({
      name: "Ecion Farcaster Events Webhook",
      url: fullWebhookUrl,
      subscription: {
        // Capture ALL reaction.created events (no filters)
        "reaction.created": {},
        
        // Capture ALL cast.created events (no filters) 
        "cast.created": {},
        
        // Capture ALL follow.created events (no filters)
        "follow.created": {},
      },
    });
    
    console.log("✅ Webhook created successfully:", webhook);
    console.log("🎯 Webhook will receive ALL events without filters");
    
  } catch (error) {
    console.error("❌ Error creating webhook:", error);
    
    if (error.response) {
      console.error("Response status:", error.response.status);
      console.error("Response data:", error.response.data);
    }
  }
}

// Run the script
createWebhook();