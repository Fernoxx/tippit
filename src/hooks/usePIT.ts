import { useContractRead, useContractWrite, usePrepareContractWrite, useBalance } from 'wagmi';
import { CONTRACTS, formatAmount } from '@/utils/contracts';
import { useAccount } from 'wagmi';
import { parseUnits } from 'viem';

export const usePIT = () => {
  const { address } = useAccount();

  // Read user config
  const { data: userConfig } = useContractRead({
    address: CONTRACTS.Ecion.address as `0x${string}`,
    abi: CONTRACTS.Ecion.abi,
    functionName: 'creatorConfigs',
    args: address ? [address] : undefined,
    enabled: !!address,
  });

  // Read user available balance (includes allowance check)
  const { data: availableBalance } = useContractRead({
    address: CONTRACTS.Ecion.address as `0x${string}`,
    abi: CONTRACTS.Ecion.abi,
    functionName: 'getCreatorAvailableBalance',
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
    args: address && userConfig ? [address, CONTRACTS.Ecion.address] : undefined,
    enabled: !!address && !!userConfig?.[0],
  });

  // Set tipping config
  const { config: setConfigPrepare } = usePrepareContractWrite({
    address: CONTRACTS.Ecion.address as `0x${string}`,
    abi: CONTRACTS.Ecion.abi,
    functionName: 'setRewardConfig',
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

  // Revoke token allowance (set to 0)
  const { config: revokeAllowancePrepare } = usePrepareContractWrite({
    address: userConfig?.[0] as `0x${string}`,
    abi: CONTRACTS.USDC.abi,
    functionName: 'approve',
    args: [CONTRACTS.Ecion.address, 0n], // Set allowance to 0
    enabled: !!userConfig?.[0],
  });

  const { write: revokeTokenAllowance, isLoading: isRevokingAllowance } = useContractWrite(revokeAllowancePrepare);

  // Update spending limit
  const { config: updateLimitPrepare } = usePrepareContractWrite({
    address: CONTRACTS.Ecion.address as `0x${string}`,
    abi: CONTRACTS.Ecion.abi,
    functionName: 'updateSpendingLimit',
  });

  const { write: updateSpendingLimit, isLoading: isUpdatingLimit } = useContractWrite(updateLimitPrepare);

  // Revoke config
  const { config: revokePrepare } = usePrepareContractWrite({
    address: CONTRACTS.Ecion.address as `0x${string}`,
    abi: CONTRACTS.Ecion.abi,
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
      audience: userConfig[8],
      minFollowerCount: userConfig[9],
      likeEnabled: userConfig[10],
      replyEnabled: userConfig[11],
      recastEnabled: userConfig[12],
      quoteEnabled: userConfig[13],
      followEnabled: userConfig[14],
      isActive: userConfig[15],
    } : null,
    availableBalance: availableBalance ? {
      token: availableBalance[0],
      balance: availableBalance[1],
      allowance: availableBalance[2],
      availableToReward: availableBalance[3],
    } : null,
    tokenBalance,
    tokenAllowance,
    setTippingConfig,
    approveToken,
    revokeTokenAllowance,
    updateSpendingLimit,
    revokeConfig,
    isSettingConfig,
    isApproving,
    isRevokingAllowance,
    isUpdatingLimit,
    isRevoking,
  };
};

export const useHomepageData = () => {
  const { data } = useContractRead({
    address: CONTRACTS.Ecion.address as `0x${string}`,
    abi: CONTRACTS.Ecion.abi,
    functionName: 'getTopUsersByTipsReceived',
    args: [0, 20], // Get top 20 users
  });

  return {
    users: data?.[0] || [],
    amounts: data?.[1] || [],
  };
};

export const useLeaderboardData = () => {
  const { data } = useContractRead({
    address: CONTRACTS.Ecion.address as `0x${string}`,
    abi: CONTRACTS.Ecion.abi,
    functionName: 'getTopUsersByTipsGiven',
    args: [0, 20], // Get top 20 tippers
  });

  return {
    users: data?.[0] || [],
    amounts: data?.[1] || [],
  };
};