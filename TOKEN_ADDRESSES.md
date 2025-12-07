# Token Addresses for Daily Rewards Contracts

## Token Addresses

### Base Chain (8453)
- **ECION**: Already deployed (existing contract)
- **USDC**: `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913`

### CELO Chain (42220)
- **ECION**: Not available (ECION is Base-only)
- **CELO**: `0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee` (Native CELO)
  - Note: This is the sentinel address for native CELO. Native tokens may need special handling in the contract.

### Arbitrum Chain (42161)
- **ECION**: Not available (ECION is Base-only)
- **ARB**: `0xb50721bcf8d664c30412cfbc6cf7a15145234ad1` (ARB token)

## Important Notes

1. **ECION is Base-only**: ECION token only exists on Base chain. CELO and ARB chains will only distribute their respective native tokens (CELO and ARB).

2. **Native CELO**: The address `0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee` is a sentinel value. For native CELO, you may need to:
   - Use `address(0)` or handle native transfers differently
   - Or use wrapped CELO (cCELO) if available
   - Check CELO's actual native token handling in your contract

3. **Contract Deployment**: When deploying `EcionDailyRewardsV2.sol`:
   - **Base**: Deploy with ECION and USDC token addresses
   - **CELO**: Deploy with CELO token address (may need special handling for native)
   - **Arbitrum**: Deploy with ARB token address

4. **Token Decimals**:
   - ECION: 18 decimals
   - USDC: 6 decimals
   - CELO: 18 decimals (native)
   - ARB: 18 decimals
