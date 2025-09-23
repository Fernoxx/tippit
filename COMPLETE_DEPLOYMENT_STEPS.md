# PIT Tipping - Complete Step-by-Step Deployment

## 🎯 **System Overview**

**Your System Logic:**
1. **User sets token allowance** to the contract (any Base token: USDC, ETH, DAI, etc.)
2. **User configures tip amounts** (like: 1 token, reply: 2 tokens, etc.)
3. **When someone likes/recasts/replies to their post** → They get tipped tokens
4. **Backend checks via Neynar webhook** → Processes the tip
5. **Engager receives tokens** from the post author

**Flow:**
```
User posts → Someone likes → Neynar webhook → Backend → Contract → Token transfer
```

## 📋 **Complete Deployment Steps**

### **Step 1: Deploy Smart Contract**

1. **Set up environment:**
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

3. **Save the contract address** - you'll need it for backend!

### **Step 2: Set Up Backend**

1. **Navigate to backend:**
   ```bash
   cd backend
   npm install
   ```

2. **Configure environment:**
   ```bash
   cp .env.example .env
   ```

3. **Edit `.env` with your values:**
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

### **Step 3: Deploy Backend**

**Option A: Vercel (Recommended)**
```bash
# In backend folder
vercel --prod
```

**Option B: Your Server**
```bash
npm start
```

**Save your backend URL** (e.g., `https://your-app.vercel.app`)

### **Step 4: Update Contract Backend Verifier**

1. **Get your backend address:**
   - Vercel: `https://your-app.vercel.app`
   - Your server: `https://your-domain.com`

2. **Update contract:**
   ```bash
   npx hardhat console --network base
   ```
   
   ```javascript
   const contract = await ethers.getContractAt("PITTippingSimplified", "YOUR_CONTRACT_ADDRESS");
   await contract.updateBackendVerifier("YOUR_BACKEND_ADDRESS");
   ```

### **Step 5: Configure Neynar Webhook**

1. **Go to Neynar dashboard**
2. **Create webhook:**
   - **Name**: `PIT Tipping Bot`
   - **Target URL**: `https://your-backend-domain.com/webhook/neynar`
   - **Events**: 
     - ✅ `cast.created`
     - ✅ `reaction.created` 
     - ✅ `follow.created`
   - **Secret**: Use the same secret from your backend `.env`

3. **Save the webhook secret** to your backend `.env`

### **Step 6: Update Frontend**

1. **Update contract address:**
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

### **Step 7: Deploy Frontend**

```bash
# In project root
vercel --prod
```

### **Step 8: Update Vercel Environment Variables**

In Vercel dashboard, add:
- `NEXT_PUBLIC_NEYNAR_API_KEY`
- `NEXT_PUBLIC_BACKEND_URL`
- `WEBHOOK_SECRET`
- `BACKEND_URL`

## 🧪 **Testing Your System**

### **1. Test Backend Health**
```bash
curl https://your-backend-domain.com/health
```

### **2. Test Webhook**
- Use Neynar's webhook testing feature
- Check backend logs for incoming webhooks

### **3. Test Frontend**
1. **Connect wallet**
2. **Set up tipping config:**
   - Token: Any Base token (USDC, ETH, DAI, etc.)
   - Like amount: 1 token
   - Reply amount: 2 tokens
   - Spending limit: 100 tokens
3. **Approve token allowance**
4. **Test with real Farcaster interaction**

## 🔄 **How It Works**

### **User Setup:**
1. User connects wallet
2. User sets tipping config (token amounts for each action)
3. User approves token allowance to contract
4. User posts on Farcaster

### **When Someone Engages:**
1. **Someone likes/replies to user's post**
2. **Neynar sends webhook** to your backend
3. **Backend verifies signature** and queues interaction
4. **Batch processor runs** (every minute)
5. **Contract transfers tokens** from post author to engager
6. **Engager receives tokens** in their wallet

### **Example:**
- Alice sets: Like = 1 USDC, Reply = 2 USDC
- Bob likes Alice's post
- Bob receives 1 USDC from Alice
- Bob replies to Alice's post  
- Bob receives 2 USDC from Alice

## 📊 **Monitoring**

### **Backend Logs:**
- ✅ `Valid webhook received: reaction.created`
- 📝 `Added interaction: like (1 pending)`
- 🔄 `Processing batch of 3 interactions...`
- ✅ `Batch processed successfully! Gas used: 150000`

### **Contract Events:**
- `ConfigUpdated` - User set up tipping
- `TipSent` - Tokens transferred from author to engager
- `ConfigRevoked` - User disabled tipping

## 🚨 **Troubleshooting**

### **Common Issues:**

1. **Webhook signature fails**
   - Check `WEBHOOK_SECRET` matches Neynar
   - Verify webhook URL is correct

2. **Contract calls fail**
   - Verify `CONTRACT_ADDRESS` is correct
   - Check `PRIVATE_KEY` has permissions
   - Ensure contract is deployed

3. **Token transfers fail**
   - Check user has token balance
   - Check user approved allowance
   - Check spending limit not exceeded

### **Debug Commands:**

```bash
# Check contract deployment
npx hardhat verify --network base CONTRACT_ADDRESS

# Check backend health
curl https://your-backend-domain.com/health

# Check pending interactions
curl https://your-backend-domain.com/interactions/pending
```

## ✅ **Final Checklist**

- [ ] Contract deployed and verified
- [ ] Backend deployed and accessible
- [ ] Neynar webhook configured
- [ ] Frontend deployed
- [ ] All environment variables set
- [ ] Backend verifier updated in contract
- [ ] Test webhook working
- [ ] Test token transfer working

## 🎉 **You're Done!**

Your PIT tipping system is now live! Users can:
1. Set token tipping amounts (any Base token)
2. Approve token allowance
3. Get tipped when people engage with their posts
4. Receive tokens when they engage with others' posts

The system works exactly like Noice but with your custom logic! 🚀