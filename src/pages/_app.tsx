import '@/styles/globals.css';
import type { AppProps } from 'next/app';
import { Toaster } from 'react-hot-toast';
import Layout from '@/components/Layout';
import { WagmiProvider, useConnect } from 'wagmi';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { wagmiConfig } from '@/lib/wagmi';
import { useState, useEffect } from 'react';

// Initialize Reown AppKit
import '@/lib/reownConfig';

const queryClient = new QueryClient();

function AutoConnect({ children }: { children: React.ReactNode }) {
  const { connect, connectors } = useConnect();

  useEffect(() => {
    (async () => {
      try {
        const { sdk } = await import('@farcaster/miniapp-sdk');
        const isMini = await sdk.isInMiniApp();
        if (isMini) {
          const mini = connectors.find(c => c.id === 'farcaster');
          if (mini) {
            console.log('⚡ Auto-connecting via Farcaster MiniApp connector');
            connect({ connector: mini });
          }
        }
      } catch (e) {
        // ignore if not in miniapp
        console.log('Not in Farcaster miniapp, skipping auto-connect');
      }
    })();
  }, [connect, connectors]);

  return <>{children}</>;
}

export default function App({ Component, pageProps }: AppProps) {
  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <AutoConnect>
          <Layout>
            <Component {...pageProps} />
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
          </Layout>
        </AutoConnect>
      </QueryClientProvider>
    </WagmiProvider>
  );
}