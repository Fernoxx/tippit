import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import LoadingSpinner from '@/components/LoadingSpinner';
import { useEcion } from '@/hooks/usePIT';
import { formatAmount } from '@/utils/contracts';
import toast from 'react-hot-toast';
import {
  DollarSign,
  Shield,
  Users,
  Heart,
  MessageCircle,
  Repeat,
  UserPlus,
  Check,
  X,
  ChevronDown,
} from 'lucide-react';

const BACKEND_URL = (process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:3001').replace(/\/$/, '');

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
    fetchTokenAllowance,
    isSettingConfig,
    isApproving,
    isRevokingAllowance,
    isUpdatingLimit,
    isRevoking,
  } = useEcion();

  const [mounted, setMounted] = useState(false);
  const [activeTab, setActiveTab] = useState<'amounts' | 'criteria' | 'allowance'>('allowance');
  
  // Form states
  const [allowanceAmount, setAllowanceAmount] = useState('');
  const [selectedToken, setSelectedToken] = useState(''); // Will be set from userConfig
  const [customTokenAddress, setCustomTokenAddress] = useState('');
  const [tokenName, setTokenName] = useState('');
  const [showTokenDropdown, setShowTokenDropdown] = useState(false);
  const [isValidToken, setIsValidToken] = useState(true);
  const [amountErrors, setAmountErrors] = useState<{[key: string]: string}>({});
  const [isApprovingLocal, setIsApprovingLocal] = useState(false);
  const [isRevokingLocal, setIsRevokingLocal] = useState(false);
  
  // Validate tip amount (minimum $0.005)
  const validateAmount = (value: string, key: string) => {
    const numValue = parseFloat(value);
    if (numValue < 0.005) {
      setAmountErrors(prev => ({ ...prev, [key]: 'Must be $0.005 or more' }));
      return false;
    } else {
      setAmountErrors(prev => {
        const newErrors = { ...prev };
        delete newErrors[key];
        return newErrors;
      });
      return true;
    }
  };
  
  const [tippingAmounts, setTippingAmounts] = useState({
    like: '0.005',
    reply: '0.025',
    recast: '0.025',
    follow: '0',
  });
  const [tippingToggles, setTippingToggles] = useState({
    like: true,
    reply: true,
    recast: true,
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
      setTippingAmounts({
        like: userConfig.likeAmount?.toString() || '0.005',
        reply: userConfig.replyAmount?.toString() || '0.025',
        recast: userConfig.recastAmount?.toString() || '0.025',
        follow: userConfig.followAmount?.toString() || '0',
      });
      setTippingToggles({
        like: userConfig.likeEnabled ?? true,
        reply: userConfig.replyEnabled ?? true,
        recast: userConfig.recastEnabled ?? true,
        follow: userConfig.followEnabled ?? false,
      });
      setCriteria({
        audience: userConfig.audience || 0,
        minFollowerCount: userConfig.minFollowerCount || 25,
        minNeynarScore: userConfig.minNeynarScore || 0.5,
      });
      
      // CRITICAL FIX: Always load user's saved token, don't default to USDC
      const userTokenAddress = userConfig.tokenAddress || '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
      console.log('🔍 Loading user token from config:', userTokenAddress);
      setSelectedToken(userTokenAddress);
      setCustomTokenAddress(userTokenAddress);
      
      // Lookup token name for the user's saved token
      lookupTokenName(userTokenAddress);
    } else {
      // Only set USDC as default if no user config exists yet
      const defaultToken = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
      setSelectedToken(defaultToken);
      setCustomTokenAddress(defaultToken);
      setTokenName('USDC');
      console.log('🔍 No user config, setting default USDC token');
    }
  }, [userConfig]);

  const lookupTokenName = async (tokenAddress: string) => {
    try {
      // Check if it's USDC on Base
      if (tokenAddress.toLowerCase() === '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913') {
        setTokenName('USDC');
        setIsValidToken(true);
        return 'USDC';
      }
      
      // Use a free token lookup service
      try {
        // Try CoinGecko for Base network tokens
        const response = await fetch(`https://api.coingecko.com/api/v3/coins/base/contract/${tokenAddress}`);
        if (response.ok) {
          const data = await response.json();
          const name = data.symbol?.toUpperCase() || 'Unknown Token';
          setTokenName(name);
          setIsValidToken(true);
          return name;
        }
      } catch (cgError) {
        console.log('CoinGecko lookup failed, trying fallback...');
      }
      
      // Fallback: Try to get token info from contract directly using our backend
      try {
        const response = await fetch(`${BACKEND_URL}/api/token-info/${tokenAddress}`);
        if (response.ok) {
          const data = await response.json();
          const name = data.symbol || 'Unknown Token';
          setTokenName(name);
          setIsValidToken(name !== 'Unknown Token');
          return name;
        }
      } catch (backendError) {
        console.log('Backend token lookup failed');
      }
      
      setTokenName('Invalid Token');
      setIsValidToken(false);
      return 'Invalid Token';
    } catch (error) {
      console.error('Token lookup failed:', error);
      setTokenName('Invalid Token');
      setIsValidToken(false);
      return 'Invalid Token';
    }
  };

  const handleTokenAddressChange = async (newAddress: string) => {
    setCustomTokenAddress(newAddress);
    if (newAddress && newAddress.length === 42 && newAddress.startsWith('0x')) {
      setSelectedToken(newAddress);
      await lookupTokenName(newAddress);
      await fetchTokenAllowance(newAddress);
    }
  };

  // Fetch allowance on component mount and token change
  useEffect(() => {
    if (address && selectedToken) {
      fetchTokenAllowance(selectedToken);
    }
  }, [address, selectedToken]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = () => setShowTokenDropdown(false);
    if (showTokenDropdown) {
      document.addEventListener('click', handleClickOutside);
      return () => document.removeEventListener('click', handleClickOutside);
    }
  }, [showTokenDropdown]);

  const handleSaveTippingConfig = async () => {
    if (!address) {
      toast.error('Please connect your wallet first', { duration: 2000 });
      return;
    }

    // Check for validation errors
    const hasErrors = Object.keys(amountErrors).some(key => amountErrors[key]);
    if (hasErrors) {
      toast.error('Please fix tip amount errors before saving', { duration: 2000 });
      return;
    }

    try {
      await setTippingConfig({
        tokenAddress: selectedToken,
        likeAmount: tippingAmounts.like,
        replyAmount: tippingAmounts.reply,
        recastAmount: tippingAmounts.recast,
        followAmount: tippingAmounts.follow,
        spendingLimit: '999999', // No limit - controlled by token approvals
        audience: criteria.audience,
        minFollowerCount: criteria.minFollowerCount,
        minNeynarScore: criteria.minNeynarScore,
        likeEnabled: tippingToggles.like,
        replyEnabled: tippingToggles.reply,
        recastEnabled: tippingToggles.recast,
        followEnabled: tippingToggles.follow,
        isActive: true,
        totalSpent: userConfig?.totalSpent || '0'
      });
      toast.success('Tipping configuration saved!', { duration: 2000 });
    } catch (error: any) {
      toast.error('Failed to save configuration: ' + error.message, { duration: 2000 });
    }
  };

  const handleApproveAllowance = async () => {
    if (!address) {
      toast.error('Please connect your wallet first', { duration: 2000 });
      return;
    }

    if (!allowanceAmount || allowanceAmount === '0') {
      toast.error('Please enter an allowance amount', { duration: 2000 });
      return;
    }

    try {
      setIsApprovingLocal(true);
      await approveToken(selectedToken, allowanceAmount);
    } catch (error: any) {
      toast.error('Failed to approve allowance: ' + error.message, { duration: 2000 });
    } finally {
      setIsApprovingLocal(false);
    }
  };

  const handleRevokeAllowance = async () => {
    if (!address) {
      toast.error('Please connect your wallet first', { duration: 2000 });
      return;
    }

    try {
      setIsRevokingLocal(true);
      await revokeTokenAllowance(selectedToken);
    } catch (error: any) {
      toast.error('Failed to revoke allowance: ' + error.message, { duration: 2000 });
    } finally {
      setIsRevokingLocal(false);
    }
  };

  const handleRevokeConfig = async () => {
    if (!address) {
      toast.error('Please connect your wallet first', { duration: 2000 });
      return;
    }

    if (confirm('Are you sure you want to deactivate your tipping configuration?')) {
      try {
        await revokeConfig();
        toast.success('Tipping configuration deactivated', { duration: 2000 });
      } catch (error: any) {
        toast.error('Failed to deactivate configuration: ' + error.message, { duration: 2000 });
      }
    }
  };

  if (!mounted) {
    return (
      <div className="min-h-screen bg-yellow-50 flex items-center justify-center">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  if (!address) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-8 bg-yellow-50 min-h-full">
        <div className="text-center py-12">
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
        className="text-center mb-6"
      >
        <p className="text-xl text-gray-700">
          Configure your tipping preferences
        </p>
      </motion.div>

      {/* Tab Navigation */}
      <div className="flex space-x-1 mb-8 bg-gray-100 p-1 rounded-lg">
        <button
          onClick={() => setActiveTab('allowance')}
          className={`flex-1 py-2 px-4 rounded-md text-sm font-medium transition-colors ${
            activeTab === 'allowance'
              ? 'bg-white text-accent shadow-sm'
              : 'text-gray-600 hover:text-gray-900'
          }`}
        >
          Approve Allowance
        </button>
        <button
          onClick={() => setActiveTab('amounts')}
          className={`flex-1 py-2 px-4 rounded-md text-sm font-medium transition-colors ${
            activeTab === 'amounts'
              ? 'bg-white text-accent shadow-sm'
              : 'text-gray-600 hover:text-gray-900'
          }`}
        >
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
          Set Criteria
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
                { key: 'like', label: 'Like', icon: Heart, default: '0.005' },
                { key: 'reply', label: 'Reply', icon: MessageCircle, default: '0.025' },
                { key: 'recast', label: 'Recast', icon: Repeat, default: '0.025' },
                { key: 'follow', label: 'Follow', icon: UserPlus, default: '0' },
              ].map(({ key, label, icon: Icon, default: defaultAmount }) => (
                <div key={key} className="border border-gray-200 rounded-lg p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-3">
                      <Icon className="w-5 h-5 text-gray-600" />
                      <span className="font-medium">{label}</span>
                    </div>
                    <button
                      onClick={() => setTippingToggles(prev => ({ ...prev, [key]: !prev[key as keyof typeof tippingToggles] }))}
                      className={`relative w-11 h-6 rounded-full transition-colors ${
                        tippingToggles[key as keyof typeof tippingToggles]
                          ? 'bg-yellow-400'
                          : 'bg-gray-300'
                      }`}
                    >
                      <span
                        className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow-md transition-transform ${
                          tippingToggles[key as keyof typeof tippingToggles] ? 'left-5' : 'left-0.5'
                        }`}
                      />
                    </button>
                  </div>
                  <div className="flex items-center space-x-2 mt-2">
                    <input
                      type="number"
                      step="0.001"
                      min="0.005"
                      value={tippingAmounts[key as keyof typeof tippingAmounts]}
                      onChange={(e) => {
                        setTippingAmounts(prev => ({ ...prev, [key]: e.target.value }));
                        validateAmount(e.target.value, key);
                      }}
                      className={`w-20 px-2 py-1 border rounded text-sm ${
                        amountErrors[key] ? 'border-red-500' : 'border-gray-300'
                      }`}
                      placeholder={defaultAmount}
                    />
                    <span className="text-sm text-gray-600">{tokenName}</span>
                  </div>
                  {amountErrors[key] && (
                    <div className="text-red-500 text-xs mt-1">
                      {amountErrors[key]}
                    </div>
                  )}
                </div>
              ))}
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
                      className={`p-3 border-2 rounded-lg text-center transition-colors ${
                        criteria.audience === value
                          ? 'border-accent bg-accent/5 text-accent'
                          : 'border-gray-200 hover:border-gray-300'
                      }`}
                    >
                      <div className="font-medium text-sm leading-tight">{label}</div>
                      <div className="text-xs text-gray-600 mt-1 leading-tight">{desc}</div>
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
                  Minimum Neynar Score: {criteria.minNeynarScore.toFixed(2)}
                </label>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.05"
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
                <div className="relative">
                  <input
                    type="text"
                    value={customTokenAddress}
                    onChange={(e) => handleTokenAddressChange(e.target.value)}
                    placeholder="Token address"
                    className={`w-full px-3 py-2 pr-20 border rounded text-sm ${
                      isValidToken ? 'border-gray-300' : 'border-red-300 bg-red-50'
                    }`}
                  />
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setShowTokenDropdown(!showTokenDropdown);
                    }}
                    className="absolute right-2 top-1/2 transform -translate-y-1/2 px-2 py-1 text-sm text-gray-600 hover:text-gray-900 flex items-center"
                  >
                    {tokenName} <ChevronDown className="w-3 h-3 ml-1" />
                  </button>
                  
                  {showTokenDropdown && (
                    <div className="absolute z-10 w-full mt-1 bg-white border border-gray-300 rounded-md shadow-lg">
                      <button
                        onClick={() => {
                          handleTokenAddressChange('0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913');
                          setShowTokenDropdown(false);
                        }}
                        className="w-full px-3 py-2 text-left text-sm hover:bg-gray-50 flex justify-between items-center"
                      >
                        <span>USDC (Base)</span>
                        <span className="text-xs text-gray-500">0x833...913</span>
                      </button>
                    </div>
                  )}
                </div>
                <p className={`text-sm mt-2 ${isValidToken ? 'text-gray-600' : 'text-red-600'}`}>
                  {isValidToken ? `${tokenName} on Base` : 'Invalid token address'}
                </p>
              </div>


              {/* Allowance Amount */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Allowance Amount ({tokenName})</label>
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
                  <p className="text-lg font-semibold">{formatAmount(tokenAllowance)} {tokenName}</p>
                </div>
              )}

              {/* Action Buttons */}
              <div className="flex space-x-3">
                <button
                  onClick={handleApproveAllowance}
                  disabled={isApprovingLocal || isApproving || !allowanceAmount || !isValidToken}
                  className="flex-1 border-2 border-green-600 text-green-600 py-3 px-4 rounded-lg font-medium hover:bg-green-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
                >
                  {isApprovingLocal || isApproving ? (
                    <div className="animate-spin rounded-full h-5 w-5 border-2 border-green-600 border-t-transparent"></div>
                  ) : (
                    'Approve'
                  )}
                </button>
                <button
                  onClick={handleRevokeAllowance}
                  disabled={isRevokingLocal || isRevokingAllowance || !tokenAllowance || tokenAllowance === '0'}
                  className="flex-1 border-2 border-red-600 text-red-600 py-3 px-4 rounded-lg font-medium hover:bg-red-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
                >
                  {isRevokingLocal || isRevokingAllowance ? (
                    <div className="animate-spin rounded-full h-5 w-5 border-2 border-red-600 border-t-transparent"></div>
                  ) : (
                    'Revoke'
                  )}
                </button>
              </div>
            </div>
          </div>
        )}
      </motion.div>

      {/* Embed Test Component */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="mt-8"
      >
      </motion.div>

    </div>
  );
}