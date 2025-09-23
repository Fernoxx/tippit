import { useContractRead, useContractWrite, usePrepareContractWrite } from 'wagmi';
import { CONTRACTS, formatAmount } from '@/utils/contracts';
import { useAccount } from 'wagmi';
import { parseUnits } from 'viem';

export const usePIT = () => {
  const { address } = useAccount();

  // Read user config
  const { data: userConfig } = useContractRead({
    address: CONTRACTS.PITTipping.address as `0x${string}`,
    abi: CONTRACTS.PITTipping.abi,
    functionName: 'userConfigs',
    args: address ? [address] : undefined,
    enabled: !!address,
  });

  // Read user balance
  const { data: userBalance } = useContractRead({
    address: CONTRACTS.PITTipping.address as `0x${string}`,
    abi: CONTRACTS.PITTipping.abi,
    functionName: 'tokenBalances',
    args: address && userConfig ? [address, userConfig[0]] : undefined,
    enabled: !!address && !!userConfig,
  });

  // Set tipping config
  const { config: setConfigPrepare } = usePrepareContractWrite({
    address: CONTRACTS.PITTipping.address as `0x${string}`,
    abi: CONTRACTS.PITTipping.abi,
    functionName: 'setTippingConfig',
  });

  const { write: setTippingConfig, isLoading: isSettingConfig } = useContractWrite(setConfigPrepare);

  // Deposit funds
  const { config: depositPrepare } = usePrepareContractWrite({
    address: CONTRACTS.PITTipping.address as `0x${string}`,
    abi: CONTRACTS.PITTipping.abi,
    functionName: 'depositFunds',
  });

  const { write: depositFunds, isLoading: isDepositing } = useContractWrite(depositPrepare);

  // Withdraw funds
  const { config: withdrawPrepare } = usePrepareContractWrite({
    address: CONTRACTS.PITTipping.address as `0x${string}`,
    abi: CONTRACTS.PITTipping.abi,
    functionName: 'withdrawFunds',
  });

  const { write: withdrawFunds, isLoading: isWithdrawing } = useContractWrite(withdrawPrepare);

  // Update spending limit
  const { config: updateLimitPrepare } = usePrepareContractWrite({
    address: CONTRACTS.PITTipping.address as `0x${string}`,
    abi: CONTRACTS.PITTipping.abi,
    functionName: 'updateSpendingLimit',
  });

  const { write: updateSpendingLimit, isLoading: isUpdatingLimit } = useContractWrite(updateLimitPrepare);

  // Revoke config
  const { config: revokePrepare } = usePrepareContractWrite({
    address: CONTRACTS.PITTipping.address as `0x${string}`,
    abi: CONTRACTS.PITTipping.abi,
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
    userBalance,
    setTippingConfig,
    depositFunds,
    withdrawFunds,
    updateSpendingLimit,
    revokeConfig,
    isSettingConfig,
    isDepositing,
    isWithdrawing,
    isUpdatingLimit,
    isRevoking,
  };
};

export const useHomepageData = () => {
  const { data } = useContractRead({
    address: CONTRACTS.PITTipping.address as `0x${string}`,
    abi: CONTRACTS.PITTipping.abi,
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
    address: CONTRACTS.PITTipping.address as `0x${string}`,
    abi: CONTRACTS.PITTipping.abi,
    functionName: 'getLeaderboard',
    args: [0, 20], // Get top 20 tippers
  });

  return {
    users: data?.[0] || [],
    amounts: data?.[1] || [],
  };
};