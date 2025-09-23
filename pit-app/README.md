# PIT - Post Incentive Tipping

PIT is a reverse tipping application for Farcaster where users get tipped for engaging with posts. Unlike traditional tipping where you tip content creators, in PIT, content creators set up tips that are automatically sent to users who like, reply, recast, quote, or follow them.

## Features

- **Reverse Tipping**: Post authors tip users who interact with their content
- **Multiple Interaction Types**: Support for likes, replies, recasts, quotes, and follows
- **Spending Controls**: Set maximum spending limits and per-interaction tip amounts
- **Real-time Leaderboard**: Track top tippers and earners
- **USDC Support**: Built-in support for USDC on Base chain
- **Farcaster Integration**: Seamless integration with Farcaster protocol

## Architecture

### Smart Contracts

1. **PITTipping.sol**: Main contract handling tipping logic, user configurations, and fund management
2. **FarcasterOracle.sol**: Oracle contract for verifying Farcaster interactions and mapping FIDs to addresses

### Frontend

- Next.js application with TypeScript
- RainbowKit for wallet connections
- Wagmi for blockchain interactions
- Framer Motion for animations
- Tailwind CSS for styling

## Getting Started

### Prerequisites

- Node.js 18+
- npm or yarn
- MetaMask or compatible wallet

### Installation

1. Clone the repository:
```bash
git clone <repository-url>
cd pit-app
```

2. Install dependencies:
```bash
npm install
```

3. Set up environment variables:
```bash
cp .env.example .env.local
```

Edit `.env.local` and add:
```
NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID=your_project_id
ORACLE_PRIVATE_KEY=your_oracle_private_key
```

4. Run the development server:
```bash
npm run dev
```

## Deployment

### Smart Contracts

1. Deploy contracts to Base mainnet:
```bash
npx hardhat deploy --network base
```

2. Update contract addresses in `src/utils/contracts.ts`

3. Verify contracts:
```bash
npx hardhat verify --network base <contract-address>
```

### Frontend

1. Build the application:
```bash
npm run build
```

2. Deploy to Vercel:
```bash
vercel
```

## Usage

### For Post Authors (Tippers)

1. Connect your wallet and Farcaster account
2. Go to Settings and configure:
   - Set spending limit (maximum USDC to spend)
   - Set tip amounts for each interaction type
   - Deposit USDC to fund tips
3. Your posts will now automatically tip users who interact with them

### For Users (Earners)

1. Connect your wallet and Farcaster account
2. Browse posts from users who have enabled tipping
3. Interact with posts (like, reply, recast, etc.)
4. Receive tips automatically to your wallet

## Contract Addresses (To be deployed)

- PITTipping: `0x...`
- FarcasterOracle: `0x...`
- USDC (Base): `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913`

## Security Considerations

- All contracts use OpenZeppelin's security libraries
- Reentrancy protection on all external calls
- Pausable functionality for emergency stops
- Access control for oracle operations
- Spending limits to prevent excessive tipping

## License

MIT