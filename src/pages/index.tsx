import { motion } from 'framer-motion';
import { useHomepageData, useLeaderboardData } from '@/hooks/usePIT';
import { formatAmount, CONTRACTS } from '@/utils/contracts';
import { Heart, Zap, Users, TrendingUp, Info } from 'lucide-react';
import { useAccount } from 'wagmi';
import { useState, useEffect } from 'react';

export default function Home() {
  const { users: tipsReceivedUsers, amounts: tipsReceivedAmounts } = useHomepageData();
  const { users: tipsGivenUsers, amounts: tipsGivenAmounts } = useLeaderboardData();
  const { address } = useAccount();
  const [mounted, setMounted] = useState(false);
  const [activeTab, setActiveTab] = useState<'following' | 'followers' | 'anyone'>('anyone');

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) return null;

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.1,
      },
    },
  };

  const itemVariants = {
    hidden: { y: 20, opacity: 0 },
    visible: {
      y: 0,
      opacity: 1,
      transition: {
        type: 'spring',
        stiffness: 300,
        damping: 24,
      },
    },
  };

  return (
    <div className="space-y-8">
      {/* Hero Section */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="text-center py-12"
      >
        <h1 className="text-5xl md:text-6xl font-bold mb-4">
          <span className="text-accent">Ecion</span> - Reverse Tipping
        </h1>
        <p className="text-xl md:text-2xl text-gray-700 mb-8">
          Get tipped for liking posts on Farcaster! 💰
        </p>
        
        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-4xl mx-auto">
          <motion.div
            whileHover={{ scale: 1.05 }}
            className="bg-white rounded-2xl p-6 card-shadow"
          >
            <Users className="w-12 h-12 text-accent mx-auto mb-3" />
            <h3 className="text-3xl font-bold text-accent">{users.length}</h3>
            <p className="text-gray-600">Active Tippers</p>
          </motion.div>
          
          <motion.div
            whileHover={{ scale: 1.05 }}
            className="bg-white rounded-2xl p-6 card-shadow"
          >
            <Heart className="w-12 h-12 text-accent mx-auto mb-3" />
            <h3 className="text-3xl font-bold text-accent">
              {amounts.length > 0 ? formatAmount(amounts[0]) : '0'} USDC
            </h3>
            <p className="text-gray-600">Top Tip per Like</p>
          </motion.div>
          
          <motion.div
            whileHover={{ scale: 1.05 }}
            className="bg-white rounded-2xl p-6 card-shadow"
          >
            <TrendingUp className="w-12 h-12 text-accent mx-auto mb-3" />
            <h3 className="text-3xl font-bold text-accent">24h</h3>
            <p className="text-gray-600">Avg Response Time</p>
          </motion.div>
        </div>
      </motion.div>

      {/* Top Tippers */}
      <div className="bg-white rounded-2xl p-8 card-shadow">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-3xl font-bold text-accent">Top Tippers</h2>
          <Zap className="w-8 h-8 text-accent animate-pulse" />
        </div>

        <motion.div
          variants={containerVariants}
          initial="hidden"
          animate="visible"
          className="space-y-4"
        >
          {users.length === 0 ? (
            <div className="text-center py-12 text-gray-500">
              <p className="text-xl">No active tippers yet!</p>
              <p className="mt-2">Be the first to set up reverse tipping</p>
            </div>
          ) : (
            users.map((user, index) => (
              <motion.div
                key={user}
                variants={itemVariants}
                whileHover={{ x: 10 }}
                className={`flex items-center justify-between p-4 rounded-xl transition-all duration-200 ${
                  index === 0
                    ? 'bg-gradient-to-r from-accent to-blue-600 text-white'
                    : 'bg-gray-50 hover:bg-gray-100'
                }`}
              >
                <div className="flex items-center space-x-4">
                  <div
                    className={`w-12 h-12 rounded-full flex items-center justify-center font-bold text-xl ${
                      index === 0 ? 'bg-white text-accent' : 'bg-accent text-white'
                    }`}
                  >
                    {index + 1}
                  </div>
                  <div>
                    <p className={`font-semibold ${index === 0 ? '' : 'text-gray-800'}`}>
                      {user.slice(0, 6)}...{user.slice(-4)}
                    </p>
                    <p className={`text-sm ${index === 0 ? 'text-white/80' : 'text-gray-600'}`}>
                      Farcaster User
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <p className={`text-2xl font-bold ${index === 0 ? '' : 'text-accent'}`}>
                    {formatAmount(amounts[index])} USDC
                  </p>
                  <p className={`text-sm ${index === 0 ? 'text-white/80' : 'text-gray-600'}`}>
                    per like
                  </p>
                </div>
              </motion.div>
            ))
          )}
        </motion.div>
      </div>

      {/* CTA Section */}
      {!address && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
          className="bg-gradient-to-r from-accent to-blue-600 rounded-2xl p-8 text-white text-center"
        >
          <h3 className="text-3xl font-bold mb-4">Ready to Start Earning?</h3>
          <p className="text-xl mb-6">
            Connect your wallet and start getting tipped for your engagement!
          </p>
          <button className="bg-white text-accent px-8 py-4 rounded-xl font-bold text-lg hover:scale-105 transition-transform">
            Connect Wallet to Start
          </button>
        </motion.div>
      )}
    </div>
  );
}