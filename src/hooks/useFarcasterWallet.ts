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
      console.log('Starting Farcaster SDK initialization...');
      
      // Import SDK
      const { sdk } = await import('@farcaster/miniapp-sdk');
      console.log('Farcaster SDK imported:', !!sdk);
      console.log('SDK structure:', {
        hasActions: !!sdk.actions,
        hasContext: !!sdk.context,
        hasIsInMiniApp: !!sdk.isInMiniApp,
        actionsKeys: sdk.actions ? Object.keys(sdk.actions) : 'no actions'
      });
      
      // Set SDK instance
      setSdkInstance(sdk);
      
      // Check if we're in a miniapp environment
      const isInMiniApp = await sdk.isInMiniApp();
      console.log('Is in Farcaster miniapp:', isInMiniApp);
      
      // Wait a bit for SDK to be fully ready
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Call ready() - this is critical for proper initialization
      if (sdk.actions && sdk.actions.ready) {
        try {
          await sdk.actions.ready();
          console.log('SDK ready() called successfully');
        } catch (readyError) {
          console.log('SDK ready() error:', readyError);
          // Don't fail initialization if ready() fails
        }
      } else {
        console.log('SDK actions.ready not available');
      }
      
      // Try to get user context
      if (sdk.context) {
        try {
          const context = await sdk.context;
          console.log('Farcaster context:', context);
          
          if (context?.user) {
            setUserProfile(context.user);
            setIsInFarcaster(true);
            console.log('User profile set:', context.user);
          } else {
            console.log('No user in context');
          }
        } catch (contextError) {
          console.log('Context error:', contextError);
        }
      }
      
      // Set as initialized
      setIsInitialized(true);
      console.log('SDK initialization complete');
      
    } catch (error) {
      console.error('Farcaster SDK initialization failed:', error);
      console.error('Error details:', {
        message: error.message,
        stack: error.stack,
        name: error.name
      });
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
      console.log('sdkInstance.actions:', sdkInstance?.actions);
      
      // Check if SDK is available
      if (!sdkInstance) {
        console.log('SDK not available');
        toast.error('Farcaster SDK not loaded');
        return;
      }
      
      // Check if actions are available
      if (!sdkInstance.actions) {
        console.log('SDK actions not available');
        toast.error('Farcaster SDK actions not available');
        return;
      }
      
      // Use Farcaster SDK signIn action
      console.log('Calling sdk.actions.signIn...');
      console.log('signIn function:', sdkInstance.actions.signIn);
      
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
      console.error('Error details:', {
        message: error.message,
        stack: error.stack,
        name: error.name
      });
      
      // User-friendly error messages
      if (error.message?.includes('User rejected') || error.message?.includes('cancelled')) {
        toast.error('Connection cancelled by user');
      } else if (error.message?.includes('nonce')) {
        toast.error('SDK initialization error - please refresh and try again');
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