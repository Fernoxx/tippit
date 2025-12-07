# Daily Rewards System Implementation Summary

## ✅ Completed Changes

### 1. Contract Analysis
- **Current Contract Limitation Identified**: The existing `EcionDailyRewards.sol` contract **CANNOT** support one-by-one claiming. It claims both ECION and USDC in a single transaction.
- **Solution Created**: New `EcionDailyRewardsV2.sol` contract that supports individual token claiming

### 2. New Contract Created (`EcionDailyRewardsV2.sol`)
- ✅ Supports individual token claims via `claimToken()` function
- ✅ Added CELO and ARB token support
- ✅ Updated reward structure with CELO and ARB rewards
- ✅ Tracks individual token claims per day per user
- ✅ Token type enum: 0=ECION, 1=USDC, 2=CELO, 3=ARB

### 3. Backend Updates (`backend-only/src/index.js`)
- ✅ Updated `DAILY_REWARDS` config to include CELO and ARB rewards
- ✅ Updated `generateRewardAmounts()` to generate CELO and ARB amounts
- ✅ Created new `/api/daily-checkin/claim-token` endpoint for individual token claims
- ✅ Added chain detection support (Base=8453, CELO=42220, Arbitrum=42161)
- ✅ Updated signature generation to match V2 contract format

### 4. Frontend Updates (`src/pages/admin.tsx`)
- ✅ Updated `DAY_REWARDS` config with CELO and ARB tokens
- ✅ Added CELO and ARB token logos and configurations
- ✅ Created `claimIndividualToken()` function for one-by-one claiming
- ✅ Updated UI to show individual claim buttons per token
- ✅ Added chain indicators for CELO and ARB tokens
- ✅ Updated share function to include all claimed tokens

## 📋 New Reward Structure

### Complete Daily Token Breakdown:

| Day | ECION | USDC | CELO | ARB |
|-----|-------|------|------|-----|
| 1   | 1-69  | $0.02-$0.06 | - | - |
| 2   | 69-1000 | - | 0.1-0.2 | 0.025-0.1 |
| 3   | 1000-5000 | $0.02-$0.12 | - | - |
| 4   | 5000-10000 | - | 0.1-0.2 | - |
| 5   | 5000-10000 | $0.02-$0.16 | - | 0.025-0.1 |
| 6   | 10000-20000 | - | 0.1-0.2 | - |
| 7   | 10000-20000 | $0.02-$0.20 | 0.1-0.2 | 0.025-0.1 |

### CELO Rewards Schedule:
- **Day 2**: 0.1-0.2 CELO ✅
- **Day 3**: No CELO ✅
- **Day 4**: 0.1-0.2 CELO ✅
- **Day 5**: No CELO ✅
- **Day 6**: 0.1-0.2 CELO ✅
- **Day 7**: 0.1-0.2 CELO ✅

### ARB Rewards Schedule:
- **Day 1**: No ARB ✅
- **Day 2**: 0.025-0.1 ARB ✅
- **Day 3**: No ARB ✅
- **Day 4**: No ARB ✅
- **Day 5**: 0.025-0.1 ARB ✅
- **Day 6**: No ARB ✅
- **Day 7**: 0.025-0.1 ARB ✅

## ⚠️ Important Notes

### Current Contract Limitation
**The existing deployed contract (`0x8e4f21A66E8F99FbF1A6FfBEc757547C11E8653E`) CANNOT support one-by-one claiming.**

**Options:**
1. **Deploy new V2 contract** (recommended) - Deploy `EcionDailyRewardsV2.sol` to Base, CELO, and Arbitrum chains
2. **Keep using V1** - Continue claiming all tokens at once (legacy behavior)

### Multi-Chain Deployment Required

**Base Chain (8453):**
- Deploy `EcionDailyRewardsV2.sol` with ECION, USDC tokens
- Set environment variable: `DAILY_REWARDS_CONTRACT_BASE`

**CELO Chain (42220):**
- Deploy `EcionDailyRewardsV2.sol` with ECION, CELO tokens
- Set environment variable: `DAILY_REWARDS_CONTRACT_CELO`

**Arbitrum Chain (42161):**
- Deploy `EcionDailyRewardsV2.sol` with ECION, ARB tokens
- Set environment variable: `DAILY_REWARDS_CONTRACT_ARB`

### Token Addresses Needed Per Chain

You'll need to provide:
- **ECION token address** on each chain (Base, CELO, Arbitrum)
- **USDC token address** on Base (already have: `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913`)
- **CELO token address** on CELO chain
- **ARB token address** on Arbitrum chain

## 🚀 Next Steps

1. **Deploy Contracts:**
   - Deploy `EcionDailyRewardsV2.sol` to Base, CELO, and Arbitrum
   - Update environment variables with contract addresses

2. **Update Environment Variables:**
   ```bash
   DAILY_REWARDS_CONTRACT_BASE=<new_base_contract_address>
   DAILY_REWARDS_CONTRACT_CELO=<celo_contract_address>
   DAILY_REWARDS_CONTRACT_ARB=<arbitrum_contract_address>
   ```

3. **Frontend Environment Variables:**
   ```bash
   NEXT_PUBLIC_DAILY_REWARDS_CONTRACT_BASE=<base_contract>
   NEXT_PUBLIC_DAILY_REWARDS_CONTRACT_CELO=<celo_contract>
   NEXT_PUBLIC_DAILY_REWARDS_CONTRACT_ARB=<arb_contract>
   ```

4. **Test Individual Claims:**
   - Test claiming ECION, USDC, CELO, and ARB tokens individually
   - Verify chain switching works correctly
   - Test signature generation and validation

5. **Backend Wallet Configuration:**
   - Ensure backend wallet has sufficient tokens on all chains
   - Configure RPC providers for CELO and Arbitrum chains

## 📝 API Changes

### New Endpoint: `/api/daily-checkin/claim-token`
**Request:**
```json
{
  "address": "0x...",
  "dayNumber": 2,
  "tokenType": "celo",
  "chainId": 42220
}
```

**Response:**
```json
{
  "success": true,
  "dayNumber": 2,
  "tokenType": "celo",
  "amount": 0.15,
  "amountWei": "150000000000000000",
  "tokenTypeEnum": 2,
  "isFollowing": true,
  "expiry": 1234567890,
  "signature": "0x...",
  "chainId": 42220,
  "contractAddress": "0x..."
}
```

## 🔒 Security Notes

- All claims still require Farcaster FID verification
- USDC claims still require following @doteth and 0.5+ Neynar score
- Signature includes chainId to prevent cross-chain replay attacks
- Nonce system prevents signature replay
