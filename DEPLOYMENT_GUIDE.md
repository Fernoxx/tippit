# PIT Tipping - Complete Deployment Guide

This guide will help you deploy the simplified PIT tipping system that works directly with Neynar API (like Noice).

## Architecture Overview

```
Neynar Webhook → Backend → PITTippingSimplified Contract (direct)
```

**No Oracle needed** - Backend verifies interactions via Neynar webhook signatures.

## Prerequisites

1. **Base Network Access**
   - Base RPC URL: `https://mainnet.base.org`
   - Some ETH on Base for gas fees

2. **Neynar API Access**
   - API key from Neynar
   - Webhook secret for signature verification

3. **Deployment Wallet**
   - Private key with ETH for deployment
   - Will be used as fee recipient initially

## Step-by-Step Deployment

### Step 1: Deploy Smart Contract

1. **Set up environment variables:**
   ```bash
   # In project root
   echo "BASE_RPC_URL=https://mainnet.base.org" > .env
   echo "PRIVATE_KEY=your_private_key_here" >> .env
   echo "BASESCAN_API_KEY=your_basescan_api_key" >> .env
   ```

2. **Deploy contract:**
   ```bash
   npx hardhat run scripts/deploy.js --network base
   ```

3. **Save the contract address** - you'll need it for the next steps.

### Step 2: Set Up Backend

1. **Navigate to backend folder:**
   ```bash
   cd backend
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Configure environment:**
   ```bash
   cp .env.example .env
   ```

4. **Update `.env` with your values:**
   ```env
   # Blockchain
   BASE_RPC_URL=https://mainnet.base.org
   PRIVATE_KEY=your_deployer_private_key
   CONTRACT_ADDRESS=0x... # From Step 1
   
   # Neynar
   NEYNAR_API_KEY=your_neynar_api_key
   WEBHOOK_SECRET=your_webhook_secret
   
   # Security
   INTERNAL_API_KEY=your_random_api_key
   
   # Configuration
   FEE_RECIPIENT=your_fee_recipient_address
   BATCH_INTERVAL_MINUTES=1
   MAX_BATCH_SIZE=50
   ```

5. **Deploy backend (choose one):**

   **Option A: Vercel (Recommended)**
   ```bash
   # Connect backend folder to Vercel
   vercel --prod
   ```

   **Option B: Your own server**
   ```bash
   npm start
   ```

### Step 3: Update Contract Backend Verifier

1. **Get your backend address:**
   - If using Vercel: `https://your-app.vercel.app`
   - If using your server: `https://your-domain.com`

2. **Update contract (using Hardhat console):**
   ```bash
   npx hardhat console --network base
   ```
   
   ```javascript
   const contract = await ethers.getContractAt("PITTippingSimplified", "YOUR_CONTRACT_ADDRESS");
   await contract.updateBackendVerifier("YOUR_BACKEND_ADDRESS");
   ```

### Step 4: Configure Neynar Webhook

1. **Go to Neynar dashboard**
2. **Create new webhook:**
   - **Name**: `PIT Tipping Bot`
   - **Target URL**: `https://your-backend-domain.com/webhook/neynar`
   - **Events**: 
     - `cast.created`
     - `reaction.created` 
     - `follow.created`
   - **Secret**: Use the same secret from your backend `.env`

3. **Save the webhook secret** to your backend `.env`

### Step 5: Update Frontend

1. **Update contract address in frontend:**
   ```typescript
   // src/utils/contracts.ts
   export const CONTRACTS = {
     PITTippingSimplified: {
       address: '0x...', // Your deployed contract address
       abi: [...]
     }
   }
   ```

2. **Update backend URL:**
   ```typescript
   // Add to your frontend .env
   NEXT_PUBLIC_BACKEND_URL=https://your-backend-domain.com
   ```

### Step 6: Deploy Frontend

1. **Deploy to Vercel:**
   ```bash
   vercel --prod
   ```

2. **Update environment variables in Vercel dashboard:**
   - `NEXT_PUBLIC_NEYNAR_API_KEY`
   - `NEXT_PUBLIC_BACKEND_URL`
   - `WEBHOOK_SECRET`
   - `BACKEND_URL`

## Testing Your Deployment

### 1. Test Backend Health
```bash
curl https://your-backend-domain.com/health
```

### 2. Test Webhook (using Neynar test)
- Use Neynar's webhook testing feature
- Check backend logs for incoming webhooks

### 3. Test Frontend
- Connect wallet
- Set up tipping configuration
- Approve token allowance
- Test with a real Farcaster interaction

## Monitoring

### Backend Logs
Monitor these logs:
- ✅ `Valid webhook received`
- 📝 `Added interaction: like`
- 🔄 `Processing batch of X interactions`
- ✅ `Batch processed successfully`

### Contract Events
Watch for:
- `ConfigUpdated` - User set up tipping
- `TipSent` - Successful tip processed
- `ConfigRevoked` - User disabled tipping

## Troubleshooting

### Common Issues

1. **Webhook signature verification fails**
   - Check `WEBHOOK_SECRET` matches Neynar
   - Verify webhook URL is correct

2. **Contract calls fail**
   - Verify `CONTRACT_ADDRESS` is correct
   - Check `PRIVATE_KEY` has permissions
   - Ensure contract is deployed

3. **Batch processing fails**
   - Check gas limits
   - Verify user allowances
   - Review contract state

### Debug Commands

```bash
# Check contract deployment
npx hardhat verify --network base CONTRACT_ADDRESS

# Check backend health
curl https://your-backend-domain.com/health

# Check pending interactions
curl https://your-backend-domain.com/interactions/pending
```

## Security Checklist

- ✅ Webhook signature verification enabled
- ✅ Backend verifier address set in contract
- ✅ Private keys stored securely
- ✅ Environment variables configured
- ✅ Contract ownership transferred (optional)

## Production Checklist

- ✅ Contract deployed and verified
- ✅ Backend deployed and accessible
- ✅ Neynar webhook configured
- ✅ Frontend deployed
- ✅ All environment variables set
- ✅ Monitoring and logging enabled
- ✅ Error handling tested

## Support

If you encounter issues:
1. Check logs for error details
2. Verify environment configuration
3. Test webhook signature verification
4. Check contract deployment status

## Next Steps

After successful deployment:
1. **Monitor performance** - Watch gas usage and batch sizes
2. **Optimize settings** - Adjust batch intervals based on usage
3. **Add features** - Consider additional interaction types
4. **Scale infrastructure** - Monitor server performance

Your PIT tipping system is now live and ready to process Farcaster interactions! 🎉