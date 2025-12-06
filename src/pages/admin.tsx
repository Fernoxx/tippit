import { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useFarcasterWallet } from '@/hooks/useFarcasterWallet';
import { Gift, X } from 'lucide-react';

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
    firstTipDate: string | null;
    lastTipDate: string | null;
  };
  last24h: PeriodStats;
  last7d: PeriodStats;
  last30d: PeriodStats;
  timestamp?: string;
}

interface MetricCardConfig {
  key: string;
  label: string;
  bgClass: string;
  textClass: string;
  icon: JSX.Element;
  getValue: (stats: AdminStats) => string;
}

interface TimeframeCardConfig {
  label: string;
  getTips: (stats: AdminStats) => string;
  getUsdc: (stats: AdminStats) => string;
}

const metricCards: MetricCardConfig[] = [
  {
    key: 'totalTips',
    label: 'Total Tips',
    bgClass: 'bg-blue-100',
    textClass: 'text-blue-600',
    icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
      </svg>
    ),
    getValue: (stats) => stats.allTime.totalTips.toLocaleString(),
  },
  {
    key: 'totalUsdcTipped',
    label: 'Total USDC Tipped',
    bgClass: 'bg-green-100',
    textClass: 'text-green-600',
    icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1" />
      </svg>
    ),
    getValue: (stats) => `${stats.allTime.totalUsdcTipped.toFixed(2)} USDC`,
  },
  {
    key: 'totalTransactions',
    label: 'Total Transactions',
    bgClass: 'bg-orange-100',
    textClass: 'text-orange-600',
    icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
      </svg>
    ),
    getValue: (stats) => stats.allTime.totalTransactions.toLocaleString(),
  },
  {
    key: 'uniqueTippers',
    label: 'Unique Tippers',
    bgClass: 'bg-purple-100',
    textClass: 'text-purple-600',
    icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197m13.5-9a2.5 2.5 0 11-5 0 2.5 2.5 0 015 0z" />
      </svg>
    ),
    getValue: (stats) => stats.allTime.uniqueTippers.toLocaleString(),
  },
];

const timeframeCards: TimeframeCardConfig[] = [
  {
    label: 'Last 24h',
    getTips: (stats) => stats.last24h.tips.toLocaleString(),
    getUsdc: (stats) => stats.last24h.usdc.toFixed(2),
  },
  {
    label: 'Last 7d',
    getTips: (stats) => stats.last7d.tips.toLocaleString(),
    getUsdc: (stats) => stats.last7d.usdc.toFixed(2),
  },
  {
    label: 'Last 30d',
    getTips: (stats) => stats.last30d.tips.toLocaleString(),
    getUsdc: (stats) => stats.last30d.usdc.toFixed(2),
  },
];

// Reward ranges - backend generates random amounts
const BOX_REWARDS: Record<number, { ecionMin: number; ecionMax: number; usdcMin: number; usdcMax: number; hasUsdc: boolean }> = {
  1: { ecionMin: 1, ecionMax: 69, usdcMin: 0.01, usdcMax: 0.20, hasUsdc: true },
  2: { ecionMin: 69, ecionMax: 1000, usdcMin: 0, usdcMax: 0, hasUsdc: false },
  3: { ecionMin: 1000, ecionMax: 5000, usdcMin: 0.01, usdcMax: 0.20, hasUsdc: true },
  4: { ecionMin: 5000, ecionMax: 10000, usdcMin: 0, usdcMax: 0, hasUsdc: false },
  5: { ecionMin: 5000, ecionMax: 10000, usdcMin: 0.01, usdcMax: 0.20, hasUsdc: true },
  6: { ecionMin: 10000, ecionMax: 20000, usdcMin: 0, usdcMax: 0, hasUsdc: false },
  7: { ecionMin: 10000, ecionMax: 20000, usdcMin: 0.01, usdcMax: 0.20, hasUsdc: true }
};

// Generate random amount within range (for display)
const getRandomAmount = (min: number, max: number) => {
  return Math.floor(Math.random() * (max - min + 1)) + min;
};

const getRandomUsdc = (min: number, max: number) => {
  return (Math.random() * (max - min) + min).toFixed(2);
};

interface BoxStatus {
  streak: number;
  claimedDays: number[];
  currentDayUTC: string;
  lastCheckinDate: string | null;
  fid?: number;
}

interface ClaimableReward {
  ecion: number;
  usdc: string;
  hasUsdc: boolean;
}

export default function Admin() {
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [password, setPassword] = useState('');
  const [authError, setAuthError] = useState<string | null>(null);
  
  // Reward box states
  const [boxStatus, setBoxStatus] = useState<BoxStatus | null>(null);
  const [boxLoading, setBoxLoading] = useState(false);
  const [selectedBox, setSelectedBox] = useState<number | null>(null);
  const [claimableReward, setClaimableReward] = useState<ClaimableReward | null>(null);
  const [claimLoading, setClaimLoading] = useState(false);
  const [claimError, setClaimError] = useState<string | null>(null);
  const [claimSuccess, setClaimSuccess] = useState(false);
  
  const { address, isConnected } = useFarcasterWallet();

  // Fetch admin data
  const fetchAdminData = async () => {
    try {
      setIsLoading(true);
      setError(null);

      const storedPassword = sessionStorage.getItem('admin_password');
      if (!storedPassword) {
        setIsAuthenticated(false);
        sessionStorage.removeItem('admin_authenticated');
        setError('Session expired. Please login again.');
        return;
      }
      
      const headers = { 'x-admin-password': storedPassword };
      const statsResponse = await fetch(`${BACKEND_URL}/api/admin/total-stats`, { headers });
      
      if (!statsResponse.ok) {
        if (statsResponse.status === 401) {
          setIsAuthenticated(false);
          sessionStorage.removeItem('admin_authenticated');
          sessionStorage.removeItem('admin_password');
          setError('Authentication failed. Please login again.');
          return;
        }
        throw new Error(`Stats request failed`);
      }
      
      const statsData = await statsResponse.json();
      const payload = statsData.stats ?? statsData.data ?? statsData;
      
      if (payload && (payload.allTime || payload.last24h)) {
        setStats({
          ...payload,
          timestamp: statsData.timestamp ?? payload.timestamp ?? new Date().toISOString(),
        });
      }
    } catch (err) {
      console.error('Error fetching admin data:', err);
      setError('Failed to fetch admin data');
    } finally {
      setIsLoading(false);
    }
  };

  // Fetch box status
  const fetchBoxStatus = async () => {
    if (!address || !isConnected) return;

    try {
      setBoxLoading(true);
      const response = await fetch(`${BACKEND_URL}/api/daily-checkin/status?address=${address}`);
      const data = await response.json();
      
      if (data.success) {
        setBoxStatus({
          streak: data.streak || 1,
          claimedDays: data.claimedDays || [],
          currentDayUTC: data.currentDayUTC,
          lastCheckinDate: data.lastCheckinDate,
          fid: data.fid
        });
      }
    } catch (err) {
      console.error('Error fetching box status:', err);
    } finally {
      setBoxLoading(false);
    }
  };

  // Get current day for claiming
  const getCurrentDay = () => {
    if (!boxStatus) return 1;
    if (boxStatus.streak === 0) return 1;
    return boxStatus.streak;
  };

  // Get box state
  const getBoxState = (day: number) => {
    if (!boxStatus) return 'locked';
    const isClaimed = boxStatus.claimedDays?.includes(day);
    const currentDay = getCurrentDay();
    
    if (isClaimed) return 'claimed';
    if (day === currentDay) return 'available';
    if (day < currentDay) return 'missed';
    return 'locked';
  };

  // Handle box click - generate random reward and show modal
  const handleBoxClick = (day: number) => {
    const state = getBoxState(day);
    if (state !== 'available') return;
    
    const reward = BOX_REWARDS[day];
    const randomEcion = getRandomAmount(reward.ecionMin, reward.ecionMax);
    const randomUsdc = reward.hasUsdc ? getRandomUsdc(reward.usdcMin, reward.usdcMax) : '0';
    
    setClaimableReward({
      ecion: randomEcion,
      usdc: randomUsdc,
      hasUsdc: reward.hasUsdc
    });
    setSelectedBox(day);
    setClaimError(null);
    setClaimSuccess(false);
  };

  // Handle claim - check follow status and claim
  const handleClaim = async () => {
    if (!address || !selectedBox || !claimableReward) return;

    try {
      setClaimLoading(true);
      setClaimError(null);

      // Check if user follows @doteth
      const followResponse = await fetch(`${BACKEND_URL}/api/neynar/check-follow-by-address/${address}`);
      const followData = await followResponse.json();

      if (!followData.success || !followData.isFollowing) {
        setClaimError('You must follow @doteth to claim rewards.');
        setClaimLoading(false);
        return;
      }

      // Process check-in
      const checkinResponse = await fetch(`${BACKEND_URL}/api/daily-checkin/checkin`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address, dayNumber: selectedBox }),
      });
      
      const checkinData = await checkinResponse.json();
      if (!checkinData.success && !checkinData.alreadyCheckedIn) {
        throw new Error(checkinData.error || 'Failed to check in');
      }

      // Claim reward
      const claimResponse = await fetch(`${BACKEND_URL}/api/daily-checkin/claim`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address, dayNumber: selectedBox }),
      });
      
      const claimData = await claimResponse.json();
      if (claimData.success) {
        setClaimSuccess(true);
        await fetchBoxStatus();
      } else {
        throw new Error(claimData.error || 'Failed to claim');
      }
    } catch (err: any) {
      setClaimError(err.message || 'Failed to claim reward');
    } finally {
      setClaimLoading(false);
    }
  };

  useEffect(() => {
    const authStatus = sessionStorage.getItem('admin_authenticated');
    const storedPassword = sessionStorage.getItem('admin_password');
    
    if (authStatus === 'true' && storedPassword) {
      setIsAuthenticated(true);
      fetchAdminData();
      const interval = setInterval(fetchAdminData, 30000);
      return () => clearInterval(interval);
    } else {
      sessionStorage.removeItem('admin_authenticated');
      sessionStorage.removeItem('admin_password');
      setIsAuthenticated(false);
    }
  }, []);

  useEffect(() => {
    if (isConnected && address && isAuthenticated) {
      fetchBoxStatus();
    }
  }, [isConnected, address, isAuthenticated]);

  useEffect(() => {
    if (selectedBox === null) {
      setClaimableReward(null);
      setClaimError(null);
      setClaimSuccess(false);
    }
  }, [selectedBox]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);
    
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
        setPassword('');
      }
    } catch (error) {
      setAuthError('Failed to connect to server');
      setPassword('');
    }
  };

  const lastUpdated = useMemo(() => {
    if (!stats?.timestamp) return null;
    return new Date(stats.timestamp).toLocaleString();
  }, [stats?.timestamp]);

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-yellow-50 flex items-center justify-center">
        <div className="bg-white rounded-lg shadow-lg p-8 max-w-md w-full">
          <h1 className="text-3xl font-bold text-gray-900 mb-6 text-center">Admin Login</h1>
          <form onSubmit={handleLogin}>
            <div className="mb-4">
              <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-2">
                Password
              </label>
              <input
                type="password"
                id="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-yellow-400 focus:border-transparent"
                placeholder="Enter admin password"
                autoFocus
              />
            </div>
            {authError && (
              <div className="mb-4 bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded text-sm">
                {authError}
              </div>
            )}
            <button
              type="submit"
              className="w-full bg-yellow-400 hover:bg-yellow-500 text-gray-900 font-medium py-2 px-4 rounded-lg transition-colors"
            >
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
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-4 border-yellow-400 border-t-transparent mx-auto mb-4"></div>
          <p className="text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-yellow-50 py-8">
      <div className="max-w-6xl mx-auto px-4">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-gray-900 mb-2">Admin Dashboard</h1>
          <p className="text-gray-600">Live tipping statistics for Ecion</p>
          {lastUpdated && (
            <p className="text-sm text-gray-500 mt-2">Last updated: {lastUpdated}</p>
          )}
        </div>

        {/* Daily Reward Boxes - Clean minimal design */}
        {isConnected && (
          <div className="mb-8 flex justify-center">
            <div className="inline-flex gap-2 p-3 bg-white rounded-2xl shadow-sm border border-gray-100">
              {[1, 2, 3, 4, 5, 6, 7].map((day) => {
                const state = getBoxState(day);
                const isClaimed = state === 'claimed';
                const isAvailable = state === 'available';
                
                return (
                  <motion.button
                    key={day}
                    whileHover={isAvailable ? { scale: 1.08 } : {}}
                    whileTap={isAvailable ? { scale: 0.95 } : {}}
                    onClick={() => handleBoxClick(day)}
                    disabled={!isAvailable}
                    className={`
                      w-12 h-12 rounded-xl flex items-center justify-center transition-all relative
                      ${isClaimed 
                        ? 'bg-gray-100 cursor-default' 
                        : isAvailable 
                          ? 'bg-gradient-to-br from-amber-400 to-orange-400 cursor-pointer shadow-md hover:shadow-lg' 
                          : 'bg-amber-50 cursor-default opacity-50'
                      }
                    `}
                  >
                    {isAvailable && (
                      <div className="absolute inset-0 rounded-xl animate-pulse-ring"></div>
                    )}
                    <Gift 
                      className={`w-5 h-5 ${isClaimed ? 'text-gray-400' : isAvailable ? 'text-white' : 'text-amber-300'}`} 
                    />
                    {isClaimed && (
                      <div className="absolute -top-1 -right-1 w-4 h-4 bg-green-500 rounded-full flex items-center justify-center">
                        <svg className="w-2.5 h-2.5 text-white" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                        </svg>
                      </div>
                    )}
                  </motion.button>
                );
              })}
            </div>
          </div>
        )}

        {/* Claim Modal - Simple and clean */}
        <AnimatePresence>
          {selectedBox !== null && claimableReward && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4"
              onClick={() => setSelectedBox(null)}
            >
              <motion.div
                initial={{ scale: 0.95, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.95, opacity: 0 }}
                onClick={(e) => e.stopPropagation()}
                className="bg-white rounded-2xl shadow-xl w-full max-w-xs overflow-hidden"
              >
                {/* Header */}
                <div className="flex justify-between items-center px-4 py-3 border-b border-gray-100">
                  <span className="font-semibold text-gray-900">Claimable Tokens</span>
                  <button
                    onClick={() => setSelectedBox(null)}
                    className="text-gray-400 hover:text-gray-600 transition-colors"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
                
                {/* Content */}
                <div className="p-4">
                  {claimSuccess ? (
                    <div className="text-center py-4">
                      <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-3">
                        <svg className="w-6 h-6 text-green-500" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                        </svg>
                      </div>
                      <p className="text-gray-900 font-medium">Claimed!</p>
                    </div>
                  ) : (
                    <>
                      {/* Token list */}
                      <div className="space-y-3 mb-4">
                        {/* ECION */}
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <img src={ECION_LOGO} alt="ECION" className="w-6 h-6 rounded-full" />
                            <span className="text-gray-700">Ecion</span>
                          </div>
                          <span className="font-semibold text-gray-900">{claimableReward.ecion.toLocaleString()}</span>
                        </div>
                        
                        {/* USDC - only if applicable */}
                        {claimableReward.hasUsdc && (
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <img src={USDC_LOGO} alt="USDC" className="w-6 h-6 rounded-full" />
                              <span className="text-gray-700">USDC</span>
                            </div>
                            <span className="font-semibold text-gray-900">${claimableReward.usdc}</span>
                          </div>
                        )}
                      </div>

                      {/* Error message */}
                      {claimError && (
                        <p className="text-red-500 text-sm mb-3 text-center">
                          {claimError.includes('@doteth') ? (
                            <>
                              You must follow{' '}
                              <a 
                                href="https://warpcast.com/doteth" 
                                target="_blank" 
                                rel="noopener noreferrer"
                                className="text-blue-500 hover:underline"
                              >
                                @doteth
                              </a>
                              {' '}to claim rewards.
                            </>
                          ) : claimError}
                        </p>
                      )}

                      {/* Claim button - simple outline */}
                      <button
                        onClick={handleClaim}
                        disabled={claimLoading}
                        className="w-full py-2.5 border-2 border-green-500 text-green-600 font-medium rounded-xl hover:bg-green-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {claimLoading ? 'Claiming...' : 'Claim'}
                      </button>
                    </>
                  )}
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {error && (
          <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-6 text-center text-sm">
            {error}
          </div>
        )}

        {stats ? (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
              {metricCards.map((card, index) => (
                <motion.div
                  key={card.key}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.05 }}
                  className="bg-white rounded-lg p-6 shadow-sm border border-gray-200"
                >
                  <div className="flex items-center">
                    <div className={`p-2 rounded-lg ${card.bgClass}`}>
                      <span className={card.textClass}>{card.icon}</span>
                    </div>
                    <div className="ml-4">
                      <p className="text-sm font-medium text-gray-600">{card.label}</p>
                      <p className="text-2xl font-bold text-gray-900">{card.getValue(stats)}</p>
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              className="bg-white rounded-lg shadow-sm border border-gray-200 mb-8"
            >
              <div className="px-6 py-4 border-b border-gray-200">
                <h2 className="text-xl font-semibold text-gray-900">Recent Activity</h2>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 divide-y md:divide-y-0 md:divide-x">
                {timeframeCards.map((card) => (
                  <div key={card.label} className="p-6 text-center">
                    <p className="text-sm font-medium text-gray-500">{card.label}</p>
                    <p className="text-2xl font-semibold text-gray-900 mt-2">{card.getTips(stats)} tips</p>
                    <p className="text-sm text-gray-600 mt-1">{card.getUsdc(stats)} USDC</p>
                  </div>
                ))}
              </div>
            </motion.div>
          </>
        ) : (
          <div className="bg-white border border-gray-200 text-gray-600 px-4 py-3 rounded mb-8 text-center text-sm">
            No statistics available yet.
          </div>
        )}

        <div className="mt-6 text-center">
          <button
            onClick={fetchAdminData}
            disabled={isLoading}
            className="bg-yellow-400 hover:bg-yellow-500 text-gray-900 font-medium py-2 px-4 rounded-lg transition-colors disabled:opacity-50"
          >
            {isLoading ? 'Refreshing...' : 'Refresh Data'}
          </button>
        </div>
      </div>

      <style jsx>{`
        @keyframes pulse-ring {
          0% { box-shadow: 0 0 0 0 rgba(251, 191, 36, 0.6); }
          70% { box-shadow: 0 0 0 8px rgba(251, 191, 36, 0); }
          100% { box-shadow: 0 0 0 0 rgba(251, 191, 36, 0); }
        }
        .animate-pulse-ring {
          animation: pulse-ring 1.5s ease-out infinite;
        }
      `}</style>
    </div>
  );
}
