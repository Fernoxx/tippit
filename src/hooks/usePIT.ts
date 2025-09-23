import { useContractRead, useContractWrite, usePrepareContractWrite, useBalance } from 'wagmi';
import { CONTRACTS, formatAmount } from '@/utils/contracts';
import { useAccount } from 'wagmi';
import { parseUnits } from 'viem';

export const usePIT = () => {
  const { address } = useAccount();

  // Read user config
  const { data: userConfig } = useContractRead({
    address: CONTRACTS.PitTipping.address as `0x${string}`,
    abi: CONTRACTS.PitTipping.abi,
    functionName: 'userConfigs',
    args: address ? [address] : undefined,
    enabled: !!address,
  });

  // Read user available balance (includes allowance check)
  const { data: availableBalance } = useContractRead({
    address: CONTRACTS.PitTipping.address as `0x${string}`,
    abi: CONTRACTS.PitTipping.abi,
    functionName: 'getUserAvailableBalance',
    args: address ? [address] : undefined,
    enabled: !!address,
  });

  // Get token balance in wallet
  const { data: tokenBalance } = useBalance({
    address,
    token: userConfig?.[0] as `0x${string}`,
    enabled: !!address && !!userConfig?.[0],
  });

  // Read token allowance
  const { data: tokenAllowance } = useContractRead({
    address: userConfig?.[0] as `0x${string}`,
    abi: CONTRACTS.USDC.abi,
    functionName: 'allowance',
    args: address && userConfig ? [address, CONTRACTS.PitTipping.address] : undefined,
    enabled: !!address && !!userConfig?.[0],
  });

  // Set tipping config
  const { config: setConfigPrepare } = usePrepareContractWrite({
    address: CONTRACTS.PitTipping.address as `0x${string}`,
    abi: CONTRACTS.PitTipping.abi,
    functionName: 'setTippingConfig',
  });

  const { write: setTippingConfig, isLoading: isSettingConfig } = useContractWrite(setConfigPrepare);

  // Approve token
  const { config: approvePrepare } = usePrepareContractWrite({
    address: userConfig?.[0] as `0x${string}`,
    abi: CONTRACTS.USDC.abi,
    functionName: 'approve',
    enabled: !!userConfig?.[0],
  });

  const { write: approveToken, isLoading: isApproving } = useContractWrite(approvePrepare);

  // Update spending limit
  const { config: updateLimitPrepare } = usePrepareContractWrite({
    address: CONTRACTS.PitTipping.address as `0x${string}`,
    abi: CONTRACTS.PitTipping.abi,
    functionName: 'updateSpendingLimit',
  });

  const { write: updateSpendingLimit, isLoading: isUpdatingLimit } = useContractWrite(updateLimitPrepare);

  // Revoke config
  const { config: revokePrepare } = usePrepareContractWrite({
    address: CONTRACTS.PitTipping.address as `0x${string}`,
    abi: CONTRACTS.PitTipping.abi,
    functionName: 'revokeConfig',
  });

  const { write: revokeConfig, isLoading: isRevoking } = useContractWrite(revokePrepare);

  return {
    userConfig: userConfig ? {
      token: userConfig[0],
      likeAmount: userConfig[1],
      replyAmount: userConfig[2],
      recastAmount: userConfig[3],
      quoteAmount: userConfig[4],
      followAmount: userConfig[5],
      spendingLimit: userConfig[6],
      totalSpent: userConfig[7],
      isActive: userConfig[8],
    } : null,
    availableBalance: availableBalance ? {
      token: availableBalance[0],
      balance: availableBalance[1],
      allowance: availableBalance[2],
      availableToTip: availableBalance[3],
    } : null,
    tokenBalance,
    tokenAllowance,
    setTippingConfig,
    approveToken,
    updateSpendingLimit,
    revokeConfig,
    isSettingConfig,
    isApproving,
    isUpdatingLimit,
    isRevoking,
  };
};

export const useHomepageData = () => {
  const { data } = useContractRead({
    address: CONTRACTS.PitTipping.address as `0x${string}`,
    abi: CONTRACTS.PitTipping.abi,
    functionName: 'getUsersByLikeAmount',
    args: [0, 20], // Get top 20 users
  });

  return {
    users: data?.[0] || [],
    amounts: data?.[1] || [],
  };
};

export const useLeaderboardData = () => {
  const { data } = useContractRead({
    address: CONTRACTS.PitTipping.address as `0x${string}`,
    abi: CONTRACTS.PitTipping.abi,
    functionName: 'getLeaderboard',
    args: [0, 20], // Get top 20 tippers
  });

  return {
    users: data?.[0] || [],
    amounts: data?.[1] || [],
  };
};