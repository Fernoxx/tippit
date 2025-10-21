// Base App mini app integration
import { useMiniKit } from '@coinbase/onchainkit/minikit';
import { useEffect } from 'react';
import toast from 'react-hot-toast';

export function useBaseMiniApp() {
  const { setFrameReady, isFrameReady, context } = useMiniKit();
  
  // Signal frame readiness
  useEffect(() => {
    if (!isFrameReady) {
      setFrameReady();
    }
  }, [setFrameReady, isFrameReady]);
  
  const addMiniApp = async () => {
    try {
      // For Base App, we need to use the native addMiniApp action
      if (typeof window !== 'undefined' && (window as any).farcaster) {
        await (window as any).farcaster.addMiniApp();
        toast.success('Mini app added successfully! You can now receive notifications.');
      } else {
        toast.error('Mini app client not found. Please use Base App or Farcaster.');
      }
    } catch (error) {
      console.error('Error adding mini app:', error);
      toast.error('Failed to add mini app. Please try again.');
    }
  };
  
  return {
    addMiniApp,
    isFrameReady,
    context
  };
}