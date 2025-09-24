import { useBalance } from 'wagmi';
import { useAccount } from 'wagmi';
import { useState, useEffect } from 'react';

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:3001';

export const usePIT = () => {
  const { address } = useAccount();
  const [userConfig, setUserConfig] = useState(null);
  const [tokenBalance, setTokenBalance] = useState(null);
  const [tokenAllowance, setTokenAllowance] = useState(null);
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

  const setTippingConfig = async (configData) => {
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

  const approveToken = async (tokenAddress, amount) => {
    // This would trigger a wallet transaction to approve tokens to backend wallet
    // Implementation depends on your wallet integration
    console.log('Approve token:', tokenAddress, amount);
  };

  const revokeTokenAllowance = async (tokenAddress) => {
    // This would trigger a wallet transaction to revoke allowance
    console.log('Revoke allowance:', tokenAddress);
  };

  return {
    userConfig,
    tokenBalance,
    tokenAllowance,
    setTippingConfig,
    approveToken,
    revokeTokenAllowance,
    fetchUserConfig,
    isSettingConfig: isLoading,
    isApproving: false,
    isRevokingAllowance: false,
    isUpdatingLimit: false,
    isRevoking: false,
  };
};

export const useHomepageData = () => {
  const [homepageData, setHomepageData] = useState({ users: [], amounts: [] });

  useEffect(() => {
    // Fetch homepage data from backend
    // This would be implemented based on your backend endpoints
  }, []);

  return homepageData;
};

export const useLeaderboardData = () => {
  const [leaderboardData, setLeaderboardData] = useState({ users: [], amounts: [] });

  useEffect(() => {
    // Fetch leaderboard data from backend
    // This would be implemented based on your backend endpoints
  }, []);

  return leaderboardData;
};