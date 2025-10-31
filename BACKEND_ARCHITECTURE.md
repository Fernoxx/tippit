# Ecion Backend Architecture - Complete Overview

## 🏗️ System Architecture

**Ecion** is a **backend-only Farcaster tipping system** that works like Noice but with additional features. The system processes tips automatically when users interact with Farcaster casts (likes, replies, recasts, follows).

---

## 📦 Core Components

### 1. **Main Server** (`src/index.js`)
- **Express.js** server running on port 3001
- Handles all API endpoints
- Manages webhook registration and updates
- Coordinates between all modules

### 2. **Webhook Handler** (`src/webhook.js`)
- Receives events from **Neynar** webhook service
- Validates webhook signatures
- Parses Farcaster events (likes, replies, recasts, follows)
- Routes valid interactions to batch processor

### 3. **Database** (`src/database-pg.js`)
- **PostgreSQL** database for production
- Stores:
  - User configurations (tipping amounts, settings)
  - User profiles (Farcaster data)
  - Pending tips queue
  - Tip history
  - Webhook configuration

### 4. **Batch Transfer Manager** (`src/batchTransferManager.js`)
- **Core tipping engine** - processes tips in 1-minute batches
- Collects tips for 60 seconds, then sends ALL in ONE transaction
- Uses `EcionBatch` smart contract for gas-efficient batch transfers
- Validates tips before adding to batch (allowance, balance, criteria)

### 5. **EcionBatch Manager** (`src/ecionBatchManager.js`)
- Interacts with `EcionBatch` smart contract on Base network
- Contract address: `0x2f47bcc17665663d1b63e8d882faa0a366907bb8`
- Executes batch transfers: `batchTip(froms[], tos[], tokens[], amounts[])`
- Handles gas optimization and retry logic

### 6. **Neynar Integration** (`src/neynar.js`)
- Fetches Farcaster user data via Neynar API
- Gets follower counts, Neynar scores, user relationships
- Validates audience criteria (Following/Followers/Anyone)

---

## 🔄 Complete Flow

### Step 1: User Setup
1. User connects wallet on frontend
2. User sets tipping configuration:
   - Tip amounts (like: $0.01, reply: $0.025, etc.)
   - Toggle switches (like/reply/recast/follow enabled)
   - Audience filtering (Following/Followers/Anyone)
   - Follower barriers (min 25-1000 followers)
   - Neynar score filtering (min 0.0-1.0)
   - Spending limits
3. User approves tokens to `EcionBatch` contract
4. Frontend calls `/api/config` to save configuration
5. Backend checks allowance & balance
6. If sufficient → Adds user's FID to webhook filter

### Step 2: Webhook Event Processing
1. **Neynar** sends webhook event to `/webhook/neynar`
2. Webhook handler validates signature
3. Parses event type:
   - `reaction.created` → like/recast
   - `cast.created` → reply
   - `follow.created` → follow
4. Extracts data:
   - `authorFid` (person paying tip)
   - `interactorFid` (person receiving tip)
   - `castHash` (cast being interacted with)
   - Ethereum addresses from verified_addresses

### Step 3: Validation
For each interaction, backend validates:
- ✅ Author has active tipping config
- ✅ Action type is enabled (like/reply/recast/follow)
- ✅ Cast is eligible (latest tracked cast)
- ✅ Interactor has verified Ethereum address
- ✅ No duplicate tip (hasn't been tipped for this cast+action)
- ✅ Followers: `interactor.followers >= author.minFollowerCount`
- ✅ Neynar Score: `interactor.score >= author.minNeynarScore`
- ✅ Audience: Interactor in author's Following/Followers list (if not "Anyone")
- ✅ Allowance: `author.allowance >= tipAmount`
- ✅ Balance: `author.balance >= tipAmount`
- ✅ Spending Limit: `author.totalSpent + tipAmount <= author.spendingLimit`

### Step 4: Batch Processing
1. Valid tip added to `pendingTips` queue
2. Timer runs every **60 seconds**
3. When timer fires:
   - Groups all pending tips
   - Calls `EcionBatch.batchTip()` with ALL tips
   - Sends ONE transaction with multiple transfers
   - Updates database with tip history
   - Updates user spending totals

### Step 5: Post-Processing
1. After batch completes:
   - Updates user's `totalSpent` in config
   - Records tip in `tip_history` table
   - Checks if user still has sufficient funds
   - If insufficient → Removes FID from webhook filter
   - If balance insufficient → Auto-revokes allowance to 0

---

## 🗄️ Database Schema

### `user_configs`
Stores user tipping configurations:
```json
{
  "userAddress": "0x123...",
  "tokenAddress": "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913",
  "likeAmount": "0.01",
  "replyAmount": "0.025",
  "recastAmount": "0.015",
  "followAmount": "0.05",
  "likeEnabled": true,
  "replyEnabled": true,
  "recastEnabled": false,
  "followEnabled": true,
  "audience": 2,  // 0=Following, 1=Followers, 2=Anyone
  "minFollowerCount": 25,
  "minNeynarScore": 0.7,
  "spendingLimit": "1000",
  "totalSpent": "50.5",
  "isActive": true,
  "lastAllowance": 500,
  "lastAllowanceCheck": 1234567890
}
```

### `user_profiles`
Stores Farcaster user data:
```sql
- fid (BIGINT PRIMARY KEY)
- username, display_name, pfp_url
- follower_count
- user_address
- latest_cast_hash (only latest cast is earnable)
- is_tracking (BOOLEAN)
```

### `pending_tips`
Queue of tips waiting to be processed:
```sql
- interaction_type (like/reply/recast/follow)
- author_fid, interactor_fid
- author_address, interactor_address
- cast_hash
- amount, token_address
```

### `tip_history`
Record of all processed tips:
```sql
- from_address, to_address
- token_address, amount
- action_type, cast_hash
- transaction_hash
- processed_at
```

### `webhook_config`
Tracks webhook configuration:
```sql
- webhook_id
- tracked_fids (INTEGER[]) - Active user FIDs
```

---

## 🔑 Key Features

### 1. **1-Minute Batch Processing** (Like Noice)
- Collects tips for 60 seconds
- Sends ALL tips in ONE transaction
- Gas-efficient: ~15-20% of gas limit per batch
- Example: 50 tips = 1 transaction with 50 transfers

### 2. **Webhook Filtering**
- Only tracks users with sufficient allowance & balance
- Updates webhook filters dynamically:
  - `follow.created.target_fids` = Active user FIDs
  - `cast.created.parent_hashes` = Latest cast hashes
  - `reaction.created.target_cast_hashes` = Latest cast hashes

### 3. **Advanced Validation**
- Follower count checks
- Neynar score filtering
- Audience filtering (Following/Followers/Anyone)
- Duplicate prevention
- Spending limit enforcement

### 4. **Smart Contract Integration**
- Uses `EcionBatch` contract on Base network
- Contract handles batch transfers efficiently
- Users approve tokens to contract (not backend wallet)
- Backend wallet is executor on contract

### 5. **Latest Cast Tracking**
- Only latest main cast is eligible for tips
- Replies to old casts don't get tips
- Tracks casts in `user_casts` table
- Updates when user posts new main cast

---

## 🔌 API Endpoints

### Webhook
- `POST /webhook/neynar` - Receives Neynar webhook events

### User Configuration
- `POST /api/config` - Set user tipping configuration
- `GET /api/config/:userAddress` - Get user configuration
- `DELETE /api/config/:userAddress` - Delete user configuration

### Webhook Management
- `POST /api/create-webhook-direct` - Create webhook
- `POST /api/add-user-to-webhook` - Add FID to webhook filter
- `POST /api/remove-fid-from-webhook` - Remove FID from filter
- `GET /api/tracked-fids` - Get tracked FIDs
- `POST /api/set-webhook-fids` - Set all FIDs at once

### History & Stats
- `GET /api/history/:userAddress` - Get user tip history
- `GET /api/leaderboard` - Get leaderboard data
- `GET /api/user-earnings/:fid` - Get user earnings

### Health & Testing
- `GET /health` - Health check
- `GET /api/test-api` - Test Neynar API connectivity
- `POST /api/test-webhook` - Test webhook processing

---

## ⚙️ Environment Variables

```bash
# Blockchain
BASE_RPC_URL=https://base-mainnet.g.alchemy.com/v2/...
BACKEND_WALLET_PRIVATE_KEY=0x...
ECION_BATCH_CONTRACT_ADDRESS=0x2f47bcc17665663d1b63e8d882faa0a366907bb8

# Database
DATABASE_URL=postgresql://...

# Neynar
NEYNAR_API_KEY=neynar_...

# Webhook
WEBHOOK_SECRET=random-secret-string

# Server
PORT=3001
NODE_ENV=production
```

---

## 🚀 Deployment

### Railway (Current)
- Automatically builds and deploys
- Uses PostgreSQL database (Railway managed)
- Environment variables set in Railway dashboard
- Logs available in Railway dashboard

### Process Flow
1. Railway runs `npm start` → `node src/index.js`
2. Server initializes database connection
3. Batch transfer manager starts 60-second timer
4. Webhook endpoint ready to receive events
5. System processes tips automatically

---

## 🔍 Monitoring & Debugging

### Key Logs to Watch
- `✅ BATCHED:` - Tip added to batch queue
- `🔄 Processing batch` - Batch processing started
- `✅ Batch tip confirmed` - Transaction successful
- `❌ REJECTED:` - Tip validation failed
- `🚫 Removed FID` - User removed from webhook (insufficient funds)

### Common Issues
1. **Tips not processing**:
   - Check user allowance & balance
   - Verify FID is in webhook filter
   - Check user config is active

2. **Batch transaction fails**:
   - Check gas limit (should be ~5.5M for large batches)
   - Verify contract executor permissions
   - Check Base network status

3. **Webhook not receiving events**:
   - Verify webhook URL is correct
   - Check webhook signature secret
   - Ensure FIDs are in webhook filter

---

## 📊 Performance Characteristics

- **Batch Size**: Up to 100 tips per batch
- **Batch Interval**: 60 seconds (1 minute)
- **Gas Efficiency**: ~15-20% of block gas limit per batch
- **Tip Processing**: Sub-second validation, batch execution ~10-30 seconds
- **Database**: PostgreSQL for fast queries and leaderboard calculations

---

## 🎯 Key Differences from Smart Contract Approach

✅ **No deployment needed** - Just backend code  
✅ **No gas fees for users** - Only backend pays gas  
✅ **Instant updates** - Change rules without contract upgrades  
✅ **Better UX** - No wallet popups for every tip  
✅ **Lower costs** - No contract deployment/maintenance  
✅ **More flexible** - Easy to add new features  

---

## 📝 Summary

The Ecion backend is a sophisticated tipping system that:
1. Receives Farcaster events via Neynar webhooks
2. Validates interactions against user configurations
3. Batches tips efficiently (1-minute intervals)
4. Executes batch transfers via smart contract
5. Tracks everything in PostgreSQL database
6. Automatically manages webhook filters based on user funds

The system is designed to be **gas-efficient**, **user-friendly**, and **highly configurable** while maintaining the simplicity of a backend-only approach.
