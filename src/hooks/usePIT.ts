import { useState, useEffect } from 'react';
import { useFarcasterWallet } from './useFarcasterWallet';
import { toast } from 'react-hot-toast';
import { useWriteContract, useReadContract, useWaitForTransactionReceipt } from 'wagmi';
import { parseUnits, formatUnits } from 'viem';

const BACKEND_URL = (process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:3001').replace(/\/$/, '');

// Fetch backend wallet address dynamically
let BACKEND_WALLET_ADDRESS = '0x0000000000000000000000000000000000000000';

const fetchBackendWalletAddress = async () => {
  try {
    const response = await fetch(`${BACKEND_URL}/api/backend-wallet`);
    if (response.ok) {
      const data = await response.json();
      BACKEND_WALLET_ADDRESS = data.address;
      console.log('✅ Backend wallet address loaded:', BACKEND_WALLET_ADDRESS);
      return data.address;
    }
  } catch (error) {
    console.error('Failed to fetch backend wallet address:', error);
  }
  return BACKEND_WALLET_ADDRESS;
};

interface UserConfig {
  tokenAddress: string;
  likeAmount: string;
  replyAmount: string;
  recastAmount: string;
  quoteAmount: string;
  followAmount: string;
  spendingLimit: string;
  audience: number;
  minFollowerCount: number;
  minNeynarScore: number;
  likeEnabled: boolean;
  replyEnabled: boolean;
  recastEnabled: boolean;
  quoteEnabled: boolean;
  followEnabled: boolean;
  isActive: boolean;
  totalSpent: string;
}

export const useEcion = () => {
  const { address, isConnected } = useFarcasterWallet();
  const [userConfig, setUserConfig] = useState<UserConfig | null>(null);
  const [tokenBalance, setTokenBalance] = useState<any>(null);
  const [tokenAllowance, setTokenAllowance] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isApproving, setIsApproving] = useState(false);
  const [isRevokingAllowance, setIsRevokingAllowance] = useState(false);
  const [pendingTxHash, setPendingTxHash] = useState<string | null>(null);
  
  const { writeContract } = useWriteContract();
  
  // Wait for transaction confirmation
  const { isLoading: isTxConfirming } = useWaitForTransactionReceipt({
    hash: pendingTxHash as `0x${string}`,
    onSuccess: async () => {
      console.log('✅ Transaction confirmed, refreshing allowance...');
      if (userConfig?.tokenAddress) {
        await fetchTokenAllowance(userConfig.tokenAddress);
      }
      setPendingTxHash(null);
    },
    onError: (error) => {
      console.error('❌ Transaction failed:', error);
      setPendingTxHash(null);
      toast.error('Transaction failed', { duration: 2000 });
    }
  });

  useEffect(() => {
    if (address) {
      fetchUserConfig();
    }
    // Preload backend wallet address
    fetchBackendWalletAddress();
  }, [address]);

  const fetchUserConfig = async () => {
    try {
      const response = await fetch(`${BACKEND_URL}/api/config/${address}`);
      const data = await response.json();
      setUserConfig(data.config);
    } catch (error) {
      console.error('Error fetching user config:', error);
    }
  };

  const setTippingConfig = async (configData: UserConfig) => {
    if (!address) {
      toast.error('Please connect your wallet first', { duration: 2000 });
      return;
    }

    setIsLoading(true);
    try {
      console.log('Saving config for address:', address);
      console.log('Config data:', configData);
      console.log('Backend URL:', BACKEND_URL);
      
      const response = await fetch(`${BACKEND_URL}/api/config`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userAddress: address,
          config: configData
        })
      });
      
      console.log('Response status:', response.status);
      
      if (response.ok) {
        const result = await response.json();
        console.log('Config saved successfully:', result);
        await fetchUserConfig(); // Refresh config
      } else {
        const errorText = await response.text();
        console.error('Error response:', errorText);
        toast.error(`Failed to save configuration: ${response.status}`, { duration: 2000 });
      }
    } catch (error: any) {
      console.error('Error setting config:', error);
      toast.error('Failed to save configuration: ' + error.message, { duration: 2000 });
    }
    setIsLoading(false);
  };

  const approveToken = async (tokenAddress: string, amount: string) => {
    if (!address) {
      toast.error('Please connect your wallet first', { duration: 2000 });
      return;
    }

    setIsApproving(true);
    try {
      // Fetch the latest backend wallet address
      const backendWallet = await fetchBackendWalletAddress();
      
      if (backendWallet === '0x0000000000000000000000000000000000000000') {
        toast.error('Backend wallet address not available. Please try again.', { duration: 2000 });
        setIsApproving(false);
        return;
      }
      
      console.log('Approving EXACT amount:', amount, 'tokens to backend wallet');
      console.log('Backend wallet address:', backendWallet);
      
      const tokenDecimals = tokenAddress.toLowerCase() === '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913' ? 6 : 18;
      const amountWei = parseUnits(amount, tokenDecimals);
      
      const result = await writeContract({
        address: tokenAddress as `0x${string}`,
        abi: [
          {
            "constant": false,
            "inputs": [
              {"name": "_spender", "type": "address"},
              {"name": "_value", "type": "uint256"}
            ],
            "name": "approve",
            "outputs": [{"name": "", "type": "bool"}],
            "type": "function"
          }
        ],
        functionName: 'approve',
        args: [backendWallet as `0x${string}`, amountWei],
      });
      
      console.log('Approval transaction submitted:', result);
      
      // Set pending transaction hash to wait for confirmation
      setPendingTxHash(result);
      
    } catch (error: any) {
      console.error('Approval failed:', error);
      if (error.message?.includes('User rejected')) {
        toast.error('Transaction cancelled by user', { duration: 2000 });
      } else if (error.message?.includes('zero address')) {
        toast.error('Backend wallet address not configured. Please contact support.', { duration: 2000 });
      } else {
        toast.error('Failed to approve tokens: ' + error.message, { duration: 2000 });
      }
    }
    setIsApproving(false);
  };

  const revokeTokenAllowance = async (tokenAddress: string) => {
    if (!address) {
      toast.error('Please connect your wallet first', { duration: 2000 });
      return;
    }

    setIsRevokingAllowance(true);
    try {
      // Fetch the latest backend wallet address
      const backendWallet = await fetchBackendWalletAddress();
      
      if (backendWallet === '0x0000000000000000000000000000000000000000') {
        toast.error('Backend wallet address not available. Please try again.', { duration: 2000 });
        setIsRevokingAllowance(false);
        return;
      }
      
      console.log('Revoking allowance for token:', tokenAddress);
      
      const result = await writeContract({
        address: tokenAddress as `0x${string}`,
        abi: [
          {
            "constant": false,
            "inputs": [
              {"name": "_spender", "type": "address"},
              {"name": "_value", "type": "uint256"}
            ],
            "name": "approve",
            "outputs": [{"name": "", "type": "bool"}],
            "type": "function"
          }
        ],
        functionName: 'approve',
        args: [backendWallet as `0x${string}`, 0n],
      });
      
      console.log('Revoke transaction submitted:', result);
      
      // Set pending transaction hash to wait for confirmation
      setPendingTxHash(result);
      toast.success('Token allowance revoked successfully!', { duration: 2000 });
      
    } catch (error: any) {
      console.error('Revocation failed:', error);
      if (error.message?.includes('User rejected')) {
        toast.error('Transaction cancelled by user', { duration: 2000 });
      } else if (error.message?.includes('zero address')) {
        toast.error('Backend wallet address not configured. Please contact support.', { duration: 2000 });
      } else {
        toast.error('Failed to revoke allowance: ' + error.message, { duration: 2000 });
      }
    }
    setIsRevokingAllowance(false);
  };

  const fetchTokenAllowance = async (tokenAddress: string) => {
    if (!address) return;
    
    try {
      const tokenDecimals = tokenAddress.toLowerCase() === '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913' ? 6 : 18;
      
      // Use wagmi to read allowance
      const response = await fetch(`${BACKEND_URL}/api/allowance/${address}/${tokenAddress}`);
      if (response.ok) {
        const data = await response.json();
        setTokenAllowance(data.allowance);
      }
    } catch (error) {
      console.error('Error fetching token allowance:', error);
    }
  };

  const revokeConfig = async () => {
    // This deactivates the user's tipping configuration
    if (!address) return;
    
    try {
      const response = await fetch(`${BACKEND_URL}/api/config/${address}`, {
        method: 'DELETE'
      });
      
      if (response.ok) {
        setUserConfig(null);
      }
    } catch (error) {
      console.error('Error revoking config:', error);
    }
  };

  return {
    address,
    userConfig,
    tokenBalance,
    tokenAllowance,
    setTippingConfig,
    approveToken,
    revokeTokenAllowance,
    revokeConfig,
    fetchUserConfig,
    fetchTokenAllowance,
    isSettingConfig: isLoading,
    isApproving: isApproving || isTxConfirming,
    isRevokingAllowance: isRevokingAllowance || isTxConfirming,
    isUpdatingLimit: false,
    isRevoking: false,
  };
};

interface CastEmbed {
  url?: string;
  metadata?: any;
}

interface CastReactions {
  likes_count?: number;
  recasts_count?: number;
}

interface CastReplies {
  count?: number;
}

interface CastTipper {
  userAddress: string;
  username?: string;
  displayName?: string;
  pfpUrl?: string;
  fid?: number;
}

interface Cast {
  hash: string;
  text: string;
  timestamp: string;
  embeds?: CastEmbed[];
  reactions?: CastReactions;
  replies?: CastReplies;
  tipper?: CastTipper;
}

interface HomepageData {
  users: string[];
  amounts: string[];
  casts?: Cast[];
}

interface LeaderboardUser {
  userAddress: string;
  totalAmount: number;
  tipCount: number;
  username?: string;
  displayName?: string;
  pfpUrl?: string;
  fid?: number;
}

interface LeaderboardData {
  tippers: LeaderboardUser[];
  earners: LeaderboardUser[];
  users: string[];
  amounts: string[];
}

export const useHomepageData = (timeFilter: '24h' | '7d' | '30d' = '24h') => {
  const [homepageData, setHomepageData] = useState<HomepageData>({ users: [], amounts: [], casts: [] });
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    fetchHomepageData();
  }, [timeFilter]);

  const fetchHomepageData = async () => {
    setIsLoading(true);
    try {
      const response = await fetch(`${BACKEND_URL}/api/homepage?timeFilter=${timeFilter}`);
      if (response.ok) {
        const data = await response.json();
        setHomepageData({
          users: data.users || [],
          amounts: data.amounts || [],
          casts: data.casts || []
        });
      }
    } catch (error) {
      console.error('Error fetching homepage data:', error);
      // Fallback to empty data
      setHomepageData({
        users: [],
        amounts: [],
        casts: []
      });
    }
    setIsLoading(false);
  };

  return { ...homepageData, isLoading, refetch: fetchHomepageData };
};

export const useLeaderboardData = (timeFilter: '24h' | '7d' | '30d' = '30d') => {
  const [leaderboardData, setLeaderboardData] = useState<LeaderboardData>({ 
    tippers: [], 
    earners: [], 
    users: [], 
    amounts: [] 
  });
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    fetchLeaderboardData();
  }, [timeFilter]);

  const fetchLeaderboardData = async () => {
    setIsLoading(true);
    try {
      const response = await fetch(`${BACKEND_URL}/api/leaderboard?timeFilter=${timeFilter}`);
      if (response.ok) {
        const data = await response.json();
        
        // Fetch user profiles from Neynar for tippers and earners
        const enrichedTippers = await enrichUsersWithProfiles(data.tippers || []);
        const enrichedEarners = await enrichUsersWithProfiles(data.earners || []);
        
        setLeaderboardData({
          tippers: enrichedTippers,
          earners: enrichedEarners,
          users: data.users || [],
          amounts: data.amounts || []
        });
      }
    } catch (error) {
      console.error('Error fetching leaderboard data:', error);
      // Fallback to mock data for now
      setLeaderboardData({
        tippers: [],
        earners: [],
        users: ['0x1234567890123456789012345678901234567890', '0x0987654321098765432109876543210987654321', '0xabcdefabcdefabcdefabcdefabcdefabcd'],
        amounts: ['250.75', '180.30', '120.15']
      });
    }
    setIsLoading(false);
  };

  const enrichUsersWithProfiles = async (users: LeaderboardUser[]) => {
    const enriched = [];
    for (const user of users) {
      try {
        // Try to get Neynar profile data
        const response = await fetch(`${BACKEND_URL}/api/neynar/user/by-address/${user.userAddress}`);
        if (response.ok) {
          const data = await response.json();
          const neynarUser = data.users?.[0];
          if (neynarUser) {
            enriched.push({
              ...user,
              username: neynarUser.username,
              displayName: neynarUser.display_name,
              pfpUrl: neynarUser.pfp_url,
              fid: neynarUser.fid
            });
            continue;
          }
        }
      } catch (error) {
        console.log('Could not fetch profile for', user.userAddress);
      }
      
      // Fallback if no profile found
      enriched.push(user);
    }
    return enriched;
  };

  return { ...leaderboardData, isLoading, refetch: fetchLeaderboardData };
};