import '@/styles/globals.css';
import '@rainbow-me/rainbowkit/styles.css';
import type { AppProps } from 'next/app';
import { RainbowKitProvider, getDefaultWallets } from '@rainbow-me/rainbowkit';
import { configureChains, createConfig, WagmiConfig } from 'wagmi';
import { base } from 'wagmi/chains';
import { publicProvider } from 'wagmi/providers/public';
import { Toaster } from 'react-hot-toast';
import Layout from '@/components/Layout';

const { chains, publicClient } = configureChains([base], [publicProvider()]);

const { connectors } = getDefaultWallets({
  appName: 'PIT - Post Incentive Tipping',
  projectId: 'YOUR_PROJECT_ID', // Get from WalletConnect
  chains,
});

const wagmiConfig = createConfig({
  autoConnect: true,
  connectors,
  publicClient,
});

export default function App({ Component, pageProps }: AppProps) {
  return (
    <WagmiConfig config={wagmiConfig}>
      <RainbowKitProvider chains={chains}>
        <Layout>
          <Component {...pageProps} />
        </Layout>
        <Toaster
          position="bottom-right"
          toastOptions={{
            style: {
              background: '#4169E1',
              color: '#fff',
              borderRadius: '12px',
              padding: '16px',
            },
          }}
        />
      </RainbowKitProvider>
    </WagmiConfig>
  );
}