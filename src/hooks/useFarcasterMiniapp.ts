import { useState, useEffect } from 'react';

interface FarcasterUser {
  fid: number;
  username: string;
  displayName: string;
  pfpUrl: string;
  verifiedAddresses?: {
    ethAddresses: string[];
  };
}

export const useFarcasterMiniapp = () => {
  const [currentUser, setCurrentUser] = useState<FarcasterUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isMiniapp, setIsMiniapp] = useState(false);

  useEffect(() => {
    const initializeFarcaster = async () => {
      try {
        // Check if we're in a Farcaster miniapp
        if (typeof window !== 'undefined' && window.location.search.includes('farcaster')) {
          setIsMiniapp(true);
          
          // Import Farcaster SDK dynamically
          const { sdk } = await import('@farcaster/miniapp-sdk');
          
          // Get user context
          const context = await sdk.context;
          
          // Extract real user data
          if (context?.user) {
            setCurrentUser({
              fid: context.user.fid,           // Real FID (e.g., 242597)
              username: context.user.username, // Real username (e.g., "ferno")
              displayName: context.user.displayName, // Real name
              pfpUrl: context.user.pfpUrl,     // Profile picture
              verifiedAddresses: {
                ethAddresses: (context.user as any).verifiedAddresses?.ethAddresses || []
              }
            });
          }
          
          // Call ready() to hide loading screen
          await sdk.ready();
        }
      } catch (error) {
        console.error('Farcaster miniapp initialization failed:', error);
      } finally {
        setIsLoading(false);
      }
    };

    initializeFarcaster();
  }, []);

  return {
    currentUser,
    isLoading,
    isMiniapp
  };
};