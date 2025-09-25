import { useConnect, useAccount, useDisconnect } from 'wagmi';
import { useState, useEffect } from 'react';
import toast from 'react-hot-toast';

export const useFarcasterWallet = () => {
  const { connect, connectors, isPending } = useConnect();
  const { address, isConnected } = useAccount();
  const { disconnect } = useDisconnect();
  
  const [isInFarcaster, setIsInFarcaster] = useState(false);
  const [userProfile, setUserProfile] = useState<any>(null);

  // Check if we're in Farcaster miniapp
  useEffect(() => {
    const checkFarcaster = async () => {
      try {
        const { sdk } = await import('@farcaster/miniapp-sdk');
        const isMini = await sdk.isInMiniApp();
        setIsInFarcaster(isMini);
        
        if (isMini) {
          // Get user context if in miniapp
          try {
            const context = await sdk.context;
            if (context?.user) {
              setUserProfile(context.user);
            }
          } catch (e) {
            console.log('Could not get user context:', e);
          }
        }
      } catch (e) {
        console.log('Not in Farcaster miniapp');
        setIsInFarcaster(false);
      }
    };
    
    checkFarcaster();
  }, []);

  // Connect with Farcaster
  const connectWallet = async () => {
    try {
      console.log('Attempting to connect Farcaster wallet...');
      const farcasterConnector = connectors.find(c => c.id === 'farcaster');
      
      if (farcasterConnector) {
        await connect({ connector: farcasterConnector });
        console.log('✅ Connected to Farcaster wallet');
        toast.success('Wallet connected successfully!');
      } else {
        throw new Error('Farcaster connector not found');
      }
    } catch (error: any) {
      console.error('❌ Farcaster connection failed:', error);
      
      // User-friendly error messages
      if (error.message?.includes('User rejected') || error.message?.includes('cancelled')) {
        toast.error('Connection cancelled by user');
      } else if (error.message?.includes('Farcaster mobile app')) {
        toast.error('Please open this app in Farcaster mobile app');
      } else {
        toast.error('Failed to connect wallet: ' + error.message);
      }
      
      throw error;
    }
  };

  // Disconnect wallet
  const disconnectWallet = async () => {
    try {
      await disconnect();
      setUserProfile(null);
      toast.success('Wallet disconnected');
    } catch (error) {
      console.error('Disconnect error:', error);
      toast.error('Failed to disconnect wallet');
    }
  };

  // Auto-connect if in Farcaster miniapp
  useEffect(() => {
    const autoConnect = async () => {
      try {
        const { sdk } = await import('@farcaster/miniapp-sdk');
        const isMini = await sdk.isInMiniApp();
        if (isMini && !isConnected) {
          console.log('Auto-connecting to Farcaster...');
          connectWallet();
        }
      } catch (e) {
        // Not in miniapp, ignore
      }
    };
    
    if (isInFarcaster && !isConnected) {
      autoConnect();
    }
  }, [isInFarcaster, isConnected]);

  return {
    isInFarcaster,
    userProfile,
    isConnected,
    address,
    connectWallet,
    disconnectWallet,
    isPending,
    isLoading: isPending,
    currentUser: userProfile,
    isMiniapp: isInFarcaster
  };
};