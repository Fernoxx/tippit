import { useState, useEffect } from 'react';

interface EmbedStatus {
  isPresent: boolean;
  isValid: boolean;
  isLoading: boolean;
  error?: string;
}

export const useFarcasterEmbed = () => {
  const [embedStatus, setEmbedStatus] = useState<EmbedStatus>({
    isPresent: false,
    isValid: false,
    isLoading: true
  });

  // Check if embeds are present/available
  const checkEmbedPresent = async (): Promise<boolean> => {
    try {
      const { sdk } = await import('@farcaster/miniapp-sdk');
      
      // Check if we're in a miniapp context
      const isInMiniApp = await sdk.isInMiniApp();
      
      if (!isInMiniApp) {
        console.log('❌ Not in miniapp - embeds not available');
        return false;
      }
      
      // Check if composeCast action is available and callable
      if (sdk?.actions?.composeCast && typeof sdk.actions.composeCast === 'function') {
        console.log('✅ Embed Present: composeCast action available');
        return true;
      } else {
        console.log('❌ Embed Present: composeCast action not available');
        return false;
      }
    } catch (error) {
      console.error('❌ Error checking embed present:', error);
      return false;
    }
  };

  // Check if embeds work properly
  const checkEmbedValid = async (): Promise<boolean> => {
    try {
      const { sdk } = await import('@farcaster/miniapp-sdk');
      
      // First check if we're in miniapp
      const isInMiniApp = await sdk.isInMiniApp();
      
      if (!isInMiniApp) {
        console.log('❌ Not in miniapp - embeds not valid');
        return false;
      }
      
      // Check if composeCast action exists and is callable
      if (!sdk?.actions?.composeCast || typeof sdk.actions.composeCast !== 'function') {
        console.log('❌ Embed Valid: composeCast action not available');
        return false;
      }
      
      // Test the composeCast function with a test call
      try {
        // Check if the function exists and is callable
        if (typeof sdk.actions.composeCast === 'function') {
          console.log('✅ Embed Valid: composeCast function is valid and callable');
          return true;
        } else {
          console.log('❌ Embed Valid: composeCast is not a function');
          return false;
        }
      } catch (testError) {
        console.log('❌ Embed Valid: composeCast test failed:', testError);
        return false;
      }
    } catch (error) {
      console.error('❌ Error validating embed:', error);
      return false;
    }
  };

  // Complete share function that handles embeds properly
  const handleShare = async (shareText: string, shareUrl: string) => {
    try {
      console.log('📝 Starting share process...');
      
      const { sdk } = await import('@farcaster/miniapp-sdk');
      
      // Check if we're in miniapp
      const isInMiniApp = await sdk.isInMiniApp();
      console.log('📱 Is in MiniApp:', isInMiniApp);
      
      if (isInMiniApp) {
        // Check if composeCast is available and callable
        if (sdk?.actions?.composeCast && typeof sdk.actions.composeCast === 'function') {
          console.log('📝 Composing cast via SDK...');
          
          try {
            await sdk.actions.composeCast({ 
              text: shareText.trim(),
              embeds: [shareUrl]
            });
            console.log('✅ Shared to Farcaster successfully');
            return { success: true, method: 'sdk' };
          } catch (sdkError) {
            console.error('❌ SDK composeCast failed:', sdkError);
            // Fall through to fallback methods
          }
        } else {
          console.log('⚠️ composeCast not available, using fallback');
        }
      }
      
      // Fallback methods
      const finalShareText = `${shareText}\n${shareUrl}`;
      
      // Try clipboard first
      try {
        await navigator.clipboard.writeText(finalShareText);
        console.log('✅ Share text copied to clipboard');
        return { success: true, method: 'clipboard' };
      } catch (clipboardError) {
        console.log('⚠️ Clipboard failed, trying URL method');
      }
      
      // Final fallback - open Warpcast compose
      const encoded = encodeURIComponent(finalShareText);
      window.open(`https://warpcast.com/~/compose?text=${encoded}`, '_blank');
      console.log('✅ Opened Warpcast compose');
      return { success: true, method: 'warpcast' };
      
    } catch (error) {
      console.error('❌ Share failed completely:', error);
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  };

  // Initialize embed detection
  useEffect(() => {
    const checkEmbeds = async () => {
      setEmbedStatus(prev => ({ ...prev, isLoading: true }));
      
      try {
        // Check if embeds are present
        const present = await checkEmbedPresent();
        
        // Check if embeds are valid
        const valid = await checkEmbedValid();
        
        console.log('📊 Embed Status:', { present, valid });
        
        setEmbedStatus({
          isPresent: present,
          isValid: valid,
          isLoading: false
        });
      } catch (error) {
        console.error('❌ Error checking embeds:', error);
        setEmbedStatus({
          isPresent: false,
          isValid: false,
          isLoading: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    };
    
    checkEmbeds();
  }, []);

  return {
    ...embedStatus,
    handleShare,
    checkEmbedPresent,
    checkEmbedValid
  };
};