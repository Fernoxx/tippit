const { ethers } = require("hardhat");

async function main() {
  console.log("Deploying PITTippingSimplified contract to Base...");

  const [deployer] = await ethers.getSigners();
  console.log("Deploying contracts with account:", deployer.address);

  // Deploy PITTippingSimplified contract
  const PITTippingSimplified = await ethers.getContractFactory("PITTippingSimplified");
  const pitTipping = await PITTippingSimplified.deploy(
    deployer.address, // fee recipient
    deployer.address  // backend verifier (will be updated later)
  );
  await pitTipping.deployed();
  console.log("PITTippingSimplified deployed to:", pitTipping.address);

  console.log("\nDeployment complete!");
  console.log("PITTippingSimplified:", pitTipping.address);
  console.log("\nNext steps:");
  console.log("1. Update CONTRACT_ADDRESS in backend/.env");
  console.log("2. Update address in src/utils/contracts.ts");
  console.log("3. Update backend verifier address in contract");
  console.log("4. Start backend server");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });