import { createConfig, http } from 'wagmi'
import { base } from 'wagmi/chains'
import { farcasterMiniApp } from '@farcaster/miniapp-wagmi-connector'

// Multiple Base RPC endpoints for reliability
const BASE_RPC_URLS = [
  'https://mainnet.base.org',
  'https://base.blockpi.network/v1/rpc/public',
  'https://base-rpc.publicnode.com',
]

export const wagmiConfig = createConfig({
  chains: [base],
  connectors: [
    farcasterMiniApp({
      chains: [base],
    })
  ],
  transports: {
    [base.id]: http(BASE_RPC_URLS[0]),
  },
})