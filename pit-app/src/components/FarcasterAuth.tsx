import { useEffect, useState } from 'react';
import { useAccount } from 'wagmi';
import { useContractWrite } from 'wagmi';
import { CONTRACTS } from '@/utils/contracts';
import toast from 'react-hot-toast';
import { User, CheckCircle, XCircle } from 'lucide-react';

interface FarcasterProfile {
  fid: number;
  username: string;
  displayName: string;
  pfp?: string;
}

export default function FarcasterAuth() {
  const { address } = useAccount();
  const [profile, setProfile] = useState<FarcasterProfile | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  // Map FID to address in oracle contract
  const { write: mapFID } = useContractWrite({
    address: CONTRACTS.FarcasterOracle.address as `0x${string}`,
    abi: CONTRACTS.FarcasterOracle.abi,
    functionName: 'mapFIDToAddress',
  });

  const connectFarcaster = async () => {
    setIsLoading(true);
    try {
      // In production, this would open Farcaster auth flow
      // For now, we'll simulate it
      const mockProfile: FarcasterProfile = {
        fid: Math.floor(Math.random() * 100000),
        username: 'testuser',
        displayName: 'Test User',
      };
      
      setProfile(mockProfile);
      
      // Map FID to Ethereum address
      await mapFID?.({
        args: [mockProfile.fid, address],
      });
      
      toast.success('Farcaster account connected!');
    } catch (error) {
      toast.error('Failed to connect Farcaster');
    } finally {
      setIsLoading(false);
    }
  };

  const disconnectFarcaster = () => {
    setProfile(null);
    toast.success('Farcaster account disconnected');
  };

  if (!address) return null;

  return (
    <div className="bg-white rounded-2xl p-6 card-shadow">
      <h3 className="text-xl font-bold text-accent mb-4 flex items-center">
        <User className="w-6 h-6 mr-2" />
        Farcaster Connection
      </h3>
      
      {profile ? (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              {profile.pfp ? (
                <img
                  src={profile.pfp}
                  alt={profile.displayName}
                  className="w-12 h-12 rounded-full"
                />
              ) : (
                <div className="w-12 h-12 bg-accent rounded-full flex items-center justify-center text-white font-bold">
                  {profile.displayName[0]}
                </div>
              )}
              <div>
                <p className="font-semibold">{profile.displayName}</p>
                <p className="text-sm text-gray-600">@{profile.username}</p>
              </div>
            </div>
            <CheckCircle className="w-6 h-6 text-green-500" />
          </div>
          
          <div className="flex items-center justify-between pt-4 border-t">
            <div>
              <p className="text-sm text-gray-600">FID</p>
              <p className="font-mono font-semibold">{profile.fid}</p>
            </div>
            <button
              onClick={disconnectFarcaster}
              className="text-red-600 hover:text-red-700 font-medium"
            >
              Disconnect
            </button>
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