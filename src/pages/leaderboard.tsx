import { motion } from 'framer-motion';
import { useLeaderboardData } from '@/hooks/usePIT';
import { formatAmount } from '@/utils/contracts';
import { Trophy, Medal, Award, Crown, Star } from 'lucide-react';
import { useState, useEffect } from 'react';

export default function Leaderboard() {
  const [timeFilter, setTimeFilter] = useState<'24h' | '7d' | '30d'>('24h');
  const { tippers, earners, users, amounts, isLoading, isLoadingMore, hasMore, loadMore } = useLeaderboardData(timeFilter);
  const [mounted, setMounted] = useState(false);
  const [activeTab, setActiveTab] = useState<'tipped' | 'earned'>('tipped');

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) return null;

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.05,
      },
    },
  };

  const itemVariants = {
    hidden: { x: -50, opacity: 0 },
    visible: {
      x: 0,
      opacity: 1,
      transition: {
        type: 'spring',
        stiffness: 300,
        damping: 24,
      },
    },
  };

  const getRankIcon = (index: number) => {
    return <span className="text-lg font-semibold text-gray-600">#{index + 1}</span>;
  };

  const getRankStyle = (index: number) => {
    return 'bg-white hover:bg-gray-50 border border-gray-200';
  };

  return (
    <div className="space-y-4">

      {/* Tabs */}
      <div className="flex justify-center mb-4">
        <div className="flex bg-white rounded-lg p-1 shadow-sm">
          <button
            onClick={() => setActiveTab('tipped')}
            className={`px-6 py-2 text-sm font-medium rounded-md transition-colors ${
              activeTab === 'tipped'
                ? 'bg-accent text-white'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            Tipped
          </button>
          <button
            onClick={() => setActiveTab('earned')}
            className={`px-6 py-2 text-sm font-medium rounded-md transition-colors ${
              activeTab === 'earned'
                ? 'bg-accent text-white'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            Earned
          </button>
        </div>
      </div>

      {/* Full leaderboard */}
      <motion.div
        variants={containerVariants}
        initial="hidden"
        animate="visible"
        className="bg-white rounded-2xl p-8 card-shadow"
      >
        {/* Title and Time Filter on Same Line */}
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-bold text-accent">
            {activeTab === 'tipped' ? 'Tippers' : 'Earners'}
          </h2>
          
          {/* Time Filter - Smaller */}
          <div className="flex space-x-1 bg-gray-100 rounded-lg p-1">
            {(['24h', '7d', '30d'] as const).map((period) => (
              <button
                key={period}
                onClick={() => setTimeFilter(period)}
                className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                  timeFilter === period
                    ? 'bg-accent text-white'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                {period}
              </button>
            ))}
          </div>
        </div>
        
        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="animate-pulse">
                <div className="flex items-center justify-between p-4 rounded-xl bg-gray-100">
                  <div className="flex items-center space-x-4">
                    <div className="flex items-center justify-center w-8">
                      <div className="w-6 h-4 bg-gray-300 rounded"></div>
                    </div>
                    <div className="flex items-center space-x-3">
                      <div className="w-8 h-8 bg-gray-300 rounded-full"></div>
                      <div>
                        <div className="w-24 h-4 bg-gray-300 rounded mb-1"></div>
                        <div className="w-16 h-3 bg-gray-300 rounded"></div>
                      </div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="w-16 h-5 bg-gray-300 rounded mb-1"></div>
                    <div className="w-12 h-3 bg-gray-300 rounded"></div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (activeTab === 'earned' ? earners : tippers).length === 0 ? (
          <div className="text-center py-12 text-gray-500">
            <p className="text-lg">No tips received yet!</p>
            <p className="mt-2">Start engaging to earn tips</p>
          </div>
        ) : (
          <div className="space-y-3">
            {(activeTab === 'earned' ? earners : tippers).map((user, index) => (
              <motion.div
                key={user.userAddress}
                variants={itemVariants}
                whileHover={{ x: 10 }}
                className={`flex items-center justify-between p-4 rounded-xl transition-all duration-200 ${getRankStyle(
                  index
                )}`}
              >
                <div className="flex items-center space-x-4">
                  <div className="flex items-center justify-center w-8">
                    {getRankIcon(index)}
                  </div>
                  <div className="flex items-center space-x-3">
                    {user.pfpUrl ? (
                      <img
                        src={user.pfpUrl}
                        alt={user.displayName || user.username}
                        className="w-8 h-8 rounded-full"
                      />
                    ) : (
                      <div className="w-8 h-8 bg-gray-200 rounded-full flex items-center justify-center">
                        <span className="text-xs font-medium text-gray-600">
                          {(user.displayName || user.username || user.userAddress)?.[0]?.toUpperCase()}
                        </span>
                      </div>
                    )}
                    <div>
                      <p className="font-medium text-gray-900">
                        {user.displayName || user.username || `${user.userAddress.slice(0, 6)}...${user.userAddress.slice(-4)}`}
                      </p>
                      <p className="text-sm text-gray-500">
                        {user.username ? `@${user.username}` : `Address`}
                      </p>
                    </div>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-lg font-semibold text-gray-900">
                    {user.totalAmount.toFixed(2)} USDC
                  </p>
                  <p className="text-sm text-gray-500">
                    {activeTab === 'tipped' ? 'tipped' : 'earned'}
                  </p>
                </div>
              </motion.div>
            ))}
            
            {/* Load More Button - Only show if there are 10+ users */}
            {hasMore && (activeTab === 'tipped' ? tippers : earners).length >= 10 && (
              <div className="flex justify-center mt-4">
                <button
                  onClick={loadMore}
                  disabled={isLoadingMore}
                  className="bg-gray-100 text-gray-700 px-4 py-2 rounded-md text-sm font-medium hover:bg-gray-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed border border-gray-200"
                >
                  {isLoadingMore ? (
                    <div className="flex items-center space-x-2">
                      <div className="animate-spin rounded-full h-3 w-3 border-2 border-gray-400 border-t-gray-600"></div>
                      <span>Loading...</span>
                    </div>
                  ) : (
                    'Load More'
                  )}
                </button>
              </div>
            )}
          </div>
        )}
      </motion.div>
    </div>
  );
}