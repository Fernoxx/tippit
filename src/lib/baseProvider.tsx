// Base App (Coinbase) compatible provider
import { OnchainKitProvider } from '@coinbase/onchainkit';
import { ReactNode } from 'react';
import { base } from 'wagmi/chains';

interface BaseProviderProps {
  children: ReactNode;
}

export function BaseProvider({ children }: BaseProviderProps) {
  return (
    <OnchainKitProvider
      apiKey={process.env.NEXT_PUBLIC_ONCHAINKIT_API_KEY || 'demo-key'}
      chain={base}
      config={{
        appearance: {
          mode: 'auto',
          theme: 'default',
          name: 'Ecion Tipping',
          logo: 'https://ecion.vercel.app/icon.png',
        },
      }}
      miniKit={{
        enabled: true
      }}
    >
      {children}
    </OnchainKitProvider>
  );
}