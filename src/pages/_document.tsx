import { Html, Head, Main, NextScript } from 'next/document';

export default function Document() {
  return (
    <Html lang="en">
      <Head>
        {/* Basic Meta Tags */}
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="theme-color" content="#fef3c7" />
        
        {/* Essential Open Graph Meta Tags */}
        <meta property="og:type" content="website" />
        <meta property="og:title" content="Ecion – Tip Your Audience" />
        <meta property="og:description" content="With Ecion you can boost your casts by tipping engagers for their interactions easily." />
        <meta property="og:image" content="https://ecion.vercel.app/og-image.png" />
        <meta property="og:url" content="https://ecion.vercel.app" />
        <meta property="og:site_name" content="Ecion" />
        
        {/* Essential Twitter Card Meta Tags */}
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content="Ecion – Tip Your Audience" />
        <meta name="twitter:description" content="With Ecion you can boost your casts by tipping engagers for their interactions easily." />
        <meta name="twitter:image" content="https://ecion.vercel.app/og-image.png" />
        
        {/* ESSENTIAL Farcaster Miniapp Meta Tags - SIMPLIFIED */}
        <meta name="farcaster:miniapp" content="true" />
        <meta name="farcaster:miniapp:name" content="Ecion" />
        <meta name="farcaster:miniapp:url" content="https://ecion.vercel.app" />
        <meta name="farcaster:miniapp:image" content="https://ecion.vercel.app/image.png" />
        <meta name="farcaster:miniapp:button" content="Start Tipping" />
        <meta name="farcaster:miniapp:description" content="With Ecion you can boost your casts by tipping engagers for their interactions easily." />
        <meta name="farcaster:miniapp:manifest" content="https://ecion.vercel.app/.well-known/farcaster.json" />
        
        {/* Basic Meta Tags */}
        <meta name="description" content="With Ecion you can boost your casts by tipping engagers for their interactions easily." />
        <meta name="keywords" content="tip, tipping, noice, ecion, engage, farcaster, crypto, social" />
        <meta name="author" content="Ecion" />
        
        {/* Favicon */}
        <link rel="icon" href="/icon.png" />
        <link rel="apple-touch-icon" href="/icon.png" />
        
        {/* Preconnect to external domains */}
        <link rel="preconnect" href="https://api.farcaster.xyz" />
        <link rel="preconnect" href="https://ecion.vercel.app" />
      </Head>
      <body>
        <Main />
        <NextScript />
      </body>
    </Html>
  );
}