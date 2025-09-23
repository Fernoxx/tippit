# PIT Backend - Simplified Neynar Integration

This backend handles Farcaster interactions via Neynar webhooks and processes tips in batches (like Noice).

## Architecture

```
Neynar Webhook → Backend → PITTippingSimplified Contract (direct)
```

No oracle needed - backend verifies interactions via Neynar webhook signatures.

## Features

- ✅ **Direct Neynar Integration** - No oracle complexity
- ✅ **Batch Processing** - Multiple tips in one transaction
- ✅ **Webhook Signature Verification** - Secure interaction verification
- ✅ **Automatic Retry Logic** - Fallback to individual processing
- ✅ **Real-time Processing** - Configurable batch intervals
- ✅ **Health Monitoring** - Built-in health checks

## Setup

### 1. Install Dependencies

```bash
cd backend
npm install
```

### 2. Environment Configuration

Copy `.env.example` to `.env` and configure:

```bash
cp .env.example .env
```

Required environment variables:

```env
# Blockchain
BASE_RPC_URL=https://mainnet.base.org
PRIVATE_KEY=your_deployer_private_key
CONTRACT_ADDRESS=0x... # Deployed contract address

# Neynar
NEYNAR_API_KEY=your_neynar_api_key
WEBHOOK_SECRET=your_webhook_secret

# Security
INTERNAL_API_KEY=your_internal_api_key

# Configuration
FEE_RECIPIENT=your_fee_recipient_address
BATCH_INTERVAL_MINUTES=1
MAX_BATCH_SIZE=50
```

### 3. Deploy Contract

```bash
npm run deploy
```

This will:
- Deploy `PITTippingSimplified` contract
- Set up fee recipient and backend verifier
- Output contract address for your `.env` file

### 4. Start Backend

```bash
# Development
npm run dev

# Production
npm start
```

## API Endpoints

### Webhook (Neynar)
```
POST /webhook/neynar
```
Receives Neynar webhook events and queues them for batch processing.

### Health Check
```
GET /health
```
Returns backend status and version.

### Manual Batch Processing
```
POST /batch/process
```
Manually trigger batch processing of queued interactions.

### Pending Interactions
```
GET /interactions/pending
```
View currently queued interactions.

## Neynar Webhook Configuration

Configure your Neynar webhook with:

- **URL**: `https://your-backend-domain.com/webhook/neynar`
- **Events**: `cast.created`, `reaction.created`, `follow.created`
- **Secret**: Use the same secret in your `.env` file

## Batch Processing

The backend automatically processes interactions in batches:

1. **Webhook receives interaction** → Queued
2. **Cron job runs** (every minute by default)
3. **Batch processed** → Multiple tips in one transaction
4. **Fallback** → Individual processing if batch fails

## Monitoring

Check logs for:
- ✅ Successful webhook processing
- 📝 Queued interactions
- 🔄 Batch processing status
- ❌ Error handling

## Security

- **Webhook Signature Verification** - All Neynar webhooks verified
- **Backend-only Contract Calls** - Only your backend can trigger tips
- **Rate Limiting** - Built-in protection against spam
- **Error Handling** - Graceful failure handling

## Deployment

### Vercel (Recommended)

1. Connect your backend repo to Vercel
2. Set environment variables in Vercel dashboard
3. Deploy automatically on push

### Docker

```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
EXPOSE 3001
CMD ["npm", "start"]
```

### Manual Server

1. Set up Node.js server
2. Install dependencies
3. Configure environment variables
4. Start with PM2 or similar

## Troubleshooting

### Common Issues

1. **Webhook signature verification fails**
   - Check `WEBHOOK_SECRET` matches Neynar configuration
   - Verify webhook URL is correct

2. **Contract calls fail**
   - Verify `CONTRACT_ADDRESS` is correct
   - Check `PRIVATE_KEY` has sufficient permissions
   - Ensure contract is deployed and verified

3. **Batch processing fails**
   - Check gas limits
   - Verify user allowances and balances
   - Review contract state

### Logs

Enable detailed logging by setting:
```env
NODE_ENV=development
```

## Support

For issues or questions:
1. Check logs for error details
2. Verify environment configuration
3. Test webhook signature verification
4. Check contract deployment status