import { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useFarcasterWallet } from '@/hooks/useFarcasterWallet';
import { Gift, X, ExternalLink, CheckCircle, AlertCircle } from 'lucide-react';
import { useWriteContract, useWaitForTransactionReceipt } from 'wagmi';
import { parseUnits } from 'viem';

const BACKEND_URL = (process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:3001').replace(/\/$/, '');

// ECION Token contract address
const ECION_TOKEN_ADDRESS = '0xdcc17f9429f8fd30e31315e1d33e2ef33ae38b07';

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

// Reward amounts for each box (ECION tokens)
const BOX_REWARDS = {
  1: { ecion: '69', usdc: '0.69' },
  2: { ecion: '1000', usdc: '1' },
  3: { ecion: '5000', usdc: '2' },
  4: { ecion: '10000', usdc: '3' },
  5: { ecion: '20000', usdc: '5' },
  6: { ecion: '30000', usdc: '7' },
  7: { ecion: '100000', usdc: '10' }
};

interface BoxStatus {
  streak: number;
  claimedDays: number[];
  currentDayUTC: string;
  lastCheckinDate: string | null;
  fid?: number;
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
  const [boxError, setBoxError] = useState<string | null>(null);
  const [selectedBox, setSelectedBox] = useState<number | null>(null);
  const [isFollowingDoteth, setIsFollowingDoteth] = useState<boolean | null>(null);
  const [verifyLoading, setVerifyLoading] = useState(false);
  const [claimLoading, setClaimLoading] = useState(false);
  const [claimSuccess, setClaimSuccess] = useState(false);
  const [claimTxHash, setClaimTxHash] = useState<string | null>(null);
  
  const { address, isConnected, currentUser } = useFarcasterWallet();
  
  // Check if current time is after 5:30 AM IST (00:00 UTC) for current day
  const isBoxUnlockTime = useMemo(() => {
    const now = new Date();
    const utcHours = now.getUTCHours();
    const utcMinutes = now.getUTCMinutes();
    // 5:30 AM IST = 00:00 UTC
    return utcHours >= 0; // After midnight UTC
  }, []);

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
      
      const headers = {
        'x-admin-password': storedPassword
      };

      const statsResponse = await fetch(`${BACKEND_URL}/api/admin/total-stats`, { headers });
      if (!statsResponse.ok) {
        if (statsResponse.status === 401) {
          setIsAuthenticated(false);
          sessionStorage.removeItem('admin_authenticated');
          sessionStorage.removeItem('admin_password');
          setError('Authentication failed. Please login again.');
          return;
        }
        throw new Error(`Stats request failed with status ${statsResponse.status}`);
      }
      const statsData = await statsResponse.json();
      
      const payload = (statsData.stats as AdminStats | undefined) ?? (statsData.data as AdminStats | undefined) ?? statsData;

      if (payload && (payload.allTime || payload.last24h)) {
        setStats({
          ...payload,
          timestamp: statsData.timestamp ?? payload.timestamp ?? new Date().toISOString(),
        });
      } else {
        setStats(null);
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
    if (!address || !isConnected) {
      setBoxError('Please connect your wallet first');
      return;
    }

    try {
      setBoxLoading(true);
      setBoxError(null);
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
      } else {
        setBoxError(data.error || 'Failed to fetch box status');
      }
    } catch (err: any) {
      console.error('Error fetching box status:', err);
      setBoxError(err.message || 'Failed to fetch box status');
    } finally {
      setBoxLoading(false);
    }
  };

  // Verify if user follows @doteth
  const verifyFollow = async () => {
    if (!address) return;
    
    try {
      setVerifyLoading(true);
      const response = await fetch(`${BACKEND_URL}/api/neynar/check-follow-by-address/${address}`);
      const data = await response.json();
      
      if (data.success) {
        setIsFollowingDoteth(data.isFollowing);
      } else {
        setIsFollowingDoteth(false);
      }
    } catch (err) {
      console.error('Error verifying follow:', err);
      setIsFollowingDoteth(false);
    } finally {
      setVerifyLoading(false);
    }
  };

  // Claim reward for a box
  const claimReward = async (dayNumber: number) => {
    if (!address || !isConnected) {
      setBoxError('Please connect your wallet first');
      return;
    }

    if (!isFollowingDoteth) {
      setBoxError('You must follow @doteth to claim rewards');
      return;
    }

    try {
      setClaimLoading(true);
      setBoxError(null);
      
      // First check in
      const checkinResponse = await fetch(`${BACKEND_URL}/api/daily-checkin/checkin`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address, dayNumber }),
      });
      
      const checkinData = await checkinResponse.json();
      
      if (!checkinData.success && !checkinData.alreadyCheckedIn) {
        throw new Error(checkinData.error || 'Failed to check in');
      }
      
      // Then claim reward
      const claimResponse = await fetch(`${BACKEND_URL}/api/daily-checkin/claim`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address, dayNumber }),
      });
      
      const claimData = await claimResponse.json();
      
      if (claimData.success) {
        setClaimSuccess(true);
        setClaimTxHash(claimData.transactionHash);
        // Refresh box status
        await fetchBoxStatus();
      } else {
        throw new Error(claimData.error || 'Failed to claim reward');
      }
    } catch (err: any) {
      console.error('Error claiming reward:', err);
      setBoxError(err.message || 'Failed to claim reward');
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

  // Fetch box status when connected
  useEffect(() => {
    if (isConnected && address && isAuthenticated) {
      fetchBoxStatus();
    }
  }, [isConnected, address, isAuthenticated]);

  // Reset modal state when closed
  useEffect(() => {
    if (selectedBox === null) {
      setIsFollowingDoteth(null);
      setClaimSuccess(false);
      setClaimTxHash(null);
      setBoxError(null);
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
      console.error('Login error:', error);
      setAuthError('Failed to connect to server');
      setPassword('');
    }
  };

  const lastUpdated = useMemo(() => {
    if (!stats?.timestamp) return null;
    return new Date(stats.timestamp).toLocaleString();
  }, [stats?.timestamp]);

  // Calculate the current available day based on streak and check-in status
  const getCurrentDay = () => {
    if (!boxStatus) return 1;
    
    // If streak is 0 (new user or broken streak), start at Day 1
    if (boxStatus.streak === 0) return 1;
    
    // If already checked in today, current day is the streak value
    // If not checked in today but streak exists, next day is available
    // Note: streak represents the last successful check-in day count
    return boxStatus.streak;
  };

  // Get box state for a given day
  const getBoxState = (day: number) => {
    if (!boxStatus) return 'locked';
    
    const isClaimed = boxStatus.claimedDays?.includes(day);
    const currentDay = getCurrentDay();
    const isCurrentDay = day === currentDay;
    const isPast = day < currentDay;
    const isFuture = day > currentDay;
    
    if (isClaimed) return 'claimed';
    if (isCurrentDay && isBoxUnlockTime) return 'available';
    if (isPast && !isClaimed) return 'missed';
    return 'locked';
  };

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
              <div className="mb-4 bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded">
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
          <p className="text-gray-600">Loading admin data...</p>
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

        {/* Reward Boxes Section */}
        <div className="mb-8">
          <div className="bg-white rounded-2xl shadow-lg border border-yellow-200 overflow-hidden">
            <div className="bg-gradient-to-r from-yellow-400 to-amber-500 px-6 py-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <Gift className="w-6 h-6 text-white" />
                  <h2 className="text-xl font-bold text-white">Daily Reward Boxes</h2>
                </div>
                <div className="text-white/90 text-sm">
                  Opens daily at 5:30 AM IST (00:00 UTC)
                </div>
              </div>
            </div>
            
            <div className="p-6">
              {!isConnected ? (
                <div className="text-center py-8">
                  <p className="text-gray-600 mb-2">Connect your wallet to claim daily rewards</p>
                  <p className="text-sm text-gray-500">You must follow @doteth to be eligible</p>
                </div>
              ) : boxLoading ? (
                <div className="text-center py-8">
                  <div className="animate-spin rounded-full h-10 w-10 border-4 border-yellow-400 border-t-transparent mx-auto mb-3"></div>
                  <p className="text-sm text-gray-600">Loading rewards...</p>
                </div>
              ) : (
                <>
                  {/* Box Progress Info */}
                  {boxStatus && (
                    <div className="text-center mb-6">
                      <p className="text-sm text-gray-600">
                        {boxStatus.streak === 0 ? (
                          <>Start your streak! <span className="font-bold text-yellow-600">Day 1</span> is available</>
                        ) : (
                          <>Current Progress: <span className="font-bold text-yellow-600">Day {getCurrentDay()} of 7</span></>
                        )}
                      </p>
                    </div>
                  )}
                  
                  {/* 7 Reward Boxes */}
                  <div className="grid grid-cols-7 gap-3">
                    {[1, 2, 3, 4, 5, 6, 7].map((day) => {
                      const state = getBoxState(day);
                      const isClaimed = state === 'claimed';
                      const isAvailable = state === 'available';
                      const isLocked = state === 'locked';
                      const isMissed = state === 'missed';
                      
                      return (
                        <motion.div
                          key={day}
                          whileHover={isAvailable ? { scale: 1.05 } : {}}
                          whileTap={isAvailable ? { scale: 0.95 } : {}}
                          onClick={() => isAvailable && setSelectedBox(day)}
                          className={`
                            relative aspect-square rounded-xl flex flex-col items-center justify-center cursor-pointer transition-all duration-300 border-2
                            ${isClaimed 
                              ? 'bg-gray-200 border-gray-300 opacity-60' 
                              : isAvailable 
                                ? 'bg-gradient-to-br from-yellow-300 to-amber-400 border-yellow-500 shadow-lg reward-box-glow cursor-pointer' 
                                : isLocked
                                  ? 'bg-yellow-100/50 border-yellow-200/50'
                                  : 'bg-gray-100 border-gray-200 opacity-50'
                            }
                          `}
                        >
                          {/* Shimmer effect for available box */}
                          {isAvailable && (
                            <div className="absolute inset-0 rounded-xl overflow-hidden">
                              <div className="shimmer-effect"></div>
                            </div>
                          )}
                          
                          {/* Box Icon */}
                          <div className={`relative z-10 ${isClaimed ? 'text-gray-500' : isAvailable ? 'text-white' : 'text-yellow-600/50'}`}>
                            {isClaimed ? (
                              <CheckCircle className="w-8 h-8" />
                            ) : (
                              <Gift className={`w-8 h-8 ${isAvailable ? 'animate-bounce' : ''}`} />
                            )}
                          </div>
                          
                          {/* Day Label */}
                          <span className={`text-xs font-bold mt-1 relative z-10 ${isClaimed ? 'text-gray-500' : isAvailable ? 'text-white' : 'text-yellow-700/50'}`}>
                            Day {day}
                          </span>
                          
                          {/* Claimed Badge */}
                          {isClaimed && (
                            <div className="absolute -top-1 -right-1 w-5 h-5 bg-green-500 rounded-full flex items-center justify-center shadow-md">
                              <CheckCircle className="w-3 h-3 text-white" />
                            </div>
                          )}
                        </motion.div>
                      );
                    })}
                  </div>
                  
                  {/* Legend */}
                  <div className="flex justify-center gap-6 mt-6 text-xs text-gray-600">
                    <div className="flex items-center gap-1.5">
                      <div className="w-3 h-3 rounded bg-gradient-to-br from-yellow-300 to-amber-400"></div>
                      <span>Available</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <div className="w-3 h-3 rounded bg-yellow-100 border border-yellow-200"></div>
                      <span>Upcoming</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <div className="w-3 h-3 rounded bg-gray-200"></div>
                      <span>Claimed</span>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Claim Modal */}
        <AnimatePresence>
          {selectedBox !== null && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
              onClick={() => setSelectedBox(null)}
            >
              <motion.div
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.9, opacity: 0 }}
                onClick={(e) => e.stopPropagation()}
                className="bg-white rounded-2xl shadow-2xl max-w-md w-full overflow-hidden"
              >
                {/* Modal Header */}
                <div className="bg-gradient-to-r from-yellow-400 to-amber-500 px-6 py-4 flex justify-between items-center">
                  <div className="flex items-center space-x-2">
                    <Gift className="w-6 h-6 text-white" />
                    <h3 className="text-lg font-bold text-white">Day {selectedBox} Reward</h3>
                  </div>
                  <button
                    onClick={() => setSelectedBox(null)}
                    className="text-white/80 hover:text-white transition-colors"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
                
                {/* Modal Content */}
                <div className="p-6">
                  {claimSuccess ? (
                    <div className="text-center py-4">
                      <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                        <CheckCircle className="w-10 h-10 text-green-500" />
                      </div>
                      <h4 className="text-xl font-bold text-gray-900 mb-2">Reward Claimed! 🎉</h4>
                      <p className="text-gray-600 mb-4">
                        You received {BOX_REWARDS[selectedBox as keyof typeof BOX_REWARDS]?.ecion} ECION + ${BOX_REWARDS[selectedBox as keyof typeof BOX_REWARDS]?.usdc} USDC
                      </p>
                      {claimTxHash && (
                        <a
                          href={`https://basescan.org/tx/${claimTxHash}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-blue-600 hover:text-blue-700 text-sm"
                        >
                          View transaction <ExternalLink className="w-3 h-3" />
                        </a>
                      )}
                    </div>
                  ) : (
                    <>
                      {/* Verification Section */}
                      <div className="mb-6">
                        <h4 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
                          <span className="w-5 h-5 rounded-full bg-yellow-100 text-yellow-700 flex items-center justify-center text-xs font-bold">1</span>
                          Verify Eligibility
                        </h4>
                        
                        {isFollowingDoteth === null ? (
                          <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
                            <p className="text-sm text-gray-600 mb-3">
                              You must follow <a href="https://warpcast.com/doteth" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline font-medium">@doteth</a> on Farcaster to claim rewards.
                            </p>
                            <button
                              onClick={verifyFollow}
                              disabled={verifyLoading}
                              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-2.5 px-4 rounded-lg transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                            >
                              {verifyLoading ? (
                                <>
                                  <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent"></div>
                                  Checking...
                                </>
                              ) : (
                                'Verify Follow'
                              )}
                            </button>
                          </div>
                        ) : isFollowingDoteth ? (
                          <div className="bg-green-50 rounded-lg p-4 border border-green-200 flex items-center gap-3">
                            <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0" />
                            <div>
                              <p className="font-medium text-green-800">Verified!</p>
                              <p className="text-sm text-green-600">You're following @doteth ✓</p>
                            </div>
                          </div>
                        ) : (
                          <div className="bg-red-50 rounded-lg p-4 border border-red-200">
                            <div className="flex items-start gap-3 mb-3">
                              <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
                              <div>
                                <p className="font-medium text-red-800">Not Following</p>
                                <p className="text-sm text-red-600">You need to follow @doteth to claim rewards</p>
                              </div>
                            </div>
                            <div className="flex gap-2">
                              <a
                                href="https://warpcast.com/doteth"
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex-1 bg-purple-600 hover:bg-purple-700 text-white font-medium py-2 px-4 rounded-lg transition-colors flex items-center justify-center gap-2 text-sm"
                              >
                                Follow @doteth <ExternalLink className="w-3 h-3" />
                              </a>
                              <button
                                onClick={verifyFollow}
                                disabled={verifyLoading}
                                className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium py-2 px-4 rounded-lg transition-colors disabled:opacity-50 text-sm"
                              >
                                {verifyLoading ? 'Checking...' : 'Verify Again'}
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                      
                      {/* Reward Details Section */}
                      <div className="mb-6">
                        <h4 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
                          <span className="w-5 h-5 rounded-full bg-yellow-100 text-yellow-700 flex items-center justify-center text-xs font-bold">2</span>
                          Reward Details
                        </h4>
                        
                        <div className="bg-gradient-to-br from-yellow-50 to-amber-50 rounded-lg p-4 border border-yellow-200">
                          <div className="space-y-3">
                            <div className="flex justify-between items-center">
                              <span className="text-gray-600">ECION Tokens</span>
                              <span className="font-bold text-yellow-700">{BOX_REWARDS[selectedBox as keyof typeof BOX_REWARDS]?.ecion} ECION</span>
                            </div>
                            <div className="flex justify-between items-center">
                              <span className="text-gray-600">USDC</span>
                              <span className="font-bold text-green-600">${BOX_REWARDS[selectedBox as keyof typeof BOX_REWARDS]?.usdc}</span>
                            </div>
                            <hr className="border-yellow-200" />
                            <div className="text-xs text-gray-500">
                              <p>ECION Contract:</p>
                              <code className="bg-white/50 px-2 py-1 rounded text-[10px] break-all block mt-1">{ECION_TOKEN_ADDRESS}</code>
                            </div>
                          </div>
                        </div>
                      </div>
                      
                      {/* Error Message */}
                      {boxError && (
                        <div className="mb-4 bg-red-50 border border-red-200 rounded-lg p-3 flex items-center gap-2 text-red-700 text-sm">
                          <AlertCircle className="w-4 h-4 flex-shrink-0" />
                          {boxError}
                        </div>
                      )}
                      
                      {/* Claim Button */}
                      <button
                        onClick={() => claimReward(selectedBox)}
                        disabled={!isFollowingDoteth || claimLoading}
                        className={`w-full font-bold py-3 px-4 rounded-xl transition-all duration-200 flex items-center justify-center gap-2 ${
                          isFollowingDoteth 
                            ? 'bg-gradient-to-r from-yellow-400 to-amber-500 hover:from-yellow-500 hover:to-amber-600 text-white shadow-lg hover:shadow-xl' 
                            : 'bg-gray-200 text-gray-500 cursor-not-allowed'
                        }`}
                      >
                        {claimLoading ? (
                          <>
                            <div className="animate-spin rounded-full h-5 w-5 border-2 border-white border-t-transparent"></div>
                            Claiming...
                          </>
                        ) : (
                          <>
                            <Gift className="w-5 h-5" />
                            Claim Reward
                          </>
                        )}
                      </button>
                    </>
                  )}
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {error && (
          <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-6 text-center">
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
                <h2 className="text-xl font-semibold text-gray-900">Recent Activity Snapshot</h2>
                <p className="text-sm text-gray-600 mt-1">Rolling totals for key timeframes</p>
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
          <div className="bg-white border border-yellow-200 text-yellow-800 px-4 py-3 rounded mb-8 text-center">
            No statistics available yet. Tips will appear here once activity is tracked.
          </div>
        )}

        <div className="mt-6 text-center">
          <button
            onClick={fetchAdminData}
            disabled={isLoading}
            className="bg-yellow-400 hover:bg-yellow-500 text-gray-900 font-medium py-2 px-4 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isLoading ? 'Refreshing...' : 'Refresh Data'}
          </button>
        </div>
      </div>

      {/* Custom CSS for shimmer effect */}
      <style jsx>{`
        .reward-box-glow {
          animation: glow 2s ease-in-out infinite alternate;
        }
        
        @keyframes glow {
          from {
            box-shadow: 0 0 10px rgba(251, 191, 36, 0.5), 0 0 20px rgba(251, 191, 36, 0.3);
          }
          to {
            box-shadow: 0 0 20px rgba(251, 191, 36, 0.8), 0 0 40px rgba(251, 191, 36, 0.5);
          }
        }
        
        .shimmer-effect {
          position: absolute;
          top: 0;
          left: -100%;
          width: 100%;
          height: 100%;
          background: linear-gradient(
            90deg,
            transparent,
            rgba(255, 255, 255, 0.4),
            transparent
          );
          animation: shimmer 2s infinite;
        }
        
        @keyframes shimmer {
          0% {
            left: -100%;
          }
          100% {
            left: 100%;
          }
        }
      `}</style>
    </div>
  );
}
