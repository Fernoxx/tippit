# Daily Rewards System Analysis

## Current System Status

### Contract Analysis: `EcionDailyRewards.sol`

**Current Behavior:**
- The `checkIn` function claims **BOTH ECION and USDC in a single transaction**
- Function signature: `checkIn(uint256 ecionAmount, uint256 usdcAmount, bool isFollowing, uint256 expiry, bytes signature)`
- **CANNOT claim tokens one by one** - both tokens are transferred together in one call

**Current Reward Structure (Base Chain):**
- **Day 1**: 1-69 ECION + $0.02-$0.06 USDC
- **Day 2**: 69-1000 ECION only
- **Day 3**: 1000-5000 ECION + $0.02-$0.12 USDC
- **Day 4**: 5000-10000 ECION only
- **Day 5**: 5000-10000 ECION + $0.02-$0.16 USDC
- **Day 6**: 10000-20000 ECION only
- **Day 7**: 10000-20000 ECION + $0.02-$0.20 USDC

### Frontend Implementation (`admin.tsx`)
- Currently shows all rewards for a day in a modal
- Has a single "Claim All" button that calls `claimAllRewards()`
- Displays individual token amounts but claims them together

### Backend Implementation (`index.js`)
- `/api/daily-checkin/claim` endpoint generates signature for both tokens
- Returns both `ecionAmountWei` and `usdcAmountWei` together
- Single signature covers both tokens

---

## Required Changes

### 1. One-by-One Claiming Support

**Problem:** Current contract cannot claim tokens individually.

**Solution:** Modify contract to support individual token claims:
- Add separate functions: `claimEcion()`, `claimUsdc()`, `claimCelo()`, `claimArb()`
- OR modify `checkIn` to accept a token type parameter
- Track which tokens have been claimed per day per user

### 2. New Reward Structure

**CELO Rewards:**
- **Day 2**: 0.1-0.2 CELO (random)
- **Day 3**: No CELO
- **Day 4**: 0.1-0.2 CELO
- **Day 5**: No CELO
- **Day 6**: 0.1-0.2 CELO
- **Day 7**: 0.1-0.2 CELO

**ARB Rewards:**
- **Day 1**: No ARB
- **Day 2**: 0.025-0.1 ARB (random)
- **Day 3**: No ARB
- **Day 4**: No ARB
- **Day 5**: 0.025-0.1 ARB
- **Day 6**: No ARB
- **Day 7**: 0.025-0.1 ARB

**Complete Daily Token Breakdown:**

| Day | ECION | USDC | CELO | ARB |
|-----|-------|------|------|-----|
| 1   | 1-69  | $0.02-$0.06 | - | - |
| 2   | 69-1000 | - | 0.1-0.2 | 0.025-0.1 |
| 3   | 1000-5000 | $0.02-$0.12 | - | - |
| 4   | 5000-10000 | - | 0.1-0.2 | - |
| 5   | 5000-10000 | $0.02-$0.16 | - | 0.025-0.1 |
| 6   | 10000-20000 | - | 0.1-0.2 | - |
| 7   | 10000-20000 | $0.02-$0.20 | 0.1-0.2 | 0.025-0.1 |

### 3. Multi-Chain Support

**Current:** Only Base chain (chainId: 8453)

**Required:**
- Deploy contracts on CELO chain
- Deploy contracts on Arbitrum chain
- Update frontend to detect chain and show appropriate rewards
- Update backend to handle multi-chain signatures

---

## Implementation Plan

### Phase 1: Contract Updates
1. Modify `EcionDailyRewards.sol` to support individual token claims
2. Add CELO and ARB token support
3. Update reward ranges in contract
4. Add tracking for individual token claims per day

### Phase 2: Backend Updates
1. Update `DAILY_REWARDS` config to include CELO and ARB
2. Modify `/api/daily-checkin/claim` to support individual token claims
3. Add chain detection and multi-chain signature support
4. Update reward generation logic

### Phase 3: Frontend Updates
1. Update admin panel to show individual claim buttons per token
2. Add chain switching UI
3. Display CELO and ARB rewards
4. Update claim flow to handle individual token claims

### Phase 4: Deployment
1. Deploy updated contracts to Base, CELO, and Arbitrum
2. Update environment variables
3. Test multi-chain claiming

---

## Important Notes

⚠️ **Current Contract Limitation:** The existing contract **CANNOT** support one-by-one claiming without modification. We need to either:
- Deploy a new contract version with individual claim functions
- Or modify the existing contract (if upgradeable)

⚠️ **Multi-Chain Complexity:** Each chain needs:
- Separate contract deployment
- Separate token addresses (ECION, USDC, CELO, ARB on each chain)
- Chain-specific RPC endpoints
- Chain-specific signature generation
