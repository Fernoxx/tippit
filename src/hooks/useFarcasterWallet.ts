import { useState, useEffect } from 'react';
import { useConnect, useAccount, useDisconnect } from 'wagmi';
import toast from 'react-hot-toast';

export const useFarcasterWallet = () => {
  const [sdkInstance, setSdkInstance] = useState<any>(null);
  const [isInFarcaster, setIsInFarcaster] = useState(false);
  const [userProfile, setUserProfile] = useState<any>(null);
  const [isInitialized, setIsInitialized] = useState(false);

  const { connectAsync, connectors } = useConnect();
  const { address, isConnected } = useAccount();
  const { disconnect } = useDisconnect();

  // Initialize Farcaster SDK FIRST - this is critical
  const initFarcaster = async () => {
    try {
      const { sdk } = await import('@farcaster/miniapp-sdk');
      
      // MUST call ready() first to dismiss splash screen
      await sdk.actions.ready();
      
      // Get user context
      const context = await sdk.context;
      
      if (context?.user) {
        setUserProfile(context.user);
        setIsInFarcaster(true);
      }
      
      setSdkInstance(sdk);
      setIsInitialized(true);
    } catch (error) {
      console.error('Farcaster SDK initialization failed:', error);
      setIsInitialized(true);
    }
  };

  useEffect(() => {
    initFarcaster();
  }, []);

  const connectWallet = async () => {
    try {
      // Check if we're in Farcaster environment
      if (!isInFarcaster || !sdkInstance) {
        throw new Error('This miniapp must be used within Farcaster mobile app.');
      }
      
      // Find the Farcaster connector
      const farcasterConnector = connectors.find(connector => 
        connector.id === 'farcasterMiniApp' || 
        connector.id === 'farcaster' ||
        connector.name?.includes('Farcaster')
      );
      
      if (!farcasterConnector) {
        throw new Error('Farcaster connector not found...');
      }
      
      // Connect using wagmi connectAsync
      const result = await connectAsync({ connector: farcasterConnector });
      
      toast.success('Wallet connected successfully!');
      return result;
    } catch (error: any) {
      console.error('Wallet connection failed:', error);
      
      // User-friendly error messages
      if (error.message?.includes('User rejected')) {
        toast.error('Connection cancelled by user');
      } else if (error.message?.includes('Farcaster mobile app')) {
        toast.error('Please open this app in Farcaster mobile app');
      } else if (error.message?.includes('connector not found')) {
        toast.error('Farcaster wallet not available');
      } else {
        toast.error('Failed to connect wallet');
      }
      
      throw error;
    }
  };

  const disconnectWallet = async () => {
    try {
      await disconnect();
      toast.success('Wallet disconnected');
    } catch (error) {
      console.error('Disconnect failed:', error);
      toast.error('Failed to disconnect wallet');
    }
  };

  return {
    // SDK state
    sdkInstance,
    isInFarcaster,
    userProfile,
    isInitialized,
    
    // Wallet state
    address,
    isConnected,
    
    // Actions
    connectWallet,
    disconnectWallet,
    
    // Loading states
    isLoading: !isInitialized,
    
    // User data
    currentUser: userProfile,
    isMiniapp: isInFarcaster
  };
};