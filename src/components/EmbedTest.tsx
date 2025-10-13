import React from 'react';
import { useFarcasterEmbed } from '@/hooks/useFarcasterEmbed';

const EmbedTest: React.FC = () => {
  const { isPresent, isValid, isLoading, handleShare } = useFarcasterEmbed();

  const testShare = async () => {
    const shareText = "Testing embed functionality from Ecion! 🚀";
    const shareUrl = "https://ecion.vercel.app";
    
    const result = await handleShare(shareText, shareUrl);
    console.log('📤 Share result:', result);
  };

  if (isLoading) {
    return (
      <div className="p-4 bg-gray-100 rounded-lg">
        <div className="text-sm text-gray-600">Checking embed functionality...</div>
      </div>
    );
  }

  return (
    <div className="p-4 bg-white border border-gray-200 rounded-lg">
      <h3 className="text-lg font-semibold mb-3">Embed Status</h3>
      
      <div className="space-y-2 mb-4">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium">Embed Present:</span>
          <span className={`text-sm font-bold ${isPresent ? 'text-green-600' : 'text-red-600'}`}>
            {isPresent ? '✅ Yes' : '❌ No'}
          </span>
        </div>
        
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium">Embed Valid:</span>
          <span className={`text-sm font-bold ${isValid ? 'text-green-600' : 'text-red-600'}`}>
            {isValid ? '✅ Yes' : '❌ No'}
          </span>
        </div>
      </div>
      
      <button 
        onClick={testShare} 
        disabled={!isPresent || !isValid}
        className={`w-full py-2 px-4 rounded-md text-sm font-medium transition-colors ${
          isPresent && isValid
            ? 'bg-blue-600 text-white hover:bg-blue-700'
            : 'bg-gray-300 text-gray-500 cursor-not-allowed'
        }`}
      >
        {isPresent && isValid ? 'Test Share with Embed' : 'Embeds Not Available'}
      </button>
      
      {!isPresent && (
        <div className="mt-2 text-xs text-red-600">
          Make sure you're running this in a Farcaster miniapp
        </div>
      )}
    </div>
  );
};

export default EmbedTest;