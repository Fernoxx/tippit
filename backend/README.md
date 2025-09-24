# Ecion Backend

Backend service for processing Farcaster interactions and batch tipping on Base network.

## Features

- **Neynar Webhook Processing**: Receives and processes Farcaster interactions
- **Batch Processing**: Groups interactions for 1 minute then processes in single transaction
- **Follower Validation**: Checks engager's follower count against minimum requirement
- **Audience Filtering**: Validates if engager meets audience criteria (Following/Followers/Anyone)
- **Microtransaction Optimization**: Handles 100+ tips in one transaction with low gas fees

## Environment Variables

Copy `.env.example` to `.env` and fill in the values:

```bash
cp .env.example .env
```

### Required Variables:

- `BASE_RPC_URL`: Your Alchemy Base mainnet RPC URL
- `CONTRACT_ADDRESS`: Your deployed Ecion contract address (AdminUpgradeabilityProxy)
- `PRIVATE_KEY`: Backend wallet private key (for processing transactions)
- `NEYNAR_API_KEY`: Your Neynar API key
- `WEBHOOK_SECRET`: Secret for webhook verification (same as frontend)
- `BATCH_INTERVAL_MINUTES`: How often to process batches (default: 1)
- `MAX_BATCH_SIZE`: Maximum interactions per batch (default: 100)

## Deployment on Railway

1. **Create Railway Account**: Sign up at [railway.app](https://railway.app)
2. **Connect GitHub**: Link your GitHub account
3. **Deploy from Repository**: Select this backend folder
4. **Set Environment Variables**: Add all variables from `.env.example`
5. **Deploy**: Railway will automatically deploy and provide URL

## Local Development

```bash
npm install
npm run dev
```

## API Endpoints

- `POST /webhook/neynar` - Receives Neynar webhooks
- `GET /health` - Health check endpoint

## How It Works

1. **Webhook Reception**: Receives Farcaster interactions from Neynar
2. **Validation**: Checks if engager meets follower count and audience criteria
3. **Queueing**: Adds valid interactions to processing queue
4. **Batch Processing**: Every minute, processes all queued interactions
5. **Contract Interaction**: Calls `batchProcessTips` on Ecion contract
6. **Fallback**: If batch fails, processes interactions individually

## Monitoring

- Check Railway logs for processing status
- Monitor batch sizes and processing times
- Verify contract interactions on BaseScan

## Security

- Webhook signature verification
- Private key stored securely in Railway
- Input validation for all webhook data