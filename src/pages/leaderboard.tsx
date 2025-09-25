import { motion } from 'framer-motion';
import { useLeaderboardData } from '@/hooks/usePIT';
import { formatAmount } from '@/utils/contracts';
import { Trophy, Medal, Award, Crown, Star } from 'lucide-react';
import { useState, useEffect } from 'react';

export default function Leaderboard() {
  const { users, amounts } = useLeaderboardData();
  const [mounted, setMounted] = useState(false);

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
    switch (index) {
      case 0:
        return <Crown className="w-8 h-8 text-yellow-500" />;
      case 1:
        return <Medal className="w-8 h-8 text-gray-400" />;
      case 2:
        return <Award className="w-8 h-8 text-orange-600" />;
      default:
        return <Star className="w-6 h-6 text-accent" />;
    }
  };

  const getRankStyle = (index: number) => {
    switch (index) {
      case 0:
        return 'bg-gradient-to-r from-yellow-400 to-yellow-600 text-white scale-105';
      case 1:
        return 'bg-gradient-to-r from-gray-300 to-gray-500 text-white';
      case 2:
        return 'bg-gradient-to-r from-orange-400 to-orange-600 text-white';
      default:
        return 'bg-white hover:bg-gray-50';
    }
  };

  return (
    <div className="space-y-8">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="text-center"
      >
        <div className="flex items-center justify-center mb-4">
          <Trophy className="w-16 h-16 text-accent mr-4" />
          <h1 className="text-5xl font-bold text-accent">Leaderboard</h1>
        </div>
        <p className="text-xl text-gray-700">
          Top earners in the Ecion ecosystem
        </p>
      </motion.div>

      {/* Podium for top 3 */}
      {users.length >= 3 && (
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.2 }}
          className="flex items-end justify-center space-x-4 mb-8"
        >
          {/* 2nd place */}
          <div className="text-center">
            <motion.div
              whileHover={{ y: -10 }}
              className="bg-gradient-to-r from-gray-300 to-gray-500 rounded-t-2xl p-6 pb-12"
            >
              <Medal className="w-12 h-12 text-white mx-auto mb-2" />
              <p className="text-white font-bold text-sm mb-1">
                {users[1].slice(0, 6)}...{users[1].slice(-4)}
              </p>
              <p className="text-white text-2xl font-bold">
                {formatAmount(amounts[1])} USDC
              </p>
            </motion.div>
            <div className="bg-gray-400 h-32 rounded-b-2xl flex items-center justify-center">
              <span className="text-white text-4xl font-bold">2</span>
            </div>
          </div>

          {/* 1st place */}
          <div className="text-center">
            <motion.div
              whileHover={{ y: -10 }}
              className="bg-gradient-to-r from-yellow-400 to-yellow-600 rounded-t-2xl p-6 pb-12"
            >
              <Crown className="w-16 h-16 text-white mx-auto mb-2" />
              <p className="text-white font-bold text-sm mb-1">
                {users[0].slice(0, 6)}...{users[0].slice(-4)}
              </p>
              <p className="text-white text-3xl font-bold">
                {formatAmount(amounts[0])} USDC
              </p>
            </motion.div>
            <div className="bg-yellow-500 h-40 rounded-b-2xl flex items-center justify-center">
              <span className="text-white text-5xl font-bold">1</span>
            </div>
          </div>

          {/* 3rd place */}
          <div className="text-center">
            <motion.div
              whileHover={{ y: -10 }}
              className="bg-gradient-to-r from-orange-400 to-orange-600 rounded-t-2xl p-6 pb-12"
            >
              <Award className="w-12 h-12 text-white mx-auto mb-2" />
              <p className="text-white font-bold text-sm mb-1">
                {users[2].slice(0, 6)}...{users[2].slice(-4)}
              </p>
              <p className="text-white text-2xl font-bold">
                {formatAmount(amounts[2])} USDC
              </p>
            </motion.div>
            <div className="bg-orange-500 h-24 rounded-b-2xl flex items-center justify-center">
              <span className="text-white text-3xl font-bold">3</span>
            </div>
          </div>
        </motion.div>
      )}

      {/* Full leaderboard */}
      <motion.div
        variants={containerVariants}
        initial="hidden"
        animate="visible"
        className="bg-white rounded-2xl p-8 card-shadow"
      >
        <h2 className="text-2xl font-bold text-accent mb-6">All Rankings</h2>
        
        {users.length === 0 ? (
          <div className="text-center py-12 text-gray-500">
            <Trophy className="w-16 h-16 mx-auto mb-4 text-gray-300" />
            <p className="text-xl">No tips received yet!</p>
            <p className="mt-2">Start engaging to earn tips</p>
          </div>
        ) : (
          <div className="space-y-3">
            {users.map((user, index) => (
              <motion.div
                key={user}
                variants={itemVariants}
                whileHover={{ x: 10 }}
                className={`flex items-center justify-between p-4 rounded-xl transition-all duration-200 ${getRankStyle(
                  index
                )}`}
              >
                <div className="flex items-center space-x-4">
                  <div className="flex items-center justify-center w-12">
                    {getRankIcon(index)}
                  </div>
                  <div>
                    <p
                      className={`font-semibold ${
                        index < 3 ? '' : 'text-gray-800'
                      }`}
                    >
                      {user.slice(0, 6)}...{user.slice(-4)}
                    </p>
                    <p
                      className={`text-sm ${
                        index < 3 ? 'text-white/80' : 'text-gray-600'
                      }`}
                    >
                      Rank #{index + 1}
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <p
                    className={`text-2xl font-bold ${
                      index < 3 ? '' : 'text-accent'
                    }`}
                  >
                    {formatAmount(amounts[index])} USDC
                  </p>
                  <p
                    className={`text-sm ${
                      index < 3 ? 'text-white/80' : 'text-gray-600'
                    }`}
                  >
                    Total earned
                  </p>
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </motion.div>
    </div>
  );
}