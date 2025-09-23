import { useEffect, useState } from 'react';
import { useAccount } from 'wagmi';
import { useContractWrite } from 'wagmi';
import { CONTRACTS } from '@/utils/contracts';
import { useNeynar } from '@/hooks/useNeynar';
import toast from 'react-hot-toast';
import { User, CheckCircle, XCircle } from 'lucide-react';

export default function FarcasterAuth() {
  const { address } = useAccount();
  const { user, isLoading: isLoadingNeynar } = useNeynar();
  const [isConnecting, setIsConnecting] = useState(false);

  // Map FID to address in oracle contract
  const { write: mapFID } = useContractWrite({
    address: CONTRACTS.FarcasterOracle.address as `0x${string}`,
    abi: CONTRACTS.FarcasterOracle.abi,
    functionName: 'mapFIDToAddress',
  });

  // Auto-map FID when user data is loaded
  useEffect(() => {
    if (user && address && mapFID) {
      mapFID({
        args: [user.fid, address],
      });
    }
  }, [user, address, mapFID]);

  const connectFarcaster = async () => {
    setIsConnecting(true);
    try {
      // Open Neynar sign-in flow
      window.open(
        `https://neynar.com/sign-in?api_key=${process.env.NEXT_PUBLIC_NEYNAR_API_KEY}&redirect_url=${window.location.origin}/api/auth/callback`,
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
    } catch (error) {
      toast.error('Failed to connect Farcaster');
    } finally {
      setIsConnecting(false);
    }
  };

  // No disconnect needed - based on wallet connection

  if (!address) return null;

  const isLoading = isLoadingNeynar || isConnecting;

  return (
    <div className="bg-white rounded-2xl p-6 card-shadow">
      <h3 className="text-xl font-bold text-accent mb-4 flex items-center">
        <User className="w-6 h-6 mr-2" />
        Farcaster Connection
      </h3>
      
      {user ? (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              {user.pfp?.url ? (
                <img
                  src={user.pfp.url}
                  alt={user.displayName}
                  className="w-12 h-12 rounded-full"
                />
              ) : (
                <div className="w-12 h-12 bg-accent rounded-full flex items-center justify-center text-white font-bold">
                  {user.displayName[0]}
                </div>
              )}
              <div>
                <p className="font-semibold">{user.displayName}</p>
                <p className="text-sm text-gray-600">@{user.username}</p>
              </div>
            </div>
            <CheckCircle className="w-6 h-6 text-green-500" />
          </div>
          
          <div className="flex items-center justify-between pt-4 border-t">
            <div>
              <p className="text-sm text-gray-600">FID</p>
              <p className="font-mono font-semibold">{user.fid}</p>
            </div>
            <div>
              <p className="text-sm text-gray-600">Connected</p>
              <p className="text-sm font-medium text-green-600">via Neynar</p>
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
            className="btn-primary"
          >
            {isLoading ? 'Connecting...' : 'Connect Farcaster'}
          </button>
        </div>
      )}
    </div>
  );
}