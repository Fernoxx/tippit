import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useFarcasterWallet } from '@/hooks/useFarcasterWallet';
import { useFarcasterEmbed } from '@/hooks/useFarcasterEmbed';
import { useWalletClient, usePublicClient } from 'wagmi';
import { Gift, X, Check, Loader2, ExternalLink, Share2 } from 'lucide-react';

const DAILY_REWARDS_CONTRACT = '0x8e4f21A66E8F99FbF1A6FfBEc757547C11E8653E';

const CONTRACT_ABI = [
  {
    name: 'checkIn',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'ecionAmount', type: 'uint256' },
      { name: 'usdcAmount', type: 'uint256' },
      { name: 'isFollowing', type: 'bool' },
      { name: 'expiry', type: 'uint256' },
      { name: 'signature', type: 'bytes' }
    ],
    outputs: []
  }
] as const;

const BACKEND_URL = (process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:3001').replace(/\/$/, '');

// Token logos
const ECION_LOGO = '/ecion.jpg';
const USDC_LOGO = 'https://assets.coingecko.com/coins/images/6319/small/USD_Coin_icon.png';

interface PeriodStats {
  tips: number;
  usdc: number;
}

interface AdminStats {
  allTime: {
    totalTips: number;
    totalUsdcTipped: number;
    totalTransactions: number;
    uniqueTippers: number;
    uniqueEarners: number;
  };
  last24h: PeriodStats;
  last7d: PeriodStats;
  last30d: PeriodStats;
  timestamp?: string;
}

interface TokenReward {
  id: string;
  token: 'ecion' | 'usdc';
  name: string;
  logo: string;
  minAmount: number;
  maxAmount: number;
}

// Reward config per day - Updated USDC ranges
const DAY_REWARDS: Record<number, TokenReward[]> = {
  1: [
    { id: 'ecion-1', token: 'ecion', name: 'Ecion', logo: ECION_LOGO, minAmount: 1, maxAmount: 69 },
    { id: 'usdc-1', token: 'usdc', name: 'USDC', logo: USDC_LOGO, minAmount: 0.02, maxAmount: 0.06 }
  ],
  2: [
    { id: 'ecion-2', token: 'ecion', name: 'Ecion', logo: ECION_LOGO, minAmount: 69, maxAmount: 1000 }
  ],
  3: [
    { id: 'ecion-3', token: 'ecion', name: 'Ecion', logo: ECION_LOGO, minAmount: 1000, maxAmount: 5000 },
    { id: 'usdc-3', token: 'usdc', name: 'USDC', logo: USDC_LOGO, minAmount: 0.02, maxAmount: 0.12 }
  ],
  4: [
    { id: 'ecion-4', token: 'ecion', name: 'Ecion', logo: ECION_LOGO, minAmount: 5000, maxAmount: 10000 }
  ],
  5: [
    { id: 'ecion-5', token: 'ecion', name: 'Ecion', logo: ECION_LOGO, minAmount: 5000, maxAmount: 10000 },
    { id: 'usdc-5', token: 'usdc', name: 'USDC', logo: USDC_LOGO, minAmount: 0.02, maxAmount: 0.16 }
  ],
  6: [
    { id: 'ecion-6', token: 'ecion', name: 'Ecion', logo: ECION_LOGO, minAmount: 10000, maxAmount: 20000 }
  ],
  7: [
    { id: 'ecion-7', token: 'ecion', name: 'Ecion', logo: ECION_LOGO, minAmount: 10000, maxAmount: 20000 },
    { id: 'usdc-7', token: 'usdc', name: 'USDC', logo: USDC_LOGO, minAmount: 0.02, maxAmount: 0.20 }
  ]
};

// Seeded random - consistent result for same address + day
const seededRandom = (seed: string) => {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    const char = seed.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  const x = Math.sin(hash) * 10000;
  return x - Math.floor(x);
};

const getConsistentAmount = (address: string, day: number, rewardId: string, min: number, max: number, decimals: number = 0) => {
  const seed = `${address}-${day}-${rewardId}`;
  const rand = seededRandom(seed);
  const value = rand * (max - min) + min;
  return decimals > 0 ? parseFloat(value.toFixed(decimals)) : Math.floor(value);
};

interface BoxStatus {
  streak: number;
  claimedDays: number[];
  fid?: number;
}

interface RewardState {
  amount: number;
  needsVerify: boolean;
  claiming: boolean;
  claimed: boolean;
  error: string | null;
}

export default function Admin() {
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [password, setPassword] = useState('');
  const [authError, setAuthError] = useState<string | null>(null);
  
  const [boxStatus, setBoxStatus] = useState<BoxStatus | null>(null);
  const [boxLoading, setBoxLoading] = useState(false);
  const [selectedBox, setSelectedBox] = useState<number | null>(null);
  const [rewardStates, setRewardStates] = useState<Record<string, RewardState>>({});
  
  const { address, isConnected } = useFarcasterWallet();
  const { handleShare } = useFarcasterEmbed();
  const { data: walletClient } = useWalletClient();
  const publicClient = usePublicClient();

  const fetchAdminData = async () => {
    try {
      setIsLoading(true);
      const storedPassword = sessionStorage.getItem('admin_password');
      if (!storedPassword) {
        setIsAuthenticated(false);
        return;
      }
      
      const response = await fetch(`${BACKEND_URL}/api/admin/total-stats`, {
        headers: { 'x-admin-password': storedPassword }
      });
      
      if (!response.ok) {
        if (response.status === 401) setIsAuthenticated(false);
        return;
      }
      
      const data = await response.json();
      setStats(data.stats ?? data.data ?? data);
    } catch {
      // Error handling
    } finally {
      setIsLoading(false);
    }
  };

  const fetchBoxStatus = async () => {
    if (!address) return;
    try {
      setBoxLoading(true);
      const response = await fetch(`${BACKEND_URL}/api/daily-checkin/status?address=${address}`);
      const data = await response.json();
      if (data.success) {
        setBoxStatus({
          streak: data.streak || 1,
          claimedDays: data.claimedDays || [],
          fid: data.fid
        });
      }
    } catch {
      // Error handling
    } finally {
      setBoxLoading(false);
    }
  };

  const getCurrentDay = () => boxStatus?.streak || 1;
  
  const getBoxState = (day: number) => {
    if (!boxStatus) return 'locked';
    if (boxStatus.claimedDays?.includes(day)) return 'claimed';
    if (day === getCurrentDay()) return 'available';
    if (day < getCurrentDay()) return 'missed';
    return 'locked';
  };

  const handleBoxClick = useCallback((day: number) => {
    if (getBoxState(day) !== 'available' || !address) return;
    
    const rewards = DAY_REWARDS[day] || [];
    const initialStates: Record<string, RewardState> = {};
    
    rewards.forEach(reward => {
      const decimals = reward.token === 'usdc' ? 2 : 0;
      const amount = getConsistentAmount(address, day, reward.id, reward.minAmount, reward.maxAmount, decimals);
      initialStates[reward.id] = {
        amount,
        needsVerify: false,
        claiming: false,
        claimed: false,
        error: null
      };
    });
    
    setRewardStates(initialStates);
    setSelectedBox(day);
  }, [address, boxStatus]);

  // Claim reward - checks follow status, gets signature, calls contract
  const claimReward = async (rewardId: string, token: string) => {
    if (!address || !selectedBox || !walletClient) return;
    
    const state = rewardStates[rewardId];
    if (!state) return;
    
    setRewardStates(prev => ({
      ...prev,
      [rewardId]: { ...prev[rewardId], claiming: true, error: null }
    }));
    
    try {
      // First check if user follows @doteth
      const followCheck = await fetch(`${BACKEND_URL}/api/neynar/check-follow-by-address/${address}`);
      const followData = await followCheck.json();
      
      if (!followData.success || !followData.isFollowing) {
        setRewardStates(prev => ({
          ...prev,
          [rewardId]: { ...prev[rewardId], claiming: false, needsVerify: true, error: null }
        }));
        return;
      }
      
      // Check in first
      await fetch(`${BACKEND_URL}/api/daily-checkin/checkin`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address, dayNumber: selectedBox }),
      });
      
      // Get signature from backend
      const response = await fetch(`${BACKEND_URL}/api/daily-checkin/claim`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address, dayNumber: selectedBox, token, amount: state.amount }),
      });
      
      const data = await response.json();
      
      if (!data.success) {
        throw new Error(data.error || 'Failed to get claim signature');
      }
      
      // Call the contract with the signature
      const hash = await walletClient.writeContract({
        address: DAILY_REWARDS_CONTRACT as `0x${string}`,
        abi: CONTRACT_ABI,
        functionName: 'checkIn',
        args: [
          BigInt(data.ecionAmountWei),
          BigInt(data.usdcAmountWei),
          data.isFollowing,
          BigInt(data.expiry),
          data.signature as `0x${string}`
        ]
      });
      
      // Wait for transaction
      if (publicClient) {
        await publicClient.waitForTransactionReceipt({ hash });
      }
      
      setRewardStates(prev => ({
        ...prev,
        [rewardId]: { ...prev[rewardId], claiming: false, claimed: true }
      }));
      
      console.log(`✅ Claimed ${data.ecionAmount} ECION + $${data.usdcAmount} USDC - tx: ${hash}`);
    } catch (err: any) {
      console.error('Claim error:', err);
      setRewardStates(prev => ({
        ...prev,
        [rewardId]: { ...prev[rewardId], claiming: false, error: err.message || 'Claim failed' }
      }));
    }
  };

  // Verify follow and retry claim
  const verifyAndClaim = async (rewardId: string, token: string) => {
    if (!address || !walletClient) return;
    
    setRewardStates(prev => ({
      ...prev,
      [rewardId]: { ...prev[rewardId], claiming: true, error: null }
    }));
    
    try {
      const followCheck = await fetch(`${BACKEND_URL}/api/neynar/check-follow-by-address/${address}`);
      const followData = await followCheck.json();
      
      if (!followData.success || !followData.isFollowing) {
        setRewardStates(prev => ({
          ...prev,
          [rewardId]: { ...prev[rewardId], claiming: false, error: 'Still not following' }
        }));
        return;
      }
      
      // Now user follows - hide verify and proceed
      setRewardStates(prev => ({
        ...prev,
        [rewardId]: { ...prev[rewardId], needsVerify: false }
      }));
      
      // Proceed with contract claim
      await claimReward(rewardId, token);
    } catch {
      setRewardStates(prev => ({
        ...prev,
        [rewardId]: { ...prev[rewardId], claiming: false, error: 'Verification failed' }
      }));
    }
  };

  // Check if all rewards are claimed
  const allRewardsClaimed = useCallback(() => {
    if (!selectedBox) return false;
    const dayRewards = DAY_REWARDS[selectedBox] || [];
    return dayRewards.every(r => rewardStates[r.id]?.claimed);
  }, [selectedBox, rewardStates]);

  // Share claimed rewards
  const shareRewards = async () => {
    if (!selectedBox) return;
    
    const dayRewards = DAY_REWARDS[selectedBox] || [];
    const ecionReward = dayRewards.find(r => r.token === 'ecion');
    const usdcReward = dayRewards.find(r => r.token === 'usdc');
    
    const ecionAmount = ecionReward ? rewardStates[ecionReward.id]?.amount : 0;
    const usdcAmount = usdcReward ? rewardStates[usdcReward.id]?.amount : 0;
    
    // Build share text
    let rewardText = '';
    if (ecionAmount && usdcAmount) {
      rewardText = `${ecionAmount.toLocaleString()} $ECION and $${usdcAmount} USDC`;
    } else if (ecionAmount) {
      rewardText = `${ecionAmount.toLocaleString()} $ECION`;
    } else if (usdcAmount) {
      rewardText = `$${usdcAmount} USDC`;
    }
    
    const shareText = `🎁 Opened today's daily reward box and claimed ${rewardText} from @ecion`;
    const shareUrl = 'https://ecion.vercel.app';
    
    await handleShare(shareText, shareUrl);
  };

  useEffect(() => {
    const auth = sessionStorage.getItem('admin_authenticated');
    const pwd = sessionStorage.getItem('admin_password');
    if (auth === 'true' && pwd) {
      setIsAuthenticated(true);
      fetchAdminData();
    }
  }, []);

  useEffect(() => {
    if (isConnected && address && isAuthenticated) fetchBoxStatus();
  }, [isConnected, address, isAuthenticated]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const response = await fetch(`${BACKEND_URL}/api/admin/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      if (response.ok) {
        setIsAuthenticated(true);
        sessionStorage.setItem('admin_authenticated', 'true');
        sessionStorage.setItem('admin_password', password);
        fetchAdminData();
      } else {
        setAuthError('Incorrect password');
      }
    } catch {
      setAuthError('Connection failed');
    }
  };

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-yellow-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-xl shadow-lg p-6 w-full max-w-sm">
          <h1 className="text-2xl font-bold text-gray-900 mb-4 text-center">Admin Login</h1>
          <form onSubmit={handleLogin}>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-3 py-2 border rounded-lg mb-3 focus:ring-2 focus:ring-yellow-400 outline-none"
              placeholder="Password"
              autoFocus
            />
            {authError && <p className="text-red-500 text-sm mb-3">{authError}</p>}
            <button className="w-full bg-yellow-400 hover:bg-yellow-500 text-gray-900 font-medium py-2 rounded-lg">
              Login
            </button>
          </form>
        </div>
      </div>
    );
  }

  if (isLoading && !stats) {
    return (
      <div className="min-h-screen bg-yellow-50 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-yellow-500" />
      </div>
    );
  }

  const currentDayRewards = selectedBox ? DAY_REWARDS[selectedBox] || [] : [];

  return (
    <div className="min-h-screen bg-yellow-50 py-8">
      <div className="max-w-5xl mx-auto px-4">
        <h1 className="text-3xl font-bold text-gray-900 text-center mb-6">Admin Dashboard</h1>

        {/* Reward Boxes - Always visible */}
        <div className="flex justify-center mb-8">
          <div className="inline-flex gap-1.5 p-2 bg-white/80 rounded-xl shadow-sm">
            {[1, 2, 3, 4, 5, 6, 7].map((day) => {
              const state = getBoxState(day);
              const isClaimed = state === 'claimed';
              const isAvailable = state === 'available' && isConnected;
              
              return (
                <button
                  key={day}
                  onClick={() => handleBoxClick(day)}
                  disabled={!isAvailable}
                  className={`w-9 h-9 rounded-lg flex items-center justify-center transition-all relative
                    ${isClaimed 
                      ? 'bg-gray-100' 
                      : isAvailable 
                        ? 'bg-gradient-to-br from-amber-300 to-orange-300 shadow hover:scale-105' 
                        : 'bg-amber-100/60'}
                  `}
                >
                  {isAvailable && <div className="absolute inset-0 rounded-lg animate-soft-pulse" />}
                  <Gift className={`w-4 h-4 ${isClaimed ? 'text-gray-400' : isAvailable ? 'text-white' : 'text-amber-200'}`} />
                  {isClaimed && (
                    <div className="absolute -top-0.5 -right-0.5 w-3 h-3 bg-green-500 rounded-full flex items-center justify-center">
                      <Check className="w-2 h-2 text-white" />
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Claim Modal */}
        <AnimatePresence>
          {selectedBox !== null && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4"
              onClick={() => setSelectedBox(null)}
            >
              <motion.div
                initial={{ scale: 0.95 }}
                animate={{ scale: 1 }}
                exit={{ scale: 0.95 }}
                onClick={(e) => e.stopPropagation()}
                className="bg-white rounded-2xl shadow-xl w-full max-w-xs overflow-hidden"
              >
                <div className="flex justify-between items-center px-4 py-3">
                  <span className="font-semibold text-gray-900 text-sm">Claimable Tokens</span>
                  <button onClick={() => setSelectedBox(null)} className="text-gray-400 hover:text-gray-600">
                    <X className="w-4 h-4" />
                  </button>
                </div>
                
                <div className="px-4 pb-4 space-y-3">
                  {currentDayRewards.map((reward) => {
                    const state = rewardStates[reward.id];
                    if (!state) return null;
                    
                    return (
                      <div key={reward.id}>
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <img src={reward.logo} alt={reward.name} className="w-6 h-6 rounded-full bg-gray-100" />
                            <div className="text-sm">
                              <span className="font-medium text-gray-900">{reward.name}</span>
                              <span className="ml-1.5 text-gray-600">
                                {reward.token === 'usdc' ? `$${state.amount}` : state.amount.toLocaleString()}
                              </span>
                            </div>
                          </div>
                          
                          <div className="flex items-center gap-1.5">
                            {state.claimed ? (
                              <span className="text-green-600 text-xs font-medium flex items-center gap-1">
                                <Check className="w-3 h-3" /> Done
                              </span>
                            ) : state.needsVerify ? (
                              <button
                                onClick={() => verifyAndClaim(reward.id, reward.token)}
                                disabled={state.claiming}
                                className="px-2.5 py-1 text-[10px] font-medium rounded border border-green-400 text-green-600 hover:bg-green-50 transition-all"
                              >
                                {state.claiming ? <Loader2 className="w-2.5 h-2.5 animate-spin" /> : 'Verify'}
                              </button>
                            ) : (
                              <button
                                onClick={() => claimReward(reward.id, reward.token)}
                                disabled={state.claiming}
                                className="px-2.5 py-1 text-[10px] font-medium rounded border-2 border-green-400 text-green-600 hover:bg-green-50 transition-all"
                              >
                                {state.claiming ? <Loader2 className="w-2.5 h-2.5 animate-spin" /> : 'Claim'}
                              </button>
                            )}
                          </div>
                        </div>
                        
                        {state.needsVerify && !state.claimed && (
                          <a 
                            href="https://warpcast.com/doteth"
                            target="_blank" 
                            rel="noopener noreferrer" 
                            className="text-[10px] text-blue-500 hover:underline flex items-center gap-0.5 mt-1 ml-8"
                          >
                            Follow @doteth <ExternalLink className="w-2.5 h-2.5" />
                          </a>
                        )}
                        
                        {state.error && !state.claimed && (
                          <p className="text-[10px] text-red-500 mt-1 ml-8">{state.error}</p>
                        )}
                      </div>
                    );
                  })}
                  
                  {/* Share Button - Shows after all rewards claimed */}
                  {allRewardsClaimed() && (
                    <div className="pt-3 border-t border-gray-100">
                      <button
                        onClick={shareRewards}
                        className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg text-xs font-medium transition-all"
                      >
                        <Share2 className="w-3.5 h-3.5" />
                        Share
                      </button>
                    </div>
                  )}
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Stats */}
        {stats && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            {[
              { label: 'Total Tips', value: stats.allTime?.totalTips?.toLocaleString() || '0' },
              { label: 'USDC Tipped', value: `$${stats.allTime?.totalUsdcTipped?.toFixed(2) || '0'}` },
              { label: 'Transactions', value: stats.allTime?.totalTransactions?.toLocaleString() || '0' },
              { label: 'Tippers', value: stats.allTime?.uniqueTippers?.toLocaleString() || '0' },
            ].map((stat) => (
              <div key={stat.label} className="bg-white rounded-lg p-4 shadow-sm text-center">
                <p className="text-sm text-gray-500">{stat.label}</p>
                <p className="text-xl font-bold text-gray-900">{stat.value}</p>
              </div>
            ))}
          </div>
        )}

        <div className="text-center">
          <button
            onClick={fetchAdminData}
            disabled={isLoading}
            className="bg-yellow-400 hover:bg-yellow-500 text-gray-900 font-medium py-2 px-4 rounded-lg text-sm"
          >
            {isLoading ? 'Loading...' : 'Refresh'}
          </button>
        </div>
      </div>

      <style jsx>{`
        @keyframes soft-pulse {
          0%, 100% { box-shadow: 0 0 0 0 rgba(251, 191, 36, 0.4); }
          50% { box-shadow: 0 0 0 4px rgba(251, 191, 36, 0); }
        }
        .animate-soft-pulse { animation: soft-pulse 2s ease-in-out infinite; }
      `}</style>
    </div>
  );
}
