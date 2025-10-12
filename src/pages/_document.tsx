import { Html, Head, Main, NextScript } from 'next/document';

export default function Document() {
  return (
    <Html lang="en">
      <Head>
        {/* Basic Meta Tags */}
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="theme-color" content="#fef3c7" />
        
        {/* Open Graph Meta Tags */}
        <meta property="og:type" content="website" />
        <meta property="og:title" content="Ecion – Tip Your Audience" />
        <meta property="og:description" content="With Ecion you can boost your casts by tipping engagers for their interactions easily." />
        <meta property="og:image" content="https://ecion.vercel.app/og-image.png" />
        <meta property="og:image:width" content="1200" />
        <meta property="og:image:height" content="630" />
        <meta property="og:image:alt" content="Ecion - Tip Your Audience" />
        <meta property="og:url" content="https://ecion.vercel.app" />
        <meta property="og:site_name" content="Ecion" />
        
        {/* Twitter Card Meta Tags */}
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content="Ecion – Tip Your Audience" />
        <meta name="twitter:description" content="With Ecion you can boost your casts by tipping engagers for their interactions easily." />
        <meta name="twitter:image" content="https://ecion.vercel.app/og-image.png" />
        <meta name="twitter:image:alt" content="Ecion - Tip Your Audience" />
        
        {/* Farcaster Meta Tags */}
        <meta property="fc:frame" content="vNext" />
        <meta property="fc:frame:image" content="https://ecion.vercel.app/image.png" />
        <meta property="fc:frame:button:1" content="Start Tipping" />
        <meta property="fc:frame:button:1:action" content="link" />
        <meta property="fc:frame:button:1:target" content="https://ecion.vercel.app" />
        
        {/* Additional Meta Tags */}
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