import { useState, useEffect } from 'react';
import { useFarcasterWallet } from './useFarcasterWallet';
import { toast } from 'react-hot-toast';

const BACKEND_URL = (process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:3001').replace(/\/$/, '');

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

  useEffect(() => {
    if (address) {
      fetchUserConfig();
    }
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
      toast.error('Please connect your wallet first');
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
        toast.success('Configuration saved successfully!');
        await fetchUserConfig(); // Refresh config
      } else {
        const errorText = await response.text();
        console.error('Error response:', errorText);
        toast.error(`Failed to save configuration: ${response.status}`);
      }
    } catch (error: any) {
      console.error('Error setting config:', error);
      toast.error('Failed to save configuration: ' + error.message);
    }
    setIsLoading(false);
  };

  const approveToken = async (tokenAddress: string, amount: string) => {
    // This triggers a wallet transaction to approve EXACT amount to backend wallet
    // Amount should be the exact USDC amount user wants to approve (not unlimited)
    console.log('Approve EXACT amount:', amount, 'USDC to backend wallet');
    
    // In a real implementation, this would:
    // 1. Open wallet popup
    // 2. Call token.approve(backendWalletAddress, parseUnits(amount, 6))
    // 3. Wait for transaction confirmation
    // 4. Update UI
    
    // For now, just log the exact amount
    console.log(`User approves ${amount} USDC to backend wallet: ${process.env.NEXT_PUBLIC_BACKEND_WALLET_ADDRESS}`);
  };

  const revokeTokenAllowance = async (tokenAddress: string) => {
    // This triggers a wallet transaction to revoke allowance (set to 0)
    console.log('Revoke allowance for token:', tokenAddress);
    
    // In a real implementation, this would:
    // 1. Open wallet popup  
    // 2. Call token.approve(backendWalletAddress, 0)
    // 3. Wait for transaction confirmation
    // 4. Update UI
    
    console.log(`User revokes allowance for ${tokenAddress} from backend wallet: ${process.env.NEXT_PUBLIC_BACKEND_WALLET_ADDRESS}`);
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
    isSettingConfig: isLoading,
    isApproving: false,
    isRevokingAllowance: false,
    isUpdatingLimit: false,
    isRevoking: false,
  };
};

interface HomepageData {
  users: string[];
  amounts: string[];
}

export const useHomepageData = (timeFilter: '24h' | '7d' | '30d' = '24h') => {
  const [homepageData, setHomepageData] = useState<HomepageData>({ users: [], amounts: [] });
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
        setHomepageData(data);
      }
    } catch (error) {
      console.error('Error fetching homepage data:', error);
      // Fallback to mock data for now
      setHomepageData({
        users: ['0x1234567890123456789012345678901234567890', '0x0987654321098765432109876543210987654321'],
        amounts: ['100.50', '75.25']
      });
    }
    setIsLoading(false);
  };

  return { ...homepageData, isLoading, refetch: fetchHomepageData };
};

export const useLeaderboardData = (timeFilter: '24h' | '7d' | '30d' = '30d') => {
  const [leaderboardData, setLeaderboardData] = useState<HomepageData>({ users: [], amounts: [] });
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
        setLeaderboardData(data);
      }
    } catch (error) {
      console.error('Error fetching leaderboard data:', error);
      // Fallback to mock data for now
      setLeaderboardData({
        users: ['0x1234567890123456789012345678901234567890', '0x0987654321098765432109876543210987654321', '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd'],
        amounts: ['250.75', '180.30', '120.15']
      });
    }
    setIsLoading(false);
  };

  return { ...leaderboardData, isLoading, refetch: fetchLeaderboardData };
};