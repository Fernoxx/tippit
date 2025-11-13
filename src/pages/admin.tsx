import { useState, useEffect, useMemo } from 'react';
import { motion } from 'framer-motion';

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

export default function Admin() {
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [password, setPassword] = useState('');
  const [authError, setAuthError] = useState<string | null>(null);

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