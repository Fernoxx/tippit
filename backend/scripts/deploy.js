const { ethers } = require('ethers');
require('dotenv').config();

async function main() {
  console.log('🚀 Deploying PITTippingSimplified contract to Base...');

  // Initialize provider and signer
  const provider = new ethers.JsonRpcProvider(process.env.BASE_RPC_URL);
  const signer = new ethers.Wallet(process.env.PRIVATE_KEY, provider);
  
  console.log('📝 Deploying with account:', signer.address);
  
  // Check balance
  const balance = await provider.getBalance(signer.address);
  console.log('💰 Account balance:', ethers.formatEther(balance), 'ETH');
  
  if (balance < ethers.parseEther('0.01')) {
    console.warn('⚠️ Low balance! You may need more ETH for deployment.');
  }

  // Deploy contract
  const PITTippingSimplified = await ethers.getContractFactory('PITTippingSimplified');
  
  const feeRecipient = process.env.FEE_RECIPIENT || signer.address;
  const backendVerifier = process.env.BACKEND_VERIFIER || signer.address;
  
  console.log('📋 Deployment parameters:');
  console.log('  Fee Recipient:', feeRecipient);
  console.log('  Backend Verifier:', backendVerifier);
  
  const pitTipping = await PITTippingSimplified.deploy(
    feeRecipient,
    backendVerifier
  );
  
  console.log('⏳ Waiting for deployment...');
  await pitTipping.waitForDeployment();
  
  const contractAddress = await pitTipping.getAddress();
  console.log('✅ PITTippingSimplified deployed to:', contractAddress);
  
  // Verify deployment
  const code = await provider.getCode(contractAddress);
  if (code === '0x') {
    throw new Error('Contract deployment failed - no code at address');
  }
  
  console.log('✅ Contract deployment verified');
  
  // Test contract functions
  try {
    const protocolFee = await pitTipping.protocolFeeBps();
    const backendVerifierAddr = await pitTipping.backendVerifier();
    
    console.log('📊 Contract verification:');
    console.log('  Protocol Fee:', protocolFee.toString(), 'bps');
    console.log('  Backend Verifier:', backendVerifierAddr);
    
  } catch (error) {
    console.warn('⚠️ Could not verify contract functions:', error.message);
  }
  
  console.log('\n🎉 Deployment complete!');
  console.log('📝 Next steps:');
  console.log('1. Update CONTRACT_ADDRESS in your .env file:', contractAddress);
  console.log('2. Update frontend contract address in src/utils/contracts.ts');
  console.log('3. Start your backend server');
  console.log('4. Configure Neynar webhook to point to your backend');
  
  return contractAddress;
}

main()
  .then((address) => {
    console.log('✅ Deployment successful:', address);
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Deployment failed:', error);
    process.exit(1);
  });