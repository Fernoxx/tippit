import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useEcion } from '@/hooks/usePIT';
import { formatAmount } from '@/utils/contracts';
import toast from 'react-hot-toast';
import FarcasterAuth from '@/components/FarcasterAuth';
import {
  ChevronDown,
  DollarSign,
  Shield,
  Heart,
  MessageCircle,
  Repeat,
  Quote,
  UserPlus,
  Users,
  Wallet,
  AlertCircle,
  Check,
  X,
  Settings as SettingsIcon,
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
  const [expandedCard, setExpandedCard] = useState<string | null>(null);
  
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
  const [actionEnabled, setActionEnabled] = useState({
    like: true,
    reply: true,
    recast: true,
    quote: true,
    follow: false,
  });
  const [selectedAudience, setSelectedAudience] = useState(2); // Default to "Anyone" (2)
  const [minFollowerCount, setMinFollowerCount] = useState(25); // Default 25 followers
  const [minNeynarScore, setMinNeynarScore] = useState(0.5); // Default 0.5 Neynar score

  // Token balance will be fetched from backend via useEcion hook

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
      setActionEnabled({
        like: userConfig.likeEnabled,
        reply: userConfig.replyEnabled,
        recast: userConfig.recastEnabled,
        quote: userConfig.quoteEnabled,
        follow: userConfig.followEnabled,
      });
      setSelectedAudience(userConfig.audience);
      setMinFollowerCount(Number(userConfig.minFollowerCount));
      setMinNeynarScore(Number(userConfig.minNeynarScore));
    }
  }, [userConfig]);

  if (!mounted) return null;

  if (!address) {
    return (
      <div className="text-center py-12">
        <AlertCircle className="w-16 h-16 text-gray-400 mx-auto mb-4" />
        <h2 className="text-xl font-medium text-gray-900 mb-2">Connect Your Wallet</h2>
        <p className="text-gray-600">Please connect your wallet to access settings</p>
      </div>
    );
  }

  const handleSaveTippingConfig = async () => {
    try {
      const tokenAddress = selectedToken === 'custom' ? customTokenAddress : selectedToken;
      
      await setTippingConfig?.({
        tokenAddress,
        likeAmount: tippingAmounts.like,
        replyAmount: tippingAmounts.reply,
        recastAmount: tippingAmounts.recast,
        quoteAmount: tippingAmounts.quote,
        followAmount: tippingAmounts.follow,
        spendingLimit,
        audience: selectedAudience,
        minFollowerCount,
        minNeynarScore,
        likeEnabled: actionEnabled.like,
        replyEnabled: actionEnabled.reply,
        recastEnabled: actionEnabled.recast,
        quoteEnabled: actionEnabled.quote,
        followEnabled: actionEnabled.follow,
        isActive: true,
        totalSpent: userConfig?.totalSpent || '0',
      });
      toast.success('Tipping configuration saved!');
    } catch (error) {
      toast.error('Failed to save configuration');
    }
  };

  const handleApproveAllowance = async () => {
    if (!allowanceAmount) return;
    
    try {
      const tokenAddress = selectedToken === 'custom' ? customTokenAddress : selectedToken;
      
      await approveToken?.(tokenAddress, allowanceAmount);
      toast.success('Allowance approved successfully!');
      setAllowanceAmount('');
    } catch (error) {
      toast.error('Failed to approve allowance');
    }
  };

  const handleUpdateSpendingLimit = async () => {
    if (!userConfig) return;
    
    try {
      await setTippingConfig?.({
        ...userConfig,
        spendingLimit: spendingLimit
      });
      toast.success('Spending limit updated!');
    } catch (error) {
      toast.error('Failed to update spending limit');
    }
  };

  const handleRevokeTokenAllowance = async () => {
    if (confirm('Are you sure you want to revoke your token allowance? This will prevent the backend from spending your tokens.')) {
      try {
        const tokenAddress = selectedToken === 'custom' ? customTokenAddress : selectedToken;
        await revokeTokenAllowance?.(tokenAddress);
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

  const settingsCards = [
    {
      id: 'tipping',
      title: 'Configure Tipping',
      icon: DollarSign,
      content: (
        <div className="space-y-4">
          <div className="space-y-3">
            {[
              { key: 'like', icon: Heart, label: 'Per Like' },
              { key: 'reply', icon: MessageCircle, label: 'Per Reply' },
              { key: 'recast', icon: Repeat, label: 'Per Recast' },
              { key: 'quote', icon: Quote, label: 'Per Quote Cast' },
              { key: 'follow', icon: UserPlus, label: 'Per Follow' },
            ].map(({ key, icon: Icon, label }) => (
              <div key={key} className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <Icon className="w-4 h-4 text-gray-500" />
                  <span className="text-sm">{label}</span>
                </div>
                <div className="flex items-center space-x-2">
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
                    className="w-16 px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:border-gray-500"
                  />
                  <span className="text-xs text-gray-500">USDC</span>
                </div>
              </div>
            ))}
          </div>
          <div className="pt-4 border-t border-gray-200">
            <button
              onClick={handleSaveTippingConfig}
              disabled={isSettingConfig}
              className="w-full bg-gray-900 text-white py-2 px-4 rounded text-sm font-medium hover:bg-gray-800 transition-colors disabled:opacity-50"
            >
              {isSettingConfig ? 'Saving...' : 'Save Configuration'}
            </button>
          </div>
        </div>
      )
    },
    {
      id: 'programmatic',
      title: 'Allow Programmatic Tipping',
      icon: Shield,
      content: (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm">Enable automatic tipping</span>
            <button
              onClick={() => setActionEnabled({ ...actionEnabled, like: !actionEnabled.like })}
              className={`w-10 h-5 rounded-full transition-colors ${
                actionEnabled.like ? 'bg-green-500' : 'bg-gray-300'
              }`}
            >
              <div
                className={`w-4 h-4 bg-white rounded-full shadow-md transform transition-transform ${
                  actionEnabled.like ? 'translate-x-5' : 'translate-x-0.5'
                }`}
              />
            </button>
          </div>
          <p className="text-xs text-gray-500">
            Allow the system to automatically tip users based on your configured criteria
          </p>
        </div>
      )
    },
    {
      id: 'wallet',
      title: 'Configure ETH Tipping Wallet',
      icon: Wallet,
      content: (
        <div className="space-y-3">
          <div className="p-3 bg-gray-50 rounded">
            <p className="text-xs text-gray-600 mb-1">Current Wallet</p>
            <p className="text-sm font-medium">
              {address.slice(0, 6)}...{address.slice(-4)}
            </p>
          </div>
          <div className="space-y-2">
            <label className="block text-xs text-gray-600">Spending Limit (USDC)</label>
            <input
              type="number"
              value={spendingLimit}
              onChange={(e) => setSpendingLimitValue(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded focus:outline-none focus:border-gray-500"
              placeholder="100"
            />
          </div>
          <button
            onClick={handleUpdateSpendingLimit}
            disabled={isUpdatingLimit}
            className="w-full bg-gray-900 text-white py-2 px-4 rounded text-sm font-medium hover:bg-gray-800 transition-colors disabled:opacity-50"
          >
            {isUpdatingLimit ? 'Updating...' : 'Update Limit'}
          </button>
        </div>
      )
    },
    {
      id: 'super',
      title: 'Configure Super Tip',
      icon: DollarSign,
      content: (
        <div className="space-y-3">
          <div className="space-y-2">
            <label className="block text-xs text-gray-600">Super Tip Amount (USDC)</label>
            <input
              type="number"
              step="0.1"
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded focus:outline-none focus:border-gray-500"
              placeholder="1.0"
            />
          </div>
          <div className="space-y-2">
            <label className="block text-xs text-gray-600">Trigger Conditions</label>
            <div className="space-y-1">
              <label className="flex items-center space-x-2">
                <input type="checkbox" className="w-3 h-3" />
                <span className="text-xs">High engagement posts</span>
              </label>
              <label className="flex items-center space-x-2">
                <input type="checkbox" className="w-3 h-3" />
                <span className="text-xs">Viral content</span>
              </label>
            </div>
          </div>
        </div>
      )
    },
    {
      id: 'delegate',
      title: 'Delegate Tipping',
      icon: Users,
      content: (
        <div className="space-y-3">
          <div className="space-y-2">
            <label className="block text-xs text-gray-600">Delegate Address</label>
            <input
              type="text"
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded focus:outline-none focus:border-gray-500"
              placeholder="0x... (Optional)"
            />
          </div>
          <p className="text-xs text-gray-500">
            Allow another address to manage your tipping configuration
          </p>
        </div>
      )
    },
    {
      id: 'connected',
      title: 'Configure Connected Wallets',
      icon: Wallet,
      content: (
        <div className="space-y-3">
          <div className="space-y-2">
            <p className="text-xs text-gray-600">Connected Wallets</p>
            <div className="space-y-1">
              <div className="flex items-center justify-between p-2 bg-gray-50 rounded">
                <span className="text-sm font-medium">
                  {address.slice(0, 6)}...{address.slice(-4)}
                </span>
                <button className="text-xs text-red-600 hover:text-red-800">
                  Disconnect
                </button>
              </div>
            </div>
          </div>
        </div>
      )
    }
  ];

  return (
    <div className="space-y-8">

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
        </div>
        
        {userConfig && tokenBalance && tokenAllowance && (
          <div className="mt-4 pt-4 border-t border-gray-200">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <p className="text-sm text-gray-600">Allowance</p>
                <p className="text-lg font-bold text-accent">
                  {formatAmount(tokenAllowance)}
                </p>
              </div>
              <div>
                <p className="text-sm text-gray-600">Available to Tip</p>
                <p className="text-lg font-bold text-green-600">
                  {formatAmount(tokenBalance)}
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

      {/* Settings Cards */}
      <div className="space-y-4">
        {settingsCards.map((card) => (
          <div key={card.id} className="bg-white rounded-lg overflow-hidden card-shadow">
            <button
              onClick={() => setExpandedCard(expandedCard === card.id ? null : card.id)}
              className="w-full flex items-center justify-between p-4 hover:bg-gray-50 transition-colors"
            >
              <span className="font-medium text-gray-900">{card.title}</span>
              <ChevronDown 
                className={`w-4 h-4 text-gray-500 transition-transform ${
                  expandedCard === card.id ? 'rotate-180' : ''
                }`} 
              />
            </button>
            
            {expandedCard === card.id && (
              <div className="px-4 pb-4 border-t border-gray-100">
                {card.content}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Common Questions */}
      <div className="mt-8">
        <h3 className="text-sm font-medium text-gray-700 mb-3">Common Questions</h3>
        <div className="bg-white rounded-lg overflow-hidden card-shadow">
          <button
            onClick={() => setExpandedCard(expandedCard === 'faq' ? null : 'faq')}
            className="w-full flex items-center justify-between p-4 hover:bg-gray-50 transition-colors"
          >
            <span className="font-medium text-gray-900">How Tipping Works on Base vs Farcaster</span>
            <ChevronDown 
              className={`w-4 h-4 text-gray-500 transition-transform ${
                expandedCard === 'faq' ? 'rotate-180' : ''
              }`} 
            />
          </button>
          
          {expandedCard === 'faq' && (
            <div className="px-4 pb-4 border-t border-gray-100">
              <div className="text-sm text-gray-600 space-y-2">
                <p>Base and Farcaster use different tipping mechanisms:</p>
                <ul className="list-disc list-inside space-y-1 ml-4">
                  <li>Base: Direct ETH/USDC transfers</li>
                  <li>Farcaster: In-app tipping system</li>
                </ul>
                <p>Our platform bridges both systems for seamless tipping.</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}