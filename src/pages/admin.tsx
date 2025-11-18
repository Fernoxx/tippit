import { useState, useEffect, useMemo } from 'react';
import { motion } from 'framer-motion';
import { useFarcasterWallet } from '@/hooks/useFarcasterWallet';
import { Calendar } from 'lucide-react';
import { useWriteContract, useWaitForTransactionReceipt } from 'wagmi';
import { parseUnits } from 'viem';

const BACKEND_URL = (process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:3001').replace(/\/$/, '');

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

interface CheckinStatus {
  checkedInToday: boolean;
  streak: number;
  lastCheckinDate: string | null;
  currentDayUTC: string;
  fid?: number;
  rewardClaimed?: boolean;
  claimedDays?: number[];
}

const DAILY_REWARDS = {
  1: '69',
  2: '1000',
  3: '5000',
  4: '10000',
  5: '20000',
  6: '30000',
  7: '100000'
};

export default function Admin() {
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [password, setPassword] = useState('');
  const [authError, setAuthError] = useState<string | null>(null);
  const [showDailyCheckin, setShowDailyCheckin] = useState(false);
  const [checkinStatus, setCheckinStatus] = useState<CheckinStatus | null>(null);
  const [checkinLoading, setCheckinLoading] = useState(false);
  const [checkinError, setCheckinError] = useState<string | null>(null);
  const { address, isConnected, currentUser } = useFarcasterWallet();
  
  // Daily check-in contract address (set this when contract is deployed)
  const DAILY_CHECKIN_CONTRACT = process.env.NEXT_PUBLIC_DAILY_CHECKIN_CONTRACT || '';
  
  const { writeContract, data: hash, isPending: isContractPending } = useWriteContract();
  const { isLoading: isConfirming, isSuccess: isConfirmed } = useWaitForTransactionReceipt({
    hash,
  });

  // Define fetchAdminData BEFORE it's used in useEffect and handleLogin
  const fetchAdminData = async () => {
    try {
      setIsLoading(true);
      setError(null);

      // Get password from sessionStorage (stored after login)
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
        const errorText = await statsResponse.text();
        console.error('Stats API error:', statsResponse.status, errorText);
        throw new Error(`Stats request failed with status ${statsResponse.status}: ${errorText}`);
      }
      const statsData = await statsResponse.json();
      console.log('Stats data received:', statsData);
      
      const payload = (statsData.stats as AdminStats | undefined) ?? (statsData.data as AdminStats | undefined) ?? statsData;

      if (payload && (payload.allTime || payload.last24h)) {
        setStats({
          ...payload,
          timestamp: statsData.timestamp ?? payload.timestamp ?? new Date().toISOString(),
        });
      } else {
        console.warn('Invalid stats payload:', payload);
        setStats(null);
      }

      // Removed recent tips fetching - not needed per user request
    } catch (err) {
      console.error('Error fetching admin data:', err);
      setError('Failed to fetch admin data');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    // Check if already authenticated in sessionStorage - require BOTH auth status AND password
    const authStatus = sessionStorage.getItem('admin_authenticated');
    const storedPassword = sessionStorage.getItem('admin_password');
    
    // Only authenticate if BOTH exist
    if (authStatus === 'true' && storedPassword) {
      setIsAuthenticated(true);
      fetchAdminData();
      const interval = setInterval(fetchAdminData, 30000);
      return () => clearInterval(interval);
    } else {
      // Clear invalid session data
      sessionStorage.removeItem('admin_authenticated');
      sessionStorage.removeItem('admin_password');
      setIsAuthenticated(false);
    }
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);
    
    try {
      // Send password to backend for validation (never expose password in frontend)
      const response = await fetch(`${BACKEND_URL}/api/admin/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ password }),
      });

      if (response.ok) {
        const data = await response.json();
        // Store authentication status (not the password itself for security)
        setIsAuthenticated(true);
        sessionStorage.setItem('admin_authenticated', 'true');
        // Store password temporarily in sessionStorage for API calls (not ideal but needed)
        // TODO: Implement proper JWT/session tokens
        sessionStorage.setItem('admin_password', password);
        fetchAdminData();
        const interval = setInterval(fetchAdminData, 30000);
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

  // Hooks must be called unconditionally - move useMemo before conditional return
  const lastUpdated = useMemo(() => {
    if (!stats?.timestamp) return null;
    return new Date(stats.timestamp).toLocaleString();
  }, [stats?.timestamp]);

  // Fetch daily check-in status
  const fetchCheckinStatus = async () => {
    if (!address || !isConnected) {
      setCheckinError('Please connect your wallet first');
      return;
    }

    try {
      setCheckinLoading(true);
      setCheckinError(null);
      const response = await fetch(`${BACKEND_URL}/api/daily-checkin/status?address=${address}`);
      const data = await response.json();
      
      if (data.success) {
        setCheckinStatus(data);
      } else {
        setCheckinError(data.error || 'Failed to fetch check-in status');
      }
    } catch (err: any) {
      console.error('Error fetching check-in status:', err);
      setCheckinError(err.message || 'Failed to fetch check-in status');
    } finally {
      setCheckinLoading(false);
    }
  };

  // Handle box click - user signs transaction with contract
  const handleBoxClick = async (dayNumber: number) => {
    if (!address || !isConnected) {
      setCheckinError('Please connect your wallet first');
      return;
    }

    // Only allow clicking current day's box
    if (!checkinStatus || checkinStatus.streak !== dayNumber) {
      return;
    }

    // Check if already claimed
    if (checkinStatus.claimedDays?.includes(dayNumber)) {
      setCheckinError('Reward already claimed today');
      return;
    }

    if (!DAILY_CHECKIN_CONTRACT) {
      setCheckinError('Contract not configured. Please set NEXT_PUBLIC_DAILY_CHECKIN_CONTRACT');
      return;
    }

    try {
      setCheckinLoading(true);
      setCheckinError(null);

      // User signs transaction to claim reward
      // Contract will verify FID via backend and send tokens
      writeContract({
        address: DAILY_CHECKIN_CONTRACT as `0x${string}`,
        abi: [
          {
            name: 'claimDailyReward',
            type: 'function',
            stateMutability: 'nonpayable',
            inputs: [
              { name: 'dayNumber', type: 'uint8' }
            ],
            outputs: []
          }
        ],
        functionName: 'claimDailyReward',
        args: [dayNumber as any],
      });
    } catch (err: any) {
      console.error('Error initiating claim:', err);
      setCheckinError(err.message || 'Failed to initiate claim');
      setCheckinLoading(false);
    }
  };

  // Handle transaction confirmation
  useEffect(() => {
    if (isConfirmed && hash) {
      // Transaction confirmed, refresh status
      fetchCheckinStatus();
      setCheckinLoading(false);
      alert('🎉 Success! Your reward has been claimed!');
    }
  }, [isConfirmed, hash]);

  // Fetch check-in status when modal opens
  useEffect(() => {
    if (showDailyCheckin && isConnected && address) {
      fetchCheckinStatus();
    }
  }, [showDailyCheckin, isConnected, address]);

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
        <div className="text-center mb-8 relative">
          <button
            onClick={() => {
              if (!showDailyCheckin && isConnected && address) {
                fetchCheckinStatus();
              }
              setShowDailyCheckin(!showDailyCheckin);
            }}
            className="absolute top-0 right-0 bg-yellow-400 hover:bg-yellow-500 text-gray-900 text-xs font-medium py-1.5 px-3 rounded-md transition-colors flex items-center space-x-1.5 shadow-sm"
            title="Daily Check-in"
          >
            <Calendar size={14} />
            <span>Daily Check-in</span>
          </button>
          
          <h1 className="text-4xl font-bold text-gray-900 mb-2">Admin Dashboard</h1>
          <p className="text-gray-600">Live tipping statistics for Ecion</p>
          {lastUpdated && (
            <p className="text-sm text-gray-500 mt-2">Last updated: {lastUpdated}</p>
          )}
        </div>

        {/* Daily Check-in Boxes - Inline Display */}
        {showDailyCheckin && (
          <div className="mb-8 bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            {!isConnected ? (
              <div className="text-center py-4">
                <p className="text-gray-600">Please connect your wallet to check in</p>
              </div>
            ) : (
              <>
                {checkinLoading && !checkinStatus ? (
                  <div className="text-center py-4">
                    <div className="animate-spin rounded-full h-8 w-8 border-4 border-yellow-400 border-t-transparent mx-auto mb-2"></div>
                    <p className="text-sm text-gray-600">Loading...</p>
                  </div>
                ) : checkinStatus ? (
                  <>
                    {/* Streak Count */}
                    <div className="text-center mb-6">
                      <p className="text-xs text-gray-500">Streak: <span className="font-bold text-yellow-600">{checkinStatus.streak}</span></p>
                    </div>
                    
                    {/* 7 Gift Boxes */}
                    <div className="grid grid-cols-7 gap-2 max-w-xl mx-auto">
                      {[1, 2, 3, 4, 5, 6, 7].map((day) => {
                        const isCurrentDay = checkinStatus.streak === day;
                        const isClaimed = checkinStatus.claimedDays?.includes(day) || false;
                        const isPast = checkinStatus.streak > day;
                        const isFuture = checkinStatus.streak < day;
                        const canClick = isCurrentDay && !isClaimed;
                        
                        return (
                          <div
                            key={day}
                            className={`relative aspect-square flex items-center justify-center rounded-xl transition-all duration-300 ${
                              isClaimed
                                ? 'bg-yellow-200/60 border border-yellow-400/50'
                                : isCurrentDay
                                ? 'bg-yellow-200/60 border border-yellow-400/50 shadow-[0_0_20px_rgba(250,204,21,0.6)] cursor-pointer hover:scale-105'
                                : isPast
                                ? 'bg-yellow-200/40 border border-yellow-300/30 opacity-60'
                                : 'bg-yellow-200/30 border border-yellow-300/20 opacity-40'
                            }`}
                            onClick={canClick && !isContractPending && !isConfirming ? () => handleBoxClick(day) : undefined}
                          >
                            {/* Glow effect ONLY for current day */}
                            {isCurrentDay && !isClaimed && (
                              <div className="absolute inset-0 rounded-xl bg-gradient-to-r from-transparent via-yellow-300/50 to-transparent animate-shimmer"></div>
                            )}
                            
                            {/* Gift Box Icon */}
                            <div className={`relative z-10 ${isClaimed ? 'text-yellow-700' : isCurrentDay ? 'text-yellow-600' : 'text-yellow-500/60'}`}>
                              <svg className="w-14 h-14" fill="currentColor" viewBox="0 0 24 24">
                                <path d="M20 6h-2.18c.11-.31.18-.65.18-1a2.996 2.996 0 0 0-5.5-1.65l-.5.67-.5-.68C10.96 2.54 10 2 9 2 7.34 2 6 3.34 6 5c0 .35.07.69.18 1H4c-1.11 0-1.99.89-1.99 2L2 19c0 1.11.89 2 2 2h16c1.11 0 2-.89 2-2V8c0-1.11-.89-2-2-2zm-5-2c.55 0 1 .45 1 1s-.45 1-1 1-1-.45-1-1 .45-1 1-1zM9 4c.55 0 1 .45 1 1s-.45 1-1 1-1-.45-1-1 .45-1 1-1zm11 15H4v-2h16v2zm0-5H4V8h5.08L7 10.83 8.62 12 11 8.76l1-1.36 1 1.36L15.38 12 17 10.83 14.92 8H20v6z"/>
                              </svg>
                              {isClaimed && (
                                <div className="absolute -top-1 -right-1 w-5 h-5 bg-green-500 rounded-full flex items-center justify-center border-2 border-white shadow-md">
                                  <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 20 20">
                                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                                  </svg>
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                    
                    {/* Reset button for testing */}
                    <div className="mt-4 text-center">
                      <button
                        onClick={async () => {
                          if (!address) return;
                          try {
                            const response = await fetch(`${BACKEND_URL}/api/daily-checkin/reset`, {
                              method: 'POST',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({ address }),
                            });
                            const data = await response.json();
                            if (data.success) {
                              await fetchCheckinStatus();
                              alert('✅ Daily check-in reset! You can test again.');
                            }
                          } catch (err) {
                            console.error('Reset error:', err);
                          }
                        }}
                        className="text-xs text-gray-500 hover:text-gray-700 underline"
                      >
                        Reset (for testing)
                      </button>
                    </div>
                    
                    {(checkinError || isContractPending || isConfirming) && (
                      <div className="mt-4 bg-red-50 border border-red-200 rounded-lg p-3 text-center">
                        {isContractPending && (
                          <p className="text-sm text-yellow-800">⏳ Please confirm transaction in your wallet...</p>
                        )}
                        {isConfirming && (
                          <p className="text-sm text-yellow-800">⏳ Waiting for transaction confirmation...</p>
                        )}
                        {checkinError && !isContractPending && !isConfirming && (
                          <p className="text-sm text-red-800">{checkinError}</p>
                        )}
                      </div>
                    )}
                  </>
                ) : (
                  <div className="text-center py-4">
                    <p className="text-gray-600">Failed to load check-in status</p>
                    <button
                      onClick={fetchCheckinStatus}
                      className="mt-2 text-yellow-600 hover:text-yellow-700 text-sm"
                    >
                      Retry
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        )}

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
    </div>
  );
}