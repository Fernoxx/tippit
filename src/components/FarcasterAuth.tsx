import { useFarcasterMiniapp } from '@/hooks/useFarcasterMiniapp';
import { User, CheckCircle, XCircle } from 'lucide-react';

export default function FarcasterAuth() {
  const { 
    currentUser, 
    isLoading, 
    isMiniapp 
  } = useFarcasterMiniapp();

  const handleConnect = async () => {
    // For now, just show a message since we're using SDK directly
    alert('Farcaster connection will be available when running as a miniapp');
  };

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-4">
      <h3 className="text-sm font-medium text-gray-900 mb-3">
        Farcaster Connection
      </h3>
      
      {currentUser ? (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              {currentUser.pfpUrl ? (
                <img
                  src={currentUser.pfpUrl}
                  alt={currentUser.displayName}
                  className="w-12 h-12 rounded-full"
                />
              ) : (
                <div className="w-12 h-12 bg-blue-600 rounded-full flex items-center justify-center text-white font-bold">
                  {currentUser.displayName?.[0] || 'U'}
                </div>
              )}
              <div>
                <p className="font-semibold">{currentUser.displayName || 'Unknown User'}</p>
                <p className="text-sm text-gray-600">@{currentUser.username || 'unknown'}</p>
                {isMiniapp && (
                  <p className="text-xs text-green-600">✓ Farcaster Miniapp</p>
                )}
              </div>
            </div>
            <CheckCircle className="w-6 h-6 text-green-500" />
          </div>
          
          <div className="flex items-center justify-between pt-4 border-t">
            <div>
              <p className="text-sm text-gray-600">FID</p>
              <p className="font-mono font-semibold">{currentUser.fid || 'N/A'}</p>
            </div>
            <div>
              <p className="text-sm text-gray-600">Status</p>
              <p className="text-sm font-medium text-green-600">
                Connected
              </p>
            </div>
          </div>
        </div>
      ) : (
        <div className="text-center py-4">
          <p className="text-gray-600 mb-4">
            Connect your Farcaster wallet to start earning tips
          </p>
          <button
            onClick={handleConnect}
            disabled={isLoading}
            className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors disabled:opacity-50"
          >
            {isLoading ? 'Connecting...' : 'Connect Farcaster'}
          </button>
        </div>
      )}
    </div>
  );
}