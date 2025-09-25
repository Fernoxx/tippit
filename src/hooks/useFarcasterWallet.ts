import { useState, useEffect } from 'react';
import toast from 'react-hot-toast';

export const useFarcasterWallet = () => {
  const [sdkInstance, setSdkInstance] = useState<any>(null);
  const [isInFarcaster, setIsInFarcaster] = useState(false);
  const [userProfile, setUserProfile] = useState<any>(null);
  const [isInitialized, setIsInitialized] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [address, setAddress] = useState<string | null>(null);

  // Initialize Farcaster SDK FIRST - this is critical
  const initFarcaster = async () => {
    try {
      const { sdk } = await import('@farcaster/miniapp-sdk');
      console.log('Farcaster SDK loaded:', !!sdk);
      
      // Check if we're in a miniapp environment
      const isInMiniApp = await sdk.isInMiniApp();
      console.log('Is in Farcaster miniapp:', isInMiniApp);
      
      if (isInMiniApp) {
        // MUST call ready() first to dismiss splash screen
        await sdk.actions.ready();
        console.log('SDK ready() called');
        
        // Get user context
        const context = await sdk.context;
        console.log('Farcaster context:', context);
        
        if (context?.user) {
          setUserProfile(context.user);
          setIsInFarcaster(true);
          console.log('User profile set:', context.user);
        }
        
        setSdkInstance(sdk);
      } else {
        console.log('Not in Farcaster miniapp - using fallback mode');
        // For development/testing - create a mock user
        setUserProfile({
          fid: 12345,
          username: 'testuser',
          displayName: 'Test User',
          pfpUrl: '',
          verifiedAddresses: { ethAddresses: [] }
        });
        setIsInFarcaster(false);
      }
      
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
      console.log('Attempting to connect wallet...');
      console.log('isInFarcaster:', isInFarcaster);
      console.log('sdkInstance:', !!sdkInstance);
      
      // Check if we're in Farcaster environment
      if (!isInFarcaster || !sdkInstance) {
        console.log('Not in Farcaster miniapp - showing development message');
        toast.error('This app works best in Farcaster mobile app. For testing, you can use it in development mode.');
        return;
      }
      
      // Use Farcaster SDK signIn action
      console.log('Calling sdk.actions.signIn...');
      const signInResult = await sdkInstance.actions.signIn();
      console.log('Sign in result:', signInResult);
      
      if (signInResult && signInResult.address) {
        setAddress(signInResult.address);
        setIsConnected(true);
        toast.success('Wallet connected successfully!');
        console.log('Wallet connected with address:', signInResult.address);
      } else {
        throw new Error('Sign in failed - no address returned');
      }
      
      return signInResult;
    } catch (error: any) {
      console.error('Wallet connection failed:', error);
      
      // User-friendly error messages
      if (error.message?.includes('User rejected') || error.message?.includes('cancelled')) {
        toast.error('Connection cancelled by user');
      } else if (error.message?.includes('Farcaster mobile app')) {
        toast.error('Please open this app in Farcaster mobile app');
      } else if (error.message?.includes('Sign in failed')) {
        toast.error('Failed to sign in with wallet');
      } else {
        toast.error('Failed to connect wallet: ' + error.message);
      }
      
      throw error;
    }
  };

  const disconnectWallet = async () => {
    try {
      setAddress(null);
      setIsConnected(false);
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