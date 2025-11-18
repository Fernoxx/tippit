# DailyCheckIn Contract Deployment Instructions

## Remix IDE Deployment

### Step 1: Open Remix
1. Go to https://remix.ethereum.org
2. Create a new file: `DailyCheckIn.sol`
3. Copy the entire contract code from `backend-only/contracts/DailyCheckIn.sol`

### Step 2: Compiler Settings
1. Go to **Solidity Compiler** tab (left sidebar)
2. Set **Compiler Version**: `0.8.20` (or latest 0.8.x)
3. Set **Language**: Solidity
4. Set **EVM Version**: `default` or `london`
5. **Enable Optimization**: ✅ Check the box
6. **Runs**: `200`
7. Click **Compile DailyCheckIn.sol**

### Step 3: Deployment Settings
1. Go to **Deploy & Run Transactions** tab
2. Select **Environment**: 
   - For Base Mainnet: `Injected Provider - MetaMask` (connect your wallet)
   - For Base Testnet: `Injected Provider - MetaMask` (switch network in MetaMask)
3. Select **Contract**: `DailyCheckIn`
4. Set **Gas Limit**: Leave default (or 3000000)

### Step 4: Constructor Parameters
You need to provide 3 parameters when deploying:

1. **`_ecionToken`** (address):
   - Your ECION token contract address
   - Example: `0xdcc17f9429f8fd30e31315e1d33e2ef33ae38b07`

2. **`_backendWallet`** (address):
   - Your backend wallet address (the wallet that holds ECION tokens)
   - This is the wallet that will send tokens to users
   - Get from: `process.env.BACKEND_WALLET_PRIVATE_KEY` → derive address
   - Or check your backend logs for wallet address

3. **`_backendVerifier`** (address):
   - This should be the same as `_backendWallet` address
   - This is the address that signs the verification messages
   - Must match the address derived from `BACKEND_WALLET_PRIVATE_KEY`

### Step 5: Deploy
1. Click **Deploy** button
2. Confirm transaction in MetaMask
3. Wait for deployment confirmation
4. **Copy the deployed contract address** - you'll need this!

### Step 6: Post-Deployment Setup

#### 6.1: Approve Contract to Spend Tokens
After deployment, you need to approve the contract to spend tokens from your backend wallet:

**Option A: Via Backend API**
```bash
POST /api/daily-checkin/approve-contract
Body: { "contractAddress": "0xYourDeployedContractAddress" }
```

**Option B: Via Remix**
1. In Remix, under **Deployed Contracts**, find your contract
2. Find the ECION token contract
3. Call `approve(spender: contractAddress, amount: max)` 
   - spender: Your DailyCheckIn contract address
   - amount: `115792089237316195423570985008687907853269984665640564039457584007913129639935` (max uint256)

#### 6.2: Set Environment Variables
Add to your backend `.env`:
```
DAILY_CHECKIN_CONTRACT_ADDRESS=0xYourDeployedContractAddress
```

Add to your frontend `.env`:
```
NEXT_PUBLIC_DAILY_CHECKIN_CONTRACT=0xYourDeployedContractAddress
```

### Step 7: Verify Contract (Optional but Recommended)
1. Go to BaseScan (Base blockchain explorer)
2. Find your contract address
3. Click "Verify and Publish"
4. Select: Solidity (Single file)
5. Compiler: 0.8.20
6. Optimization: Yes, 200 runs
7. Paste your contract code
8. Submit

## Important Notes

- **Optimization**: Must be set to **200 runs** for gas efficiency
- **License**: MIT (already in contract)
- **Pragma**: `^0.8.20` (use 0.8.20 or compatible version)
- **Network**: Deploy on Base (Base Mainnet or Base Sepolia testnet)
- **Backend Wallet**: Must have ECION tokens and approve the contract
- **Backend Verifier**: Must be the same as backend wallet address

## Testing After Deployment

1. Call `/api/daily-checkin/approve-contract` to approve tokens
2. Test check-in flow:
   - User clicks box → Gets signature → Signs transaction
   - Contract verifies → Transfers tokens
3. Check BaseScan to verify transactions
