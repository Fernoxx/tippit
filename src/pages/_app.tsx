import '@/styles/globals.css';
import type { AppProps } from 'next/app';
import { Toaster } from 'react-hot-toast';
import Layout from '@/components/Layout';

export default function App({ Component, pageProps }: AppProps) {
  return (
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
  );
}