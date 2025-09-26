import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useEcion } from '@/hooks/usePIT';
import { formatAmount } from '@/utils/contracts';
import toast from 'react-hot-toast';
import {
  Settings as SettingsIcon,
  DollarSign,
  Shield,
  Users,
  Heart,
  MessageCircle,
  Repeat,
  Quote,
  UserPlus,
  Check,
  X,
} from 'lucide-react';

export default function Settings() {
  const {
    address,
    userConfig,
    tokenBalance,
    tokenAllowance,
    setTippingConfig,
    approveToken,
    revokeTokenAllowance,
    revokeConfig,
    isSettingConfig,
    isApproving,
    isRevokingAllowance,
    isUpdatingLimit,
    isRevoking,
  } = useEcion();

  const [mounted, setMounted] = useState(false);
  const [activeTab, setActiveTab] = useState<'amounts' | 'criteria' | 'allowance'>('amounts');
  
  // Form states
  const [spendingLimit, setSpendingLimitValue] = useState('0');
  const [allowanceAmount, setAllowanceAmount] = useState('');
  const [selectedToken, setSelectedToken] = useState('0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913'); // USDC on Base
  const [customTokenAddress, setCustomTokenAddress] = useState('');
  const [tippingAmounts, setTippingAmounts] = useState({
    like: '0.01',
    reply: '0.025',
    recast: '0.025',
    quote: '0.025',
    follow: '0',
  });
  const [tippingToggles, setTippingToggles] = useState({
    like: true,
    reply: true,
    recast: true,
    quote: true,
    follow: false,
  });
  const [criteria, setCriteria] = useState({
    audience: 0, // 0: Following, 1: Followers, 2: Anyone
    minFollowerCount: 25,
    minNeynarScore: 0.5,
  });

  useEffect(() => {
    setMounted(true);
    if (userConfig) {
      setSpendingLimitValue(userConfig.spendingLimit?.toString() || '0');
      setTippingAmounts({
        like: userConfig.likeAmount?.toString() || '0.01',
        reply: userConfig.replyAmount?.toString() || '0.025',
        recast: userConfig.recastAmount?.toString() || '0.025',
        quote: userConfig.quoteAmount?.toString() || '0.025',
        follow: userConfig.followAmount?.toString() || '0',
      });
      setTippingToggles({
        like: userConfig.likeEnabled ?? true,
        reply: userConfig.replyEnabled ?? true,
        recast: userConfig.recastEnabled ?? true,
        quote: userConfig.quoteEnabled ?? true,
        follow: userConfig.followEnabled ?? false,
      });
      setCriteria({
        audience: userConfig.audience || 0,
        minFollowerCount: userConfig.minFollowerCount || 25,
        minNeynarScore: userConfig.minNeynarScore || 0.5,
      });
    }
  }, [userConfig]);

  const handleSaveTippingConfig = async () => {
    if (!address) {
      toast.error('Please connect your wallet first');
      return;
    }

    try {
      await setTippingConfig({
        tokenAddress: selectedToken,
        likeAmount: tippingAmounts.like,
        replyAmount: tippingAmounts.reply,
        recastAmount: tippingAmounts.recast,
        quoteAmount: tippingAmounts.quote,
        followAmount: tippingAmounts.follow,
        spendingLimit: spendingLimit,
        audience: criteria.audience,
        minFollowerCount: criteria.minFollowerCount,
        minNeynarScore: criteria.minNeynarScore,
        likeEnabled: tippingToggles.like,
        replyEnabled: tippingToggles.reply,
        recastEnabled: tippingToggles.recast,
        quoteEnabled: tippingToggles.quote,
        followEnabled: tippingToggles.follow,
        isActive: true,
        totalSpent: userConfig?.totalSpent || '0'
      });
      toast.success('Tipping configuration saved!');
    } catch (error: any) {
      toast.error('Failed to save configuration: ' + error.message);
    }
  };

  const handleApproveAllowance = async () => {
    if (!address) {
      toast.error('Please connect your wallet first');
      return;
    }

    if (!allowanceAmount || allowanceAmount === '0') {
      toast.error('Please enter an allowance amount');
      return;
    }

    try {
      await approveToken(selectedToken, allowanceAmount);
    } catch (error: any) {
      toast.error('Failed to approve allowance: ' + error.message);
    }
  };

  const handleRevokeAllowance = async () => {
    if (!address) {
      toast.error('Please connect your wallet first');
      return;
    }

    try {
      await revokeTokenAllowance(selectedToken);
    } catch (error: any) {
      toast.error('Failed to revoke allowance: ' + error.message);
    }
  };

  const handleRevokeConfig = async () => {
    if (!address) {
      toast.error('Please connect your wallet first');
      return;
    }

    if (confirm('Are you sure you want to deactivate your tipping configuration?')) {
      try {
        await revokeConfig();
        toast.success('Tipping configuration deactivated');
      } catch (error: any) {
        toast.error('Failed to deactivate configuration: ' + error.message);
      }
    }
  };

  if (!mounted) return null;

  if (!address) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-8 bg-yellow-50 min-h-full">
        <div className="text-center py-12">
          <SettingsIcon className="w-16 h-16 mx-auto mb-4 text-gray-400" />
          <h1 className="text-2xl font-bold text-gray-900 mb-4">Connect Your Wallet</h1>
          <p className="text-gray-600 mb-8">Please connect your Farcaster wallet to configure tipping settings.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-8 bg-yellow-50 min-h-full">
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="text-center"
      >
        <div className="flex items-center justify-center mb-4">
          <SettingsIcon className="w-8 h-8 text-accent mr-3" />
          <h1 className="text-2xl font-bold text-accent">Settings</h1>
        </div>
        <p className="text-xl text-gray-700">
          Configure your reverse tipping preferences
        </p>
      </motion.div>

      {/* Connected Wallet Info */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="bg-white rounded-2xl p-6 card-shadow mb-8"
      >
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-gray-600">Connected Wallet</p>
            <p className="font-mono font-semibold">
              {address.slice(0, 6)}...{address.slice(-4)}
            </p>
          </div>
        </div>
      </motion.div>

      {/* Tab Navigation */}
      <div className="flex space-x-1 mb-8 bg-gray-100 p-1 rounded-lg">
        <button
          onClick={() => setActiveTab('amounts')}
          className={`flex-1 py-2 px-4 rounded-md text-sm font-medium transition-colors ${
            activeTab === 'amounts'
              ? 'bg-white text-accent shadow-sm'
              : 'text-gray-600 hover:text-gray-900'
          }`}
        >
          <DollarSign className="w-4 h-4 inline mr-2" />
          Set Tipping Amount
        </button>
        <button
          onClick={() => setActiveTab('criteria')}
          className={`flex-1 py-2 px-4 rounded-md text-sm font-medium transition-colors ${
            activeTab === 'criteria'
              ? 'bg-white text-accent shadow-sm'
              : 'text-gray-600 hover:text-gray-900'
          }`}
        >
          <Shield className="w-4 h-4 inline mr-2" />
          Set Criteria
        </button>
        <button
          onClick={() => setActiveTab('allowance')}
          className={`flex-1 py-2 px-4 rounded-md text-sm font-medium transition-colors ${
            activeTab === 'allowance'
              ? 'bg-white text-accent shadow-sm'
              : 'text-gray-600 hover:text-gray-900'
          }`}
        >
          <Users className="w-4 h-4 inline mr-2" />
          Approve Allowance
        </button>
      </div>

      {/* Tab Content */}
      <motion.div
        key={activeTab}
        initial={{ opacity: 0, x: 20 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.2 }}
      >
        {/* Set Tipping Amount Tab */}
        {activeTab === 'amounts' && (
          <div className="bg-white rounded-2xl p-8 card-shadow">
            <h2 className="text-xl font-bold text-gray-900 mb-6">Set Tipping Amounts</h2>
            
            <div className="space-y-6">
              {[
                { key: 'like', label: 'Like', icon: Heart, default: '0.01' },
                { key: 'reply', label: 'Reply', icon: MessageCircle, default: '0.025' },
                { key: 'recast', label: 'Recast', icon: Repeat, default: '0.025' },
                { key: 'quote', label: 'Quote Cast', icon: Quote, default: '0.025' },
                { key: 'follow', label: 'Follow', icon: UserPlus, default: '0' },
              ].map(({ key, label, icon: Icon, default: defaultAmount }) => (
                <div key={key} className="flex items-center justify-between p-4 border border-gray-200 rounded-lg">
                  <div className="flex items-center space-x-3">
                    <Icon className="w-5 h-5 text-gray-600" />
                    <span className="font-medium">{label}</span>
                  </div>
                  <div className="flex items-center space-x-3">
                    <input
                      type="number"
                      step="0.001"
                      min="0"
                      value={tippingAmounts[key as keyof typeof tippingAmounts]}
                      onChange={(e) => setTippingAmounts(prev => ({ ...prev, [key]: e.target.value }))}
                      className="w-24 px-3 py-1 border border-gray-300 rounded text-sm"
                      placeholder={defaultAmount}
                    />
                    <span className="text-sm text-gray-600">USDC</span>
                    <button
                      onClick={() => setTippingToggles(prev => ({ ...prev, [key]: !prev[key as keyof typeof tippingToggles] }))}
                      className={`w-8 h-8 rounded-full flex items-center justify-center ${
                        tippingToggles[key as keyof typeof tippingToggles]
                          ? 'bg-green-500 text-white'
                          : 'bg-gray-200 text-gray-600'
                      }`}
                    >
                      {tippingToggles[key as keyof typeof tippingToggles] ? <Check className="w-4 h-4" /> : <X className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-8 pt-6 border-t border-gray-200">
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium text-gray-700">Maximum Spending Limit (USDC)</label>
                <input
                  type="number"
                  step="0.1"
                  min="0"
                  value={spendingLimit}
                  onChange={(e) => setSpendingLimitValue(e.target.value)}
                  className="w-32 px-3 py-2 border border-gray-300 rounded text-sm"
                  placeholder="0"
                />
              </div>
            </div>

            <button
              onClick={handleSaveTippingConfig}
              disabled={isSettingConfig}
              className="w-full mt-6 bg-accent text-white py-3 px-4 rounded-lg font-medium hover:bg-accent/90 transition-colors disabled:opacity-50"
            >
              {isSettingConfig ? 'Saving...' : 'Save Configuration'}
            </button>
          </div>
        )}

        {/* Set Criteria Tab */}
        {activeTab === 'criteria' && (
          <div className="bg-white rounded-2xl p-8 card-shadow">
            <h2 className="text-xl font-bold text-gray-900 mb-6">Set Tipping Criteria</h2>
            
            <div className="space-y-6">
              {/* Audience Selection */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-3">Who can receive tips?</label>
                <div className="grid grid-cols-3 gap-3">
                  {[
                    { value: 0, label: 'Following', desc: 'Only users you follow' },
                    { value: 1, label: 'Followers', desc: 'Only your followers' },
                    { value: 2, label: 'Anyone', desc: 'Any Farcaster user' },
                  ].map(({ value, label, desc }) => (
                    <button
                      key={value}
                      onClick={() => setCriteria(prev => ({ ...prev, audience: value }))}
                      className={`p-4 border-2 rounded-lg text-center transition-colors ${
                        criteria.audience === value
                          ? 'border-accent bg-accent/5 text-accent'
                          : 'border-gray-200 hover:border-gray-300'
                      }`}
                    >
                      <div className="font-medium">{label}</div>
                      <div className="text-xs text-gray-600 mt-1">{desc}</div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Minimum Follower Count */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Minimum Follower Count: {criteria.minFollowerCount}
                </label>
                <input
                  type="range"
                  min="0"
                  max="1000"
                  step="25"
                  value={criteria.minFollowerCount}
                  onChange={(e) => setCriteria(prev => ({ ...prev, minFollowerCount: parseInt(e.target.value) }))}
                  className="w-full"
                />
                <div className="flex justify-between text-xs text-gray-500 mt-1">
                  <span>0</span>
                  <span>1000</span>
                </div>
              </div>

              {/* Minimum Neynar Score */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Minimum Neynar Score: {criteria.minNeynarScore.toFixed(1)}
                </label>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.1"
                  value={criteria.minNeynarScore}
                  onChange={(e) => setCriteria(prev => ({ ...prev, minNeynarScore: parseFloat(e.target.value) }))}
                  className="w-full"
                />
                <div className="flex justify-between text-xs text-gray-500 mt-1">
                  <span>0.0</span>
                  <span>1.0</span>
                </div>
              </div>
            </div>

            <button
              onClick={handleSaveTippingConfig}
              disabled={isSettingConfig}
              className="w-full mt-6 bg-accent text-white py-3 px-4 rounded-lg font-medium hover:bg-accent/90 transition-colors disabled:opacity-50"
            >
              {isSettingConfig ? 'Saving...' : 'Save Criteria'}
            </button>
          </div>
        )}

        {/* Approve Allowance Tab */}
        {activeTab === 'allowance' && (
          <div className="bg-white rounded-2xl p-8 card-shadow">
            <h2 className="text-xl font-bold text-gray-900 mb-6">Approve Token Allowance</h2>
            
            <div className="space-y-6">
              {/* Token Selection */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Token</label>
                <div className="flex space-x-3">
                  <input
                    type="text"
                    value={customTokenAddress}
                    onChange={(e) => setCustomTokenAddress(e.target.value)}
                    placeholder="Paste token address or search"
                    className="flex-1 px-3 py-2 border border-gray-300 rounded text-sm"
                  />
                  <button
                    onClick={() => {
                      setSelectedToken('0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913');
                      setCustomTokenAddress('0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913');
                    }}
                    className="px-4 py-2 bg-blue-600 text-white rounded text-sm hover:bg-blue-700"
                  >
                    Choose USDC
                  </button>
                </div>
                {selectedToken === '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913' && (
                  <p className="text-sm text-gray-600 mt-2">USDC on Base</p>
                )}
              </div>

              {/* Allowance Amount */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Allowance Amount (USDC)</label>
                <input
                  type="number"
                  step="0.1"
                  min="0"
                  value={allowanceAmount}
                  onChange={(e) => setAllowanceAmount(e.target.value)}
                  placeholder="Enter amount to approve"
                  className="w-full px-3 py-2 border border-gray-300 rounded text-sm"
                />
              </div>

              {/* Current Allowance */}
              {tokenAllowance && (
                <div className="p-4 bg-gray-50 rounded-lg">
                  <p className="text-sm text-gray-600">Current Allowance</p>
                  <p className="text-lg font-semibold">{formatAmount(tokenAllowance)} USDC</p>
                </div>
              )}

              {/* Action Buttons */}
              <div className="flex space-x-3">
                <button
                  onClick={handleApproveAllowance}
                  disabled={isApproving || !allowanceAmount}
                  className="flex-1 bg-green-600 text-white py-3 px-4 rounded-lg font-medium hover:bg-green-700 transition-colors disabled:opacity-50"
                >
                  {isApproving ? 'Approving...' : 'Approve'}
                </button>
                <button
                  onClick={handleRevokeAllowance}
                  disabled={isRevokingAllowance || !tokenAllowance || tokenAllowance === '0'}
                  className="flex-1 bg-red-600 text-white py-3 px-4 rounded-lg font-medium hover:bg-red-700 transition-colors disabled:opacity-50"
                >
                  {isRevokingAllowance ? 'Revoking...' : 'Revoke'}
                </button>
              </div>
            </div>
          </div>
        )}
      </motion.div>

      {/* Deactivate Configuration */}
      {userConfig && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="mt-8 text-center"
        >
          <button
            onClick={handleRevokeConfig}
            disabled={isRevoking}
            className="text-red-600 hover:text-red-700 text-sm font-medium transition-colors disabled:opacity-50"
          >
            {isRevoking ? 'Deactivating...' : 'Deactivate Tipping Configuration'}
          </button>
        </motion.div>
      )}
    </div>
  );
}