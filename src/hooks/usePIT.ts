import { useBalance } from 'wagmi';
import { useAccount } from 'wagmi';
import { useState, useEffect } from 'react';

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:3001';

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

export const usePIT = () => {
  const { address } = useAccount();
  const [userConfig, setUserConfig] = useState<UserConfig | null>(null);
  const [tokenBalance, setTokenBalance] = useState<any>(null);
  const [tokenAllowance, setTokenAllowance] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  // Get token balance in wallet
  const { data: balanceData } = useBalance({
    address,
    token: userConfig?.tokenAddress as `0x${string}`,
    enabled: !!address && !!userConfig?.tokenAddress,
  });

  useEffect(() => {
    if (address) {
      fetchUserConfig();
    }
  }, [address]);

  useEffect(() => {
    if (balanceData) {
      setTokenBalance(balanceData);
    }
  }, [balanceData]);

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
    setIsLoading(true);
    try {
      const response = await fetch(`${BACKEND_URL}/api/config`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userAddress: address,
          config: configData
        })
      });
      
      if (response.ok) {
        await fetchUserConfig(); // Refresh config
      }
    } catch (error) {
      console.error('Error setting config:', error);
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

export const useHomepageData = () => {
  const [homepageData, setHomepageData] = useState<HomepageData>({ users: [], amounts: [] });

  useEffect(() => {
    // Fetch homepage data from backend
    // This would be implemented based on your backend endpoints
  }, []);

  return homepageData;
};

export const useLeaderboardData = () => {
  const [leaderboardData, setLeaderboardData] = useState<HomepageData>({ users: [], amounts: [] });

  useEffect(() => {
    // Fetch leaderboard data from backend
    // This would be implemented based on your backend endpoints
  }, []);

  return leaderboardData;
};