import { useEffect, useState } from 'react';
import { useNeynar } from '@/hooks/useNeynar';
import { useFarcasterMiniapp } from '@/hooks/useFarcasterMiniapp';
import toast from 'react-hot-toast';
import { User, CheckCircle, XCircle } from 'lucide-react';

export default function FarcasterAuth() {
  // Address will be handled by Farcaster miniapp context
  const { user, isLoading: isLoadingNeynar } = useNeynar();
  const { currentUser, isLoading: isLoadingMiniapp, isMiniapp } = useFarcasterMiniapp();
  const [isConnecting, setIsConnecting] = useState(false);

  // Use miniapp user if available, otherwise use Neynar user
  const displayUser = currentUser || user;

  // Backend-only system - no contract mapping needed
  // FID mapping is handled automatically by the backend

  const connectFarcaster = async () => {
    setIsConnecting(true);
    try {
      // Check if backend is available
      const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL;
      
      if (backendUrl) {
        // Use backend for Neynar sign-in
        const response = await fetch(`${backendUrl}/api/neynar/auth-url`);
        const data = await response.json();
        
        window.open(
          data.authUrl,
          'farcaster-signin',
          'width=500,height=700'
        );
        
        // Listen for callback
        window.addEventListener('message', (event) => {
          if (event.origin === window.location.origin && event.data.type === 'farcaster-auth-success') {
            toast.success('Farcaster account connected!');
            window.location.reload();
          }
        });
      } else {
        // Fallback: Direct Neynar sign-in (for development)
        const neynarApiKey = process.env.NEXT_PUBLIC_NEYNAR_API_KEY;
        if (neynarApiKey) {
          const authUrl = `https://app.neynar.com/signin?api_key=${neynarApiKey}&redirect_uri=${encodeURIComponent(window.location.origin)}`;
          window.open(authUrl, 'farcaster-signin', 'width=500,height=700');
        } else {
          toast.error('Backend not configured. Please set up the backend first.');
        }
      }
    } catch (error) {
      console.error('Farcaster connection error:', error);
      toast.error('Failed to connect Farcaster');
    } finally {
      setIsConnecting(false);
    }
  };

  // No disconnect needed - based on wallet connection

  // Always show the auth component

  const isLoading = isLoadingNeynar || isLoadingMiniapp || isConnecting;

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-4">
      <h3 className="text-sm font-medium text-gray-900 mb-3">
        Farcaster Connection
      </h3>
      
      {displayUser ? (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              {(displayUser as any).pfp?.url || (displayUser as any).pfpUrl ? (
                <img
                  src={(displayUser as any).pfp?.url || (displayUser as any).pfpUrl}
                  alt={displayUser.displayName}
                  className="w-12 h-12 rounded-full"
                />
              ) : (
                <div className="w-12 h-12 bg-accent rounded-full flex items-center justify-center text-white font-bold">
                  {displayUser.displayName[0]}
                </div>
              )}
              <div>
                <p className="font-semibold">{displayUser.displayName}</p>
                <p className="text-sm text-gray-600">@{displayUser.username}</p>
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
              <p className="font-mono font-semibold">{displayUser.fid}</p>
            </div>
            <div>
              <p className="text-sm text-gray-600">Connected</p>
              <p className="text-sm font-medium text-green-600">
                {isMiniapp ? 'via Farcaster' : 'via Neynar'}
              </p>
            </div>
          </div>
        </div>
      ) : (
        <div className="text-center py-4">
          <p className="text-gray-600 mb-4">
            Connect your Farcaster account to start earning tips
          </p>
          <button
            onClick={connectFarcaster}
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