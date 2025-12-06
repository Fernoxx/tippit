const hre = require("hardhat");

async function main() {
  console.log("Deploying EcionDailyRewards contract...");

  // Contract addresses on Base
  const ECION_TOKEN = process.env.ECION_TOKEN_ADDRESS || "0xdcc17f9429f8fd30e31315e1d33e2ef33ae38b07";
  const USDC_TOKEN = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913"; // USDC on Base
  const BACKEND_SIGNER = process.env.BACKEND_WALLET_ADDRESS; // Your backend wallet address

  if (!BACKEND_SIGNER) {
    console.error("ERROR: BACKEND_WALLET_ADDRESS environment variable is required");
    console.log("Set it to your backend wallet's public address that will sign check-in requests");
    process.exit(1);
  }

  console.log("\nDeployment parameters:");
  console.log("- ECION Token:", ECION_TOKEN);
  console.log("- USDC Token:", USDC_TOKEN);
  console.log("- Backend Signer:", BACKEND_SIGNER);

  const EcionDailyRewards = await hre.ethers.getContractFactory("EcionDailyRewards");
  const contract = await EcionDailyRewards.deploy(
    ECION_TOKEN,
    USDC_TOKEN,
    BACKEND_SIGNER
  );

  await contract.waitForDeployment();
  const contractAddress = await contract.getAddress();

  console.log("\n✅ EcionDailyRewards deployed to:", contractAddress);
  console.log("\n📋 Next steps:");
  console.log("1. Verify the contract on BaseScan:");
  console.log(`   npx hardhat verify --network base ${contractAddress} ${ECION_TOKEN} ${USDC_TOKEN} ${BACKEND_SIGNER}`);
  console.log("\n2. Deposit ECION tokens to the contract for rewards:");
  console.log(`   - Send ECION tokens to: ${contractAddress}`);
  console.log("\n3. Deposit USDC tokens to the contract for rewards:");
  console.log(`   - Send USDC tokens to: ${contractAddress}`);
  console.log("\n4. Update your .env with:");
  console.log(`   DAILY_REWARDS_CONTRACT=${contractAddress}`);
  
  // Log reward structure
  console.log("\n📦 Reward Structure:");
  console.log("Day 1: 1-69 ECION + $0.01-$0.20 USDC");
  console.log("Day 2: 69-1000 ECION only");
  console.log("Day 3: 1000-5000 ECION + $0.01-$0.20 USDC");
  console.log("Day 4: 5000-10000 ECION only");
  console.log("Day 5: 5000-10000 ECION + $0.01-$0.20 USDC");
  console.log("Day 6: 10000-20000 ECION only");
  console.log("Day 7: 10000-20000 ECION + $0.01-$0.20 USDC");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
