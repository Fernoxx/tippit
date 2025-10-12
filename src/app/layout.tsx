import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin"] });

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: "Ecion – Tip Your Audience",
    description: "With Ecion you can boost your casts by tipping engagers for their interactions easily.",
    manifest: '/manifest.json',
    viewport: 'width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no',
    themeColor: '#fef3c7',
    colorScheme: 'light',
    keywords: 'tip, tipping, noice, ecion, engage, farcaster, crypto, social, base',
    authors: [{ name: 'Ecion Team' }],
    creator: 'Ecion',
    publisher: 'Ecion',
    openGraph: {
      title: "Ecion – Tip Your Audience",
      description: "With Ecion you can boost your casts by tipping engagers for their interactions easily.",
      images: ["https://ecion.vercel.app/og-image.png"],
      type: 'website',
      url: "https://ecion.vercel.app",
      siteName: "Ecion",
    },
    twitter: {
      card: 'summary_large_image',
      title: "Ecion – Tip Your Audience",
      description: "With Ecion you can boost your casts by tipping engagers for their interactions easily.",
      images: ["https://ecion.vercel.app/og-image.png"],
      creator: '@ecion_app',
      site: '@ecion_app',
    },
    other: {
      // Farcaster Miniapp metadata
      "fc:miniapp": JSON.stringify({
        version: "1",
        imageUrl: "https://ecion.vercel.app/image.png",
        button: {
          title: "Start Tipping",
          action: {
            type: "launch_miniapp",
            url: "https://ecion.vercel.app",
            name: "Ecion",
            splashImageUrl: "https://ecion.vercel.app/splash.png",
            splashBackgroundColor: "#fef3c7"
          }
        }
      }),
      
      // Additional Farcaster metadata
      "farcaster:miniapp:url": "https://ecion.vercel.app",
      "farcaster:miniapp:name": "Ecion",
      "farcaster:miniapp:icon": "https://ecion.vercel.app/icon.png",
      "farcaster:miniapp:description": "With Ecion you can boost your casts by tipping engagers for their interactions easily.",
      "farcaster:miniapp:category": "social",
      "farcaster:miniapp:tags": "tip,tipping,noice,ecion,engage",
      
      // Additional required metadata for embed validation
      "robots": "index, follow",
      "referrer": "origin-when-cross-origin",
      "format-detection": "telephone=no",
      
      // Farcaster embed recognition
      "farcaster:embed": "true",
      "farcaster:embed:type": "miniapp",
      "farcaster:embed:url": "https://ecion.vercel.app",
      "farcaster:embed:title": "Ecion – Tip Your Audience",
      "farcaster:embed:description": "With Ecion you can boost your casts by tipping engagers for their interactions easily.",
      "farcaster:embed:image": "https://ecion.vercel.app/og-image.png",
      
      // Additional Farcaster metadata
      "farcaster:app": "Ecion",
      "farcaster:app:version": "1",
      "farcaster:app:category": "social",
      "farcaster:app:tags": "tip,tipping,noice,ecion,engage",
      
      // LinkedIn metadata
      "linkedin:owner": "ecion-app",
      "linkedin:title": "Ecion – Tip Your Audience",
      "linkedin:description": "With Ecion you can boost your casts by tipping engagers for their interactions easily.",
      "linkedin:image": "https://ecion.vercel.app/og-image.png",
    },
  };
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className={inter.className}>
        {children}
      </body>
    </html>
  );
}