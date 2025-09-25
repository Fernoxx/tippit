import { createClient, configureChains } from 'wagmi'
import { base } from 'wagmi/chains'
import { publicProvider } from 'wagmi/providers/public'
import { farcasterMiniApp } from '@farcaster/miniapp-wagmi-connector'

const { chains, provider, webSocketProvider } = configureChains(
  [base],
  [publicProvider()]
)

export const wagmiConfig = createClient({
  autoConnect: true,
  connectors: [
    farcasterMiniApp({
      chains,
    })
  ],
  provider,
  webSocketProvider,
})