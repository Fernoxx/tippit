import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useFarcasterWallet } from '@/hooks/useFarcasterWallet';
import { Gift, X, Check, Loader2, ExternalLink } from 'lucide-react';

const BACKEND_URL = (process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:3001').replace(/\/$/, '');

// Token logos
const ECION_LOGO = 'https://imagedelivery.net/BXluQx4ige9GuW0Ia56BHw/26f0f5b4-a342-40a7-63a3-5fdca78a7300/rectcrop3';
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

// Task types that can be verified via Neynar
type TaskType = 'follow' | 'like' | 'recast' | 'channel';

interface Task {
  type: TaskType;
  target: string; // FID for follow, cast hash for like/recast, channel ID for channel
  label: string;
  link?: string;
}

// Token reward with its own task requirement
interface TokenReward {
  id: string;
  token: 'ecion' | 'usdc';
  name: string;
  logo: string;
  minAmount: number;
  maxAmount: number;
  task: Task;
}

// Define rewards for each day - each token has its own task
const DAY_REWARDS: Record<number, TokenReward[]> = {
  1: [
    {
      id: 'ecion-1',
      token: 'ecion',
      name: 'Ecion',
      logo: ECION_LOGO,
      minAmount: 1,
      maxAmount: 69,
      task: { type: 'follow', target: '242597', label: 'Follow @doteth', link: 'https://warpcast.com/doteth' }
    },
    {
      id: 'usdc-1',
      token: 'usdc',
      name: 'USDC',
      logo: USDC_LOGO,
      minAmount: 0.01,
      maxAmount: 0.20,
      task: { type: 'follow', target: '242597', label: 'Follow @doteth', link: 'https://warpcast.com/doteth' }
    }
  ],
  2: [
    {
      id: 'ecion-2',
      token: 'ecion',
      name: 'Ecion',
      logo: ECION_LOGO,
      minAmount: 69,
      maxAmount: 1000,
      task: { type: 'follow', target: '242597', label: 'Follow @doteth', link: 'https://warpcast.com/doteth' }
    }
  ],
  3: [
    {
      id: 'ecion-3',
      token: 'ecion',
      name: 'Ecion',
      logo: ECION_LOGO,
      minAmount: 1000,
      maxAmount: 5000,
      task: { type: 'follow', target: '242597', label: 'Follow @doteth', link: 'https://warpcast.com/doteth' }
    },
    {
      id: 'usdc-3',
      token: 'usdc',
      name: 'USDC',
      logo: USDC_LOGO,
      minAmount: 0.01,
      maxAmount: 0.20,
      task: { type: 'follow', target: '242597', label: 'Follow @doteth', link: 'https://warpcast.com/doteth' }
    }
  ],
  4: [
    {
      id: 'ecion-4',
      token: 'ecion',
      name: 'Ecion',
      logo: ECION_LOGO,
      minAmount: 5000,
      maxAmount: 10000,
      task: { type: 'follow', target: '242597', label: 'Follow @doteth', link: 'https://warpcast.com/doteth' }
    }
  ],
  5: [
    {
      id: 'ecion-5',
      token: 'ecion',
      name: 'Ecion',
      logo: ECION_LOGO,
      minAmount: 5000,
      maxAmount: 10000,
      task: { type: 'follow', target: '242597', label: 'Follow @doteth', link: 'https://warpcast.com/doteth' }
    },
    {
      id: 'usdc-5',
      token: 'usdc',
      name: 'USDC',
      logo: USDC_LOGO,
      minAmount: 0.01,
      maxAmount: 0.20,
      task: { type: 'follow', target: '242597', label: 'Follow @doteth', link: 'https://warpcast.com/doteth' }
    }
  ],
  6: [
    {
      id: 'ecion-6',
      token: 'ecion',
      name: 'Ecion',
      logo: ECION_LOGO,
      minAmount: 10000,
      maxAmount: 20000,
      task: { type: 'follow', target: '242597', label: 'Follow @doteth', link: 'https://warpcast.com/doteth' }
    }
  ],
  7: [
    {
      id: 'ecion-7',
      token: 'ecion',
      name: 'Ecion',
      logo: ECION_LOGO,
      minAmount: 10000,
      maxAmount: 20000,
      task: { type: 'follow', target: '242597', label: 'Follow @doteth', link: 'https://warpcast.com/doteth' }
    },
    {
      id: 'usdc-7',
      token: 'usdc',
      name: 'USDC',
      logo: USDC_LOGO,
      minAmount: 0.01,
      maxAmount: 0.20,
      task: { type: 'follow', target: '242597', label: 'Follow @doteth', link: 'https://warpcast.com/doteth' }
    }
  ]
};

const getRandomAmount = (min: number, max: number, decimals: number = 0) => {
  const value = Math.random() * (max - min) + min;
  return decimals > 0 ? parseFloat(value.toFixed(decimals)) : Math.floor(value);
};

interface BoxStatus {
  streak: number;
  claimedDays: number[];
  fid?: number;
}

interface RewardState {
  amount: number;
  verified: boolean;
  verifying: boolean;
  claiming: boolean;
  claimed: boolean;
  error: string | null;
}

export default function Admin() {
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [password, setPassword] = useState('');
  const [authError, setAuthError] = useState<string | null>(null);
  
  const [boxStatus, setBoxStatus] = useState<BoxStatus | null>(null);
  const [boxLoading, setBoxLoading] = useState(false);
  const [selectedBox, setSelectedBox] = useState<number | null>(null);
  
  // State for each reward's claim progress
  const [rewardStates, setRewardStates] = useState<Record<string, RewardState>>({});
  
  const { address, isConnected } = useFarcasterWallet();

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
    } catch (err) {
      setError('Failed to fetch data');
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
    } catch (err) {
      console.error(err);
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

  const handleBoxClick = (day: number) => {
    if (getBoxState(day) !== 'available') return;
    
    // Initialize reward states with random amounts
    const rewards = DAY_REWARDS[day] || [];
    const initialStates: Record<string, RewardState> = {};
    
    rewards.forEach(reward => {
      const decimals = reward.token === 'usdc' ? 2 : 0;
      initialStates[reward.id] = {
        amount: getRandomAmount(reward.minAmount, reward.maxAmount, decimals),
        verified: false,
        verifying: false,
        claiming: false,
        claimed: false,
        error: null
      };
    });
    
    setRewardStates(initialStates);
    setSelectedBox(day);
  };

  // Verify task completion for a specific reward
  const verifyTask = async (rewardId: string, task: Task) => {
    if (!address) return;
    
    setRewardStates(prev => ({
      ...prev,
      [rewardId]: { ...prev[rewardId], verifying: true, error: null }
    }));
    
    try {
      let verified = false;
      
      switch (task.type) {
        case 'follow': {
          const response = await fetch(`${BACKEND_URL}/api/neynar/check-follow-by-address/${address}`);
          const data = await response.json();
          verified = data.success && data.isFollowing;
          break;
        }
        case 'like': {
          // First get user FID, then check like
          const fidResponse = await fetch(`${BACKEND_URL}/api/neynar/check-follow-by-address/${address}`);
          const fidData = await fidResponse.json();
          if (fidData.userFid) {
            const likeResponse = await fetch(`${BACKEND_URL}/api/neynar/check-like/${task.target}/${fidData.userFid}`);
            const likeData = await likeResponse.json();
            verified = likeData.success && likeData.hasLiked;
          }
          break;
        }
        case 'recast': {
          const fidResponse = await fetch(`${BACKEND_URL}/api/neynar/check-follow-by-address/${address}`);
          const fidData = await fidResponse.json();
          if (fidData.userFid) {
            const recastResponse = await fetch(`${BACKEND_URL}/api/neynar/check-recast/${task.target}/${fidData.userFid}`);
            const recastData = await recastResponse.json();
            verified = recastData.success && recastData.hasRecasted;
          }
          break;
        }
        case 'channel': {
          const fidResponse = await fetch(`${BACKEND_URL}/api/neynar/check-follow-by-address/${address}`);
          const fidData = await fidResponse.json();
          if (fidData.userFid) {
            const channelResponse = await fetch(`${BACKEND_URL}/api/neynar/check-channel/${task.target}/${fidData.userFid}`);
            const channelData = await channelResponse.json();
            verified = channelData.success && channelData.isMember;
          }
          break;
        }
      }
      
      setRewardStates(prev => ({
        ...prev,
        [rewardId]: { ...prev[rewardId], verified, verifying: false, error: verified ? null : 'Complete task first' }
      }));
    } catch (err) {
      setRewardStates(prev => ({
        ...prev,
        [rewardId]: { ...prev[rewardId], verifying: false, error: 'Verification failed' }
      }));
    }
  };

  // Claim a specific token reward
  const claimReward = async (rewardId: string, token: string) => {
    if (!address || !selectedBox) return;
    
    const state = rewardStates[rewardId];
    if (!state?.verified) {
      setRewardStates(prev => ({
        ...prev,
        [rewardId]: { ...prev[rewardId], error: 'Verify first' }
      }));
      return;
    }
    
    setRewardStates(prev => ({
      ...prev,
      [rewardId]: { ...prev[rewardId], claiming: true, error: null }
    }));
    
    try {
      // Check in first
      await fetch(`${BACKEND_URL}/api/daily-checkin/checkin`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address, dayNumber: selectedBox }),
      });
      
      // Claim
      const response = await fetch(`${BACKEND_URL}/api/daily-checkin/claim`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          address, 
          dayNumber: selectedBox, 
          token,
          amount: state.amount
        }),
      });
      
      const data = await response.json();
      
      if (data.success) {
        setRewardStates(prev => ({
          ...prev,
          [rewardId]: { ...prev[rewardId], claiming: false, claimed: true }
        }));
        
        // Check if all rewards for this day are claimed
        const dayRewards = DAY_REWARDS[selectedBox] || [];
        const allClaimed = dayRewards.every(r => 
          rewardStates[r.id]?.claimed || r.id === rewardId
        );
        if (allClaimed) {
          await fetchBoxStatus();
        }
      } else {
        throw new Error(data.error || 'Claim failed');
      }
    } catch (err: any) {
      setRewardStates(prev => ({
        ...prev,
        [rewardId]: { ...prev[rewardId], claiming: false, error: err.message }
      }));
    }
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

        {/* Reward Boxes */}
        {isConnected && (
          <div className="flex justify-center mb-8">
            <div className="inline-flex gap-2 p-3 bg-white rounded-2xl shadow-sm">
              {[1, 2, 3, 4, 5, 6, 7].map((day) => {
                const state = getBoxState(day);
                const isClaimed = state === 'claimed';
                const isAvailable = state === 'available';
                
                return (
                  <button
                    key={day}
                    onClick={() => handleBoxClick(day)}
                    disabled={!isAvailable}
                    className={`w-11 h-11 rounded-xl flex items-center justify-center transition-all relative
                      ${isClaimed ? 'bg-gray-100' : isAvailable ? 'bg-gradient-to-br from-amber-400 to-orange-400 shadow-md hover:scale-105' : 'bg-amber-50 opacity-50'}
                    `}
                  >
                    {isAvailable && <div className="absolute inset-0 rounded-xl animate-pulse-ring" />}
                    <Gift className={`w-5 h-5 ${isClaimed ? 'text-gray-400' : isAvailable ? 'text-white' : 'text-amber-300'}`} />
                    {isClaimed && (
                      <div className="absolute -top-1 -right-1 w-4 h-4 bg-green-500 rounded-full flex items-center justify-center">
                        <Check className="w-2.5 h-2.5 text-white" />
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        )}

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
                className="bg-white rounded-2xl shadow-xl w-full max-w-sm overflow-hidden"
              >
                <div className="flex justify-between items-center px-4 py-3 border-b">
                  <span className="font-semibold text-gray-900">Claimable Tokens</span>
                  <button onClick={() => setSelectedBox(null)} className="text-gray-400 hover:text-gray-600">
                    <X className="w-5 h-5" />
                  </button>
                </div>
                
                <div className="p-4 space-y-4">
                  {currentDayRewards.map((reward, index) => {
                    const state = rewardStates[reward.id];
                    if (!state) return null;
                    
                    return (
                      <div key={reward.id} className={index > 0 ? 'border-t pt-4' : ''}>
                        {/* Token info row */}
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <img src={reward.logo} alt={reward.name} className="w-7 h-7 rounded-full" />
                            <div>
                              <span className="font-medium text-gray-900">{reward.name}</span>
                              <span className="ml-2 text-gray-600">
                                {reward.token === 'usdc' ? `$${state.amount}` : state.amount.toLocaleString()}
                              </span>
                            </div>
                          </div>
                          
                          {/* Verify + Claim buttons */}
                          <div className="flex items-center gap-2">
                            {state.claimed ? (
                              <span className="text-green-600 text-sm font-medium flex items-center gap-1">
                                <Check className="w-4 h-4" /> Claimed
                              </span>
                            ) : (
                              <>
                                <button
                                  onClick={() => verifyTask(reward.id, reward.task)}
                                  disabled={state.verifying || state.verified}
                                  className={`px-3 py-1 text-xs font-medium rounded-lg border transition-all
                                    ${state.verified 
                                      ? 'border-green-500 text-green-600 bg-green-50' 
                                      : 'border-gray-300 text-gray-600 hover:border-gray-400'}`}
                                >
                                  {state.verifying ? (
                                    <Loader2 className="w-3 h-3 animate-spin" />
                                  ) : state.verified ? (
                                    <Check className="w-3 h-3" />
                                  ) : (
                                    'Verify'
                                  )}
                                </button>
                                <button
                                  onClick={() => claimReward(reward.id, reward.token)}
                                  disabled={!state.verified || state.claiming}
                                  className={`px-3 py-1 text-xs font-medium rounded-lg border-2 transition-all
                                    ${state.verified 
                                      ? 'border-green-500 text-green-600 hover:bg-green-50' 
                                      : 'border-gray-200 text-gray-400 cursor-not-allowed'}`}
                                >
                                  {state.claiming ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Claim'}
                                </button>
                              </>
                            )}
                          </div>
                        </div>
                        
                        {/* Task hint */}
                        {!state.verified && !state.claimed && (
                          <p className="text-xs text-gray-500 mt-2 pl-9 flex items-center gap-1">
                            <span className="text-gray-400">Task:</span>
                            <a 
                              href={reward.task.link} 
                              target="_blank" 
                              rel="noopener noreferrer" 
                              className="text-blue-500 hover:underline flex items-center gap-1"
                            >
                              {reward.task.label}
                              <ExternalLink className="w-3 h-3" />
                            </a>
                          </p>
                        )}
                        
                        {/* Error */}
                        {state.error && !state.claimed && (
                          <p className="text-xs text-red-500 mt-1 pl-9">{state.error}</p>
                        )}
                      </div>
                    );
                  })}
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
            className="bg-yellow-400 hover:bg-yellow-500 text-gray-900 font-medium py-2 px-4 rounded-lg"
          >
            {isLoading ? 'Loading...' : 'Refresh'}
          </button>
        </div>
      </div>

      <style jsx>{`
        @keyframes pulse-ring {
          0% { box-shadow: 0 0 0 0 rgba(251, 191, 36, 0.6); }
          70% { box-shadow: 0 0 0 6px rgba(251, 191, 36, 0); }
          100% { box-shadow: 0 0 0 0 rgba(251, 191, 36, 0); }
        }
        .animate-pulse-ring { animation: pulse-ring 1.5s ease-out infinite; }
      `}</style>
    </div>
  );
}
