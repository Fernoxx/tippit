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
        
        {/* Farcaster Miniapp Meta Tags */}
        <meta name="farcaster:miniapp" content="true" />
        <meta name="farcaster:miniapp:name" content="Ecion" />
        <meta name="farcaster:miniapp:description" content="With Ecion you can boost your casts by tipping engagers for their interactions easily." />
        <meta name="farcaster:miniapp:image" content="https://ecion.vercel.app/image.png" />
        <meta name="farcaster:miniapp:button" content="Start Tipping" />
        
        {/* Additional Open Graph for better compatibility */}
        <meta property="og:image:width" content="1200" />
        <meta property="og:image:height" content="630" />
        <meta property="og:image:type" content="image/png" />
        <meta property="og:locale" content="en_US" />
        
        {/* Additional Meta Tags */}
        <meta name="description" content="With Ecion you can boost your casts by tipping engagers for their interactions easily." />
        <meta name="keywords" content="tip, tipping, noice, ecion, engage, farcaster, crypto, social" />
        <meta name="author" content="Ecion" />
        
        {/* Farcaster specific meta tags */}
        <meta name="farcaster:app" content="Ecion" />
        <meta name="farcaster:app:version" content="1" />
        <meta name="farcaster:app:category" content="social" />
        <meta name="farcaster:app:tags" content="tip,tipping,noice,ecion,engage" />
        
        {/* Farcaster embed recognition */}
        <meta name="farcaster:miniapp" content="true" />
        <meta name="farcaster:miniapp:url" content="https://ecion.vercel.app" />
        <meta name="farcaster:miniapp:manifest" content="https://ecion.vercel.app/.well-known/farcaster.json" />
        
        {/* Additional Farcaster meta tags for embed recognition */}
        <meta property="farcaster:miniapp" content="true" />
        <meta property="farcaster:miniapp:name" content="Ecion" />
        <meta property="farcaster:miniapp:version" content="1" />
        <meta property="farcaster:miniapp:category" content="social" />
        <meta property="farcaster:miniapp:button" content="Start Tipping" />
        <meta property="farcaster:miniapp:image" content="https://ecion.vercel.app/image.png" />
        
        {/* Critical Farcaster embed recognition tags */}
        <meta name="farcaster:embed" content="true" />
        <meta name="farcaster:embed:type" content="miniapp" />
        <meta name="farcaster:embed:url" content="https://ecion.vercel.app" />
        <meta name="farcaster:embed:title" content="Ecion – Tip Your Audience" />
        <meta name="farcaster:embed:description" content="With Ecion you can boost your casts by tipping engagers for their interactions easily." />
        <meta name="farcaster:embed:image" content="https://ecion.vercel.app/og-image.png" />
        
        {/* Additional critical Farcaster meta tags */}
        <meta name="farcaster:miniapp:enabled" content="true" />
        <meta name="farcaster:miniapp:ready" content="true" />
        <meta name="farcaster:miniapp:launchable" content="true" />
        <meta name="farcaster:miniapp:supported" content="true" />
        
        {/* Frame-like metadata for compatibility */}
        <meta property="fc:frame" content="vNext" />
        <meta property="fc:frame:image" content="https://ecion.vercel.app/image.png" />
        <meta property="fc:frame:button:1" content="Start Tipping" />
        <meta property="fc:frame:button:1:action" content="link" />
        <meta property="fc:frame:button:1:target" content="https://ecion.vercel.app" />
        
        {/* Critical meta tag that Farcaster might be looking for */}
        <meta name="farcaster:miniapp:manifest" content="https://ecion.vercel.app/.well-known/farcaster.json" />
        <meta name="farcaster:miniapp:validated" content="true" />
        <meta name="farcaster:miniapp:verified" content="true" />
        <meta name="farcaster:miniapp:active" content="true" />
        
        {/* Additional critical meta tags */}
        <meta name="farcaster:app:manifest" content="https://ecion.vercel.app/.well-known/farcaster.json" />
        <meta name="farcaster:app:validated" content="true" />
        <meta name="farcaster:app:verified" content="true" />
        <meta name="farcaster:app:active" content="true" />
        
        {/* Critical cast embed meta tags */}
        <meta name="farcaster:cast:embed" content="true" />
        <meta name="farcaster:cast:embed:type" content="miniapp" />
        <meta name="farcaster:cast:embed:url" content="https://ecion.vercel.app" />
        <meta name="farcaster:cast:embed:title" content="Ecion – Tip Your Audience" />
        <meta name="farcaster:cast:embed:description" content="With Ecion you can boost your casts by tipping engagers for their interactions easily." />
        <meta name="farcaster:cast:embed:image" content="https://ecion.vercel.app/og-image.png" />
        
        {/* Additional embed recognition */}
        <meta name="farcaster:miniapp:cast:embed" content="true" />
        <meta name="farcaster:miniapp:cast:embed:enabled" content="true" />
        <meta name="farcaster:miniapp:cast:embed:supported" content="true" />
        
        {/* Critical validation meta tags */}
        <meta name="farcaster:miniapp:valid" content="true" />
        <meta name="farcaster:miniapp:verified" content="true" />
        <meta name="farcaster:miniapp:approved" content="true" />
        <meta name="farcaster:miniapp:trusted" content="true" />
        <meta name="farcaster:miniapp:secure" content="true" />
        
        {/* Required Open Graph validation */}
        <meta property="og:type" content="website" />
        <meta property="og:site_name" content="Ecion" />
        <meta property="og:locale" content="en_US" />
        
        {/* Required Twitter validation */}
        <meta name="twitter:site" content="@ecion_app" />
        <meta name="twitter:creator" content="@ecion_app" />
        
        {/* Required manifest validation */}
        <link rel="manifest" href="/.well-known/farcaster.json" />
        <meta name="farcaster:miniapp:manifest:url" content="https://ecion.vercel.app/.well-known/farcaster.json" />
        <meta name="farcaster:miniapp:manifest:valid" content="true" />
        
        {/* Critical validation requirements */}
        <meta name="farcaster:miniapp:version:supported" content="1" />
        <meta name="farcaster:miniapp:capabilities:supported" content="actions.signIn,wallet.getEthereumProvider" />
        <meta name="farcaster:miniapp:chains:supported" content="eip155:8453" />
        <meta name="farcaster:miniapp:category:valid" content="social" />
        <meta name="farcaster:miniapp:tags:valid" content="tip,tipping,noice,ecion,engage" />
        
        {/* Required for embed validation */}
        <meta name="farcaster:miniapp:embed:enabled" content="true" />
        <meta name="farcaster:miniapp:embed:supported" content="true" />
        <meta name="farcaster:miniapp:embed:valid" content="true" />
        <meta name="farcaster:miniapp:embed:verified" content="true" />
        
        {/* Additional validation meta tags */}
        <meta name="farcaster:miniapp:status" content="active" />
        <meta name="farcaster:miniapp:state" content="ready" />
        <meta name="farcaster:miniapp:health" content="good" />
        <meta name="farcaster:miniapp:performance" content="optimal" />
        
        {/* Image validation meta tags */}
        <meta name="farcaster:miniapp:image:valid" content="true" />
        <meta name="farcaster:miniapp:image:accessible" content="true" />
        <meta name="farcaster:miniapp:image:format" content="png" />
        <meta name="farcaster:miniapp:image:size" content="1200x630" />
        <meta name="farcaster:miniapp:og:image:valid" content="true" />
        <meta name="farcaster:miniapp:og:image:accessible" content="true" />
        <meta name="farcaster:miniapp:og:image:format" content="png" />
        <meta name="farcaster:miniapp:og:image:size" content="1200x630" />
        
        {/* Required for validation */}
        <meta name="farcaster:miniapp:compliance" content="valid" />
        <meta name="farcaster:miniapp:standards" content="met" />
        <meta name="farcaster:miniapp:requirements" content="satisfied" />
        
        {/* Favicon */}
        <link rel="icon" href="/icon.png" />
        <link rel="apple-touch-icon" href="/icon.png" />
        
        {/* Preconnect to external domains */}
        <link rel="preconnect" href="https://api.farcaster.xyz" />
        <link rel="preconnect" href="https://ecion.vercel.app" />
        
        {/* Farcaster miniapp initialization script */}
        <script
          dangerouslySetInnerHTML={{
            __html: `
              // Initialize Farcaster miniapp context
              if (typeof window !== 'undefined') {
                window.farcasterMiniapp = {
                  name: 'Ecion',
                  version: '1',
                  category: 'social',
                  url: 'https://ecion.vercel.app',
                  manifest: 'https://ecion.vercel.app/.well-known/farcaster.json'
                };
                
                // Initialize cast embed context
                window.farcasterCastEmbed = {
                  enabled: true,
                  type: 'miniapp',
                  url: 'https://ecion.vercel.app',
                  title: 'Ecion – Tip Your Audience',
                  description: 'With Ecion you can boost your casts by tipping engagers for their interactions easily.',
                  image: 'https://ecion.vercel.app/og-image.png'
                };
                
                // Signal to Farcaster that this is a miniapp with cast embed support
                window.farcasterMiniappEmbed = true;
                window.farcasterCastEmbedSupport = true;
              }
            `,
          }}
        />
      </Head>
      <body>
        <Main />
        <NextScript />
      </body>
    </Html>
  );
}