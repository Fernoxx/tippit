const { ethers } = require("hardhat");

async function main() {
  console.log("Deploying PIT contracts to Base...");

  const [deployer] = await ethers.getSigners();
  console.log("Deploying contracts with account:", deployer.address);

  // Deploy PITTipping contract
  const PITTipping = await ethers.getContractFactory("PITTipping");
  const pitTipping = await PITTipping.deploy(
    deployer.address, // fee recipient
    deployer.address  // temporary oracle address
  );
  await pitTipping.deployed();
  console.log("PITTipping deployed to:", pitTipping.address);

  // Deploy FarcasterOracle contract
  const FarcasterOracle = await ethers.getContractFactory("FarcasterOracle");
  const farcasterOracle = await FarcasterOracle.deploy(pitTipping.address);
  await farcasterOracle.deployed();
  console.log("FarcasterOracle deployed to:", farcasterOracle.address);

  // Update oracle address in PITTipping
  await pitTipping.updateOracle(farcasterOracle.address);
  console.log("Oracle address updated in PITTipping");

  // Grant verifier role to the oracle service account
  const VERIFIER_ROLE = await farcasterOracle.VERIFIER_ROLE();
  await farcasterOracle.grantRole(VERIFIER_ROLE, deployer.address);
  console.log("Verifier role granted");

  console.log("\nDeployment complete!");
  console.log("PITTipping:", pitTipping.address);
  console.log("FarcasterOracle:", farcasterOracle.address);
  console.log("\nUpdate these addresses in src/utils/contracts.ts");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });