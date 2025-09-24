import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { usePIT } from '@/hooks/usePIT';
import { useAccount, useBalance, useContractRead, useContractWrite } from 'wagmi';
import { CONTRACTS, formatAmount } from '@/utils/contracts';
import { parseUnits } from 'viem';
import toast from 'react-hot-toast';
import FarcasterAuth from '@/components/FarcasterAuth';
import {
  Settings as SettingsIcon,
  DollarSign,
  Shield,
  Heart,
  MessageCircle,
  Repeat,
  Quote,
  UserPlus,
  Wallet,
  AlertCircle,
  Check,
  X,
} from 'lucide-react';

export default function Settings() {
  const { address } = useAccount();
  const {
    userConfig,
    availableBalance,
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
  } = usePIT();

  const [mounted, setMounted] = useState(false);
  const [activeTab, setActiveTab] = useState<'amounts' | 'criteria' | 'allowance'>('amounts');
  
  // Form states
  const [spendingLimit, setSpendingLimitValue] = useState('100');
  const [allowanceAmount, setAllowanceAmount] = useState('');
  const [selectedToken, setSelectedToken] = useState(CONTRACTS.USDC.address);
  const [customTokenAddress, setCustomTokenAddress] = useState('');
  const [tippingAmounts, setTippingAmounts] = useState({
    like: '0.01',
    reply: '0.025',
    recast: '0.025',
    quote: '0.025',
    follow: '0',
  });
  const [actionEnabled, setActionEnabled] = useState({
    like: true,
    reply: true,
    recast: true,
    quote: true,
    follow: false,
  });
  const [selectedAudience, setSelectedAudience] = useState(2); // Default to "Anyone" (2)
  const [minFollowerCount, setMinFollowerCount] = useState(25); // Default 25 followers

  // Get current token balance
  const { data: currentTokenBalance } = useBalance({
    address,
    token: (userConfig?.token || selectedToken) as `0x${string}`,
  });

  useEffect(() => {
    setMounted(true);
    if (userConfig) {
      setSpendingLimitValue(formatAmount(userConfig.spendingLimit));
      setTippingAmounts({
        like: formatAmount(userConfig.likeAmount),
        reply: formatAmount(userConfig.replyAmount),
        recast: formatAmount(userConfig.recastAmount),
        quote: formatAmount(userConfig.quoteAmount),
        follow: formatAmount(userConfig.followAmount),
      });
      setActionEnabled({
        like: userConfig.likeEnabled,
        reply: userConfig.replyEnabled,
        recast: userConfig.recastEnabled,
        quote: userConfig.quoteEnabled,
        follow: userConfig.followEnabled,
      });
      setSelectedAudience(userConfig.audience);
      setMinFollowerCount(Number(userConfig.minFollowerCount));
    }
  }, [userConfig]);

  if (!mounted) return null;

  if (!address) {
    return (
      <div className="text-center py-12">
        <AlertCircle className="w-16 h-16 text-accent mx-auto mb-4" />
        <h2 className="text-3xl font-bold text-accent mb-2">Connect Your Wallet</h2>
        <p className="text-gray-600">Please connect your wallet to access settings</p>
      </div>
    );
  }

  const handleSaveTippingConfig = async () => {
    try {
      const tokenAddress = selectedToken === 'custom' ? customTokenAddress : selectedToken;
      const decimals = selectedToken === CONTRACTS.USDC.address ? CONTRACTS.USDC.decimals : 18; // Default to 18 for unknown tokens
      
      await setTippingConfig?.({
        args: [
          tokenAddress,
          parseUnits(tippingAmounts.like, decimals),
          parseUnits(tippingAmounts.reply, decimals),
          parseUnits(tippingAmounts.recast, decimals),
          parseUnits(tippingAmounts.quote, decimals),
          parseUnits(tippingAmounts.follow, decimals),
          parseUnits(spendingLimit, decimals),
          selectedAudience,
          minFollowerCount,
          actionEnabled.like,
          actionEnabled.reply,
          actionEnabled.recast,
          actionEnabled.quote,
          actionEnabled.follow,
        ],
      });
      toast.success('Tipping configuration saved!');
    } catch (error) {
      toast.error('Failed to save configuration');
    }
  };

  const handleApproveAllowance = async () => {
    if (!allowanceAmount) return;
    
    try {
      const tokenAddress = userConfig?.token || selectedToken;
      const decimals = tokenAddress === CONTRACTS.USDC.address ? CONTRACTS.USDC.decimals : 18;
      const amount = parseUnits(allowanceAmount, decimals);
      
      await approveToken?.({
        args: [CONTRACTS.Ecion.address, amount],
      });
      toast.success('Allowance approved successfully!');
      setAllowanceAmount('');
    } catch (error) {
      toast.error('Failed to approve allowance');
    }
  };

  const handleUpdateSpendingLimit = async () => {
    try {
      await updateSpendingLimit?.({
        args: [parseUnits(spendingLimit, CONTRACTS.USDC.decimals)],
      });
      toast.success('Spending limit updated!');
    } catch (error) {
      toast.error('Failed to update spending limit');
    }
  };

  const handleRevokeTokenAllowance = async () => {
    if (confirm('Are you sure you want to revoke your token allowance? This will prevent the contract from spending your tokens.')) {
      try {
        await revokeTokenAllowance?.();
        toast.success('Token allowance revoked');
      } catch (error) {
        toast.error('Failed to revoke token allowance');
      }
    }
  };

  const handleRevoke = async () => {
    if (confirm('Are you sure you want to revoke your tipping configuration?')) {
      try {
        await revokeConfig?.();
        toast.success('Configuration revoked');
      } catch (error) {
        toast.error('Failed to revoke configuration');
      }
    }
  };

  return (
    <div className="space-y-8">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="text-center"
      >
        <div className="flex items-center justify-center mb-4">
          <SettingsIcon className="w-16 h-16 text-accent mr-4" />
          <h1 className="text-5xl font-bold text-accent">Settings</h1>
        </div>
        <p className="text-xl text-gray-700">
          Configure your reverse tipping preferences
        </p>
      </motion.div>

      {/* Farcaster Connection */}
      <FarcasterAuth />

      {/* Wallet Info */}
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="bg-white rounded-2xl p-6 card-shadow"
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <Wallet className="w-8 h-8 text-accent" />
            <div>
              <p className="text-sm text-gray-600">Connected Wallet</p>
              <p className="font-mono font-semibold">
                {address.slice(0, 6)}...{address.slice(-4)}
              </p>
            </div>
          </div>
          <div className="text-right">
            <p className="text-sm text-gray-600">Token Balance</p>
            <p className="text-2xl font-bold text-accent">
              {currentTokenBalance ? formatAmount(currentTokenBalance.value, currentTokenBalance.decimals) : '0'} {currentTokenBalance?.symbol || 'TOKEN'}
            </p>
          </div>
        </div>
        
        {userConfig && availableBalance && (
          <div className="mt-4 pt-4 border-t border-gray-200">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <p className="text-sm text-gray-600">Allowance</p>
                <p className="text-lg font-bold text-accent">
                  {formatAmount(availableBalance.allowance)}
                </p>
              </div>
              <div>
                <p className="text-sm text-gray-600">Available to Tip</p>
                <p className="text-lg font-bold text-green-600">
                  {formatAmount(availableBalance.availableToReward)}
                </p>
              </div>
              <div>
                <p className="text-sm text-gray-600">Total Spent</p>
                <p className="text-lg font-bold text-gray-700">
                  {formatAmount(userConfig.totalSpent)}
                </p>
              </div>
              <div>
                <p className="text-sm text-gray-600">Status</p>
                <p className={`text-lg font-bold ${userConfig.isActive ? 'text-green-600' : 'text-red-600'}`}>
                  {userConfig.isActive ? 'Active' : 'Inactive'}
                </p>
              </div>
            </div>
          </div>
        )}
      </motion.div>

      {/* Tabs */}
      <div className="bg-white rounded-2xl card-shadow">
        <div className="flex border-b border-gray-200">
          <button
            onClick={() => setActiveTab('amounts')}
            className={`flex-1 py-4 px-6 font-semibold transition-colors ${
              activeTab === 'amounts'
                ? 'text-accent border-b-4 border-accent'
                : 'text-gray-600 hover:text-accent'
            }`}
          >
            <DollarSign className="w-5 h-5 inline mr-2" />
            Set Tipping Amounts
          </button>
          <button
            onClick={() => setActiveTab('criteria')}
            className={`flex-1 py-4 px-6 font-semibold transition-colors ${
              activeTab === 'criteria'
                ? 'text-accent border-b-4 border-accent'
                : 'text-gray-600 hover:text-accent'
            }`}
          >
            <Users className="w-5 h-5 inline mr-2" />
            Set Criteria
          </button>
          <button
            onClick={() => setActiveTab('allowance')}
            className={`flex-1 py-4 px-6 font-semibold transition-colors ${
              activeTab === 'allowance'
                ? 'text-accent border-b-4 border-accent'
                : 'text-gray-600 hover:text-accent'
            }`}
          >
            <Shield className="w-5 h-5 inline mr-2" />
            Set Token Allowances
          </button>
        </div>

        <div className="p-8">
          {activeTab === 'amounts' ? (
            <motion.div
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              className="space-y-6"
            >
              <p className="text-gray-600 mb-6">
                Set how much USDC you want to tip for each type of interaction
              </p>

              {/* Spending Limit */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Maximum Spending Limit (USDC)
                </label>
                <input
                  type="number"
                  value={spendingLimit}
                  onChange={(e) => setSpendingLimitValue(e.target.value)}
                  className="w-full px-4 py-3 border-2 border-gray-300 rounded-xl focus:border-accent focus:outline-none"
                  placeholder="100"
                />
                <p className="text-sm text-gray-600 mt-2">
                  This is the maximum amount that can be tipped from your account
                </p>
              </div>

              {/* Tipping amounts form with toggles */}
              <div className="space-y-4">
                {[
                  { key: 'like', icon: Heart, label: 'Per Like' },
                  { key: 'reply', icon: MessageCircle, label: 'Per Reply' },
                  { key: 'recast', icon: Repeat, label: 'Per Recast' },
                  { key: 'quote', icon: Quote, label: 'Per Quote Cast' },
                  { key: 'follow', icon: UserPlus, label: 'Per Follow' },
                ].map(({ key, icon: Icon, label }) => (
                  <div key={key} className="flex items-center space-x-4 p-4 bg-gray-50 rounded-xl">
                    <Icon className="w-6 h-6 text-accent" />
                    <label className="flex-1 font-medium text-gray-700">
                      {label}
                    </label>
                    <div className="flex items-center space-x-4">
                      <input
                        type="number"
                        step="0.001"
                        value={tippingAmounts[key as keyof typeof tippingAmounts]}
                        onChange={(e) =>
                          setTippingAmounts({
                            ...tippingAmounts,
                            [key]: e.target.value,
                          })
                        }
                        className="w-24 px-3 py-2 border-2 border-gray-300 rounded-lg focus:border-accent focus:outline-none text-right"
                      />
                      <span className="text-gray-600 text-sm">USDC</span>
                      <button
                        onClick={() =>
                          setActionEnabled({
                            ...actionEnabled,
                            [key]: !actionEnabled[key as keyof typeof actionEnabled],
                          })
                        }
                        className={`w-12 h-6 rounded-full transition-colors ${
                          actionEnabled[key as keyof typeof actionEnabled]
                            ? 'bg-green-500'
                            : 'bg-gray-300'
                        }`}
                      >
                        <div
                          className={`w-5 h-5 bg-white rounded-full shadow-md transform transition-transform ${
                            actionEnabled[key as keyof typeof actionEnabled]
                              ? 'translate-x-6'
                              : 'translate-x-0.5'
                          }`}
                        />
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              <div className="flex justify-end space-x-4 pt-6">
                <button
                  onClick={() => {
                    // Reset to default values
                    setTippingAmounts({
                      like: '0.01',
                      reply: '0.025',
                      recast: '0.025',
                      quote: '0.025',
                      follow: '0',
                    });
                    setActionEnabled({
                      like: true,
                      reply: true,
                      recast: true,
                      quote: true,
                      follow: false,
                    });
                  }}
                  className="btn-secondary"
                >
                  Reset to Defaults
                </button>
                <button
                  onClick={handleSaveTippingConfig}
                  disabled={isSettingConfig}
                  className="btn-primary"
                >
                  {isSettingConfig ? 'Saving...' : 'Save Configuration'}
                </button>
              </div>
            </motion.div>
          ) : activeTab === 'criteria' ? (
            <motion.div
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              className="space-y-6"
            >
              <p className="text-gray-600 mb-6">
                Set criteria for who can receive tips from you
              </p>

              {/* Audience Selection */}
              <div className="mb-6">
                <label className="block text-sm font-medium text-gray-700 mb-3">
                  Tipping Audience
                </label>
                <div className="space-y-3">
                  {[
                    { value: 0, label: 'Following', description: 'Only users you follow can receive tips' },
                    { value: 1, label: 'Followers', description: 'Only your followers can receive tips' },
                    { value: 2, label: 'Anyone', description: 'Anyone can receive tips (must be Farcaster user)' }
                  ].map(({ value, label, description }) => (
                    <div key={value} className="flex items-start space-x-3">
                      <input
                        type="radio"
                        id={`audience-${value}`}
                        name="audience"
                        value={value}
                        checked={selectedAudience === value}
                        onChange={(e) => setSelectedAudience(parseInt(e.target.value))}
                        className="w-4 h-4 text-accent mt-1"
                      />
                      <div className="flex-1">
                        <label htmlFor={`audience-${value}`} className="font-medium text-gray-700">
                          {label}
                        </label>
                        <p className="text-sm text-gray-600">{description}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Minimum Follower Count */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Minimum Follower Count
                </label>
                <div className="flex items-center space-x-4">
                  <input
                    type="range"
                    min="25"
                    max="1000"
                    value={minFollowerCount}
                    onChange={(e) => setMinFollowerCount(parseInt(e.target.value))}
                    className="flex-1 h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
                  />
                  <div className="w-20 text-center">
                    <span className="text-lg font-bold text-accent">{minFollowerCount}</span>
                    <p className="text-xs text-gray-500">followers</p>
                  </div>
                </div>
                <p className="text-sm text-gray-600 mt-2">
                  Only users with at least {minFollowerCount} followers can receive tips
                </p>
              </div>

              <div className="flex justify-end space-x-4 pt-6">
                <button
                  onClick={handleSaveTippingConfig}
                  disabled={isSettingConfig}
                  className="btn-primary"
                >
                  {isSettingConfig ? 'Saving...' : 'Save Criteria'}
                </button>
              </div>
            </motion.div>
          ) : (
            <motion.div
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              className="space-y-6"
            >
              <p className="text-gray-600 mb-6">
                Set token allowances for tipping
              </p>

              {/* Token Selection */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Token: Paste your token address
                </label>
                <div className="space-y-3">
                  <input
                    type="text"
                    value={selectedToken === 'custom' ? customTokenAddress : selectedToken}
                    onChange={(e) => {
                      if (e.target.value === CONTRACTS.USDC.address) {
                        setSelectedToken(CONTRACTS.USDC.address);
                      } else {
                        setSelectedToken('custom');
                        setCustomTokenAddress(e.target.value);
                      }
                    }}
                    className="w-full px-4 py-3 border-2 border-gray-300 rounded-xl focus:border-accent focus:outline-none"
                    placeholder="0x... (Token contract address)"
                  />
                  <button
                    onClick={() => {
                      setSelectedToken(CONTRACTS.USDC.address);
                      setCustomTokenAddress('');
                    }}
                    className="flex items-center space-x-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                  >
                    <DollarSign className="w-4 h-4" />
                    <span>Choose USDC</span>
                  </button>
                </div>
              </div>

              {/* Allowance Management */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Token Allowance
                </label>
                <p className="text-sm text-gray-600 mb-3">
                  Current allowance: {tokenAllowance ? formatAmount(tokenAllowance as bigint) : '0'} {currentTokenBalance?.symbol || 'TOKEN'}
                </p>
                <div className="flex space-x-2">
                  <input
                    type="number"
                    value={allowanceAmount}
                    onChange={(e) => setAllowanceAmount(e.target.value)}
                    className="flex-1 px-4 py-3 border-2 border-gray-300 rounded-xl focus:border-accent focus:outline-none"
                    placeholder="1000"
                  />
                  <button
                    onClick={handleApproveAllowance}
                    disabled={isApproving || !allowanceAmount}
                    className="btn-primary"
                  >
                    {isApproving ? 'Approving...' : 'Set'}
                  </button>
                  <button
                    onClick={handleRevokeTokenAllowance}
                    disabled={isRevokingAllowance || !tokenAllowance || tokenAllowance === 0n}
                    className="bg-red-600 text-white px-4 py-3 rounded-xl font-semibold hover:bg-red-700 transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed"
                  >
                    {isRevokingAllowance ? 'Revoking...' : 'Revoke Allowance'}
                  </button>
                </div>
                <p className="text-sm text-gray-600 mt-2">
                  This allows Ecion to spend tokens from your wallet when processing tips
                </p>
              </div>

              {/* Revoke Access */}
              <div className="border-t pt-6">
                <h3 className="text-lg font-semibold text-gray-800 mb-2">
                  Danger Zone
                </h3>
                <p className="text-sm text-gray-600 mb-4">
                  Revoke access will disable all tipping from your account
                </p>
                <button
                  onClick={handleRevoke}
                  disabled={isRevoking}
                  className="bg-red-600 text-white px-6 py-3 rounded-xl font-semibold hover:bg-red-700 transition-colors"
                >
                  {isRevoking ? 'Revoking...' : 'Revoke Access'}
                </button>
              </div>
            </motion.div>
          )}
        </div>
      </div>
    </div>
  );
}