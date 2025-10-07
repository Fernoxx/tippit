const hre = require("hardhat");

async function main() {
  console.log("🚀 Deploying EcionTipnV2 contract...");
  
  // Get the contract factory
  const EcionTipnV2 = await hre.ethers.getContractFactory("EcionTipnV2");
  
  // Deploy the contract
  const tipnV2 = await EcionTipnV2.deploy();
  await tipnV2.waitForDeployment();
  
  const contractAddress = await tipnV2.getAddress();
  console.log(`✅ EcionTipnV2 deployed to: ${contractAddress}`);
  
  // Add backend wallet as executor
  const backendWallet = process.env.BACKEND_WALLET_ADDRESS || "0x1d70a1425D7B5411fDBC6D99921a51514b358CC3";
  console.log(`🔄 Adding backend wallet as executor: ${backendWallet}`);
  await tipnV2.addExecutor(backendWallet);
  console.log(`✅ Backend wallet added as executor`);
  
  console.log("\n📋 Contract Details:");
  console.log(`Address: ${contractAddress}`);
  console.log(`Owner: ${await tipnV2.owner()}`);
  console.log(`Is Executor (${backendWallet}): ${await tipnV2.isExecutor(backendWallet)}`);
  
  console.log("\n🔧 Add this to your environment variables:");
  console.log(`ECION_TIPN_V2_CONTRACT_ADDRESS=${contractAddress}`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });