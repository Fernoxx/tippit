# Ecion Backend - Backend-Only Tipping System

Backend-only tipping system that works exactly like Noice but with additional features.

## How It Works

### 1. User Approval Process
- Users approve USDC (or any token) to backend wallet address
- Backend wallet holds approved tokens
- Backend processes all tips from its own wallet

### 2. Features (All Backend-Only)
✅ **Tipping amounts** (0.01, 0.025 USDC, etc.)
✅ **Toggle switches** (like/reply/recast on/off)
✅ **Audience filtering** (Following/Followers/Anyone)
✅ **Follower barriers** (min 25-1000 followers)
✅ **Neynar Score filtering** (min 0.0-1.0 score)
✅ **Any token support** (USDC, ETH, DAI, etc.)
✅ **Batch processing** (100+ tips in 1 minute)
✅ **Spending limits** (max per user)

### 3. 1-Minute Batch Processing (EXACTLY LIKE NOICE)
```
Minute 1: Collect 50 tips → Send 1 transaction with 50 transfers
Minute 2: Collect 30 tips → Send 1 transaction with 30 transfers  
Minute 3: Collect 80 tips → Send 1 transaction with 80 transfers
```

**Example Noice Transaction:**
- Transaction Hash: `0x470cbadbd6a58f7ff736c8768daf9de8076ea1d08c1fac3aebc028ba3c0dd8b5`
- **24 ERC-20 transfers** in ONE transaction
- Gas used: 578,721 (15.23% of 3.8M limit)
- Function: `multiTransfer(address[] recipients, uint256[] amounts)`

## Setup

### 1. Environment Variables
```bash
cp .env.example .env
```

Fill in:
- `BACKEND_WALLET_PRIVATE_KEY` - Your backend wallet private key
- `BACKEND_WALLET_ADDRESS` - Your backend wallet address
- `BASE_RPC_URL` - Your Alchemy Base RPC URL
- `NEYNAR_API_KEY` - Your Neynar API key
- `WEBHOOK_SECRET` - Random secret for webhook verification

### 2. Install Dependencies
```bash
npm install
```

### 3. Run
```bash
npm start
# or for development
npm run dev
```

## API Endpoints

### Webhook
- `POST /webhook/neynar` - Receives Neynar webhooks

### User Configuration
- `POST /api/config` - Set user tipping configuration
- `GET /api/config/:userAddress` - Get user configuration

### History
- `GET /api/history/:userAddress` - Get user tip history

### Health
- `GET /health` - Health check

## Database Structure

### User Config
```json
{
  "userAddress": "0x123...",
  "tokenAddress": "0xUSDC...",
  "likeAmount": "0.01",
  "replyAmount": "0.025", 
  "likeEnabled": true,
  "replyEnabled": true,
  "audience": "Anyone",
  "minFollowerCount": 25,
  "spendingLimit": "1000",
  "totalSpent": "50.5",
  "isActive": true
}
```

### Pending Tips
```json
{
  "authorAddress": "0x123...",
  "interactorAddress": "0x456...",
  "authorFid": 12345,
  "interactorFid": 67890,
  "amount": "0.01",
  "actionType": "like",
  "castHash": "0xabc...",
  "timestamp": 1234567890
}
```

## Deployment

### Railway
1. Create new Railway project
2. Connect GitHub repository
3. Set environment variables
4. Deploy

### VPS
1. Upload code to server
2. Install Node.js 18+
3. Set environment variables
4. Run `npm start`

## How Backend Handles Everything

### 1. User Configuration
- Stored in JSON files (or MongoDB)
- All tipping rules, amounts, toggles, audience settings
- Spending limits and tracking

### 2. Neynar Integration
- Receives webhooks for all Farcaster interactions
- Validates interactions against user configurations
- Checks follower counts via Neynar API
- Validates audience criteria (following/followers/anyone)

### 3. Batch Processing
- Collects tips for 1 minute
- Validates all tips (amounts, limits, criteria)
- Groups by token type
- Sends individual transfers from backend wallet
- Updates user spending totals

### 4. Token Management
- Backend wallet holds all approved tokens
- Users approve tokens to backend wallet address
- Backend sends tokens directly to engagers
- No smart contracts needed

## Advantages Over Smart Contracts

✅ **No deployment needed** - Just backend code
✅ **No gas fees for users** - Only backend pays gas
✅ **Instant updates** - Change rules without contract upgrades
✅ **Better UX** - No wallet popups for every tip
✅ **Lower costs** - No contract deployment/maintenance
✅ **More flexible** - Easy to add new features

## Monitoring

- Check Railway logs for batch processing
- Monitor pending tips count
- Track successful/failed transfers
- Monitor backend wallet token balances