import { useState, useEffect } from 'react';
import Head from 'next/head';
import LoadingSpinner from '@/components/LoadingSpinner';
import { Trophy, Medal, Award, Crown, Star } from 'lucide-react';
import { motion } from 'framer-motion';

const BACKEND_URL = (process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:3001').replace(/\/$/, '');

interface Buyer {
  rank: number;
  address: string;
  amountSpent: number;
  username: string | null;
  displayName: string | null;
  pfpUrl: string | null;
  fid: number | null;
}

export default function TokenLeaderboard() {
  const [leaderboard, setLeaderboard] = useState<Buyer[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchLeaderboard();
  }, []);

  const fetchLeaderboard = async () => {
    try {
      setIsLoading(true);
      setError(null);
      
      console.log('🔍 Fetching token leaderboard...');
      const response = await fetch(`${BACKEND_URL}/api/token/top-buyers?hours=24&limit=10`);
      
      console.log('📡 Response status:', response.status);
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error('❌ API Error:', response.status, errorText);
        throw new Error(`Failed to fetch leaderboard: ${response.status} - ${errorText}`);
      }
      
      const data = await response.json();
      console.log('📊 Leaderboard data:', data);
      
      if (data.success && data.leaderboard) {
        console.log(`✅ Loaded ${data.leaderboard.length} buyers`);
        setLeaderboard(data.leaderboard);
      } else {
        console.error('❌ Invalid response format:', data);
        throw new Error(data.error || 'Failed to load leaderboard');
      }
    } catch (err: any) {
      console.error('❌ Error fetching leaderboard:', err);
      setError(err.message || 'Failed to load leaderboard');
    } finally {
      setIsLoading(false);
    }
  };

  const shortenAddress = (address: string) => {
    if (!address) return '';
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
  };

  const getRankIcon = (rank: number) => {
    const rankColor = rank <= 3 ? 'text-yellow-500' : 'text-gray-600';
    switch (rank) {
      case 1:
        return <Crown className={`w-6 h-6 ${rankColor}`} />;
      case 2:
        return <Medal className={`w-6 h-6 ${rankColor}`} />;
      case 3:
        return <Award className={`w-6 h-6 ${rankColor}`} />;
      default:
        return <span className={`text-lg font-semibold ${rankColor}`}>#{rank}</span>;
    }
  };

  const getDefaultPfp = () => {
    return '/icon.png'; // Default user avatar from public folder
  };

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
    <>
      <Head>
        <title>Token Leaderboard - Ecion</title>
        <meta name="description" content="Top token buyers leaderboard" />
      </Head>

      <div className="min-h-screen bg-yellow-50">
        <div className="max-w-4xl mx-auto px-4 py-8">
          <div className="text-center mb-8">
            <h1 className="text-4xl font-bold text-gray-900 mb-2">Leaderboard</h1>
            <p className="text-gray-600">Top 10 token buyers in the last 24 hours</p>
          </div>

          {isLoading ? (
            <div className="flex justify-center items-center py-20">
              <LoadingSpinner size="lg" />
            </div>
          ) : error ? (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-center">
              <p className="text-red-600">{error}</p>
              <button
                onClick={fetchLeaderboard}
                className="mt-4 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700"
              >
                Retry
              </button>
            </div>
          ) : leaderboard.length === 0 ? (
            <div className="bg-white rounded-2xl p-8 text-center">
              <p className="text-gray-600">No buyers found in the last 24 hours</p>
            </div>
          ) : (
            <motion.div
              variants={containerVariants}
              initial="hidden"
              animate="visible"
              className="space-y-4"
            >
              {leaderboard.map((buyer) => (
                <motion.div
                  key={buyer.address}
                  variants={itemVariants}
                  className={`bg-white rounded-2xl p-6 shadow-lg hover:shadow-xl transition-shadow ${
                    buyer.rank <= 3 ? 'border-2 border-yellow-400' : ''
                  }`}
                >
                  <div className="flex items-center gap-4">
                    <div className={`flex-shrink-0 ${buyer.rank <= 3 ? 'text-yellow-500' : 'text-gray-600'}`}>
                      {getRankIcon(buyer.rank)}
                    </div>

                    <div className="flex-shrink-0">
                      <img
                        src={buyer.pfpUrl || getDefaultPfp()}
                        alt={buyer.username || buyer.address}
                        className="w-16 h-16 rounded-full border-2 border-gray-200"
                        onError={(e) => {
                          e.currentTarget.src = getDefaultPfp();
                        }}
                      />
                    </div>

                    <div className="flex-grow">
                      <div className="flex items-center gap-2">
                        <h3 className="text-xl font-semibold text-gray-900">
                          {buyer.displayName || buyer.username || shortenAddress(buyer.address)}
                        </h3>
                        {buyer.username && (
                          <span className="text-sm text-gray-500">@{buyer.username}</span>
                        )}
                      </div>
                      {!buyer.username && (
                        <p className="text-sm text-gray-500 font-mono">{buyer.address}</p>
                      )}
                    </div>

                    <div className="text-right">
                      <div className={`text-2xl font-bold ${buyer.rank <= 3 ? 'text-yellow-600' : 'text-accent'}`}>
                        ${buyer.amountSpent.toFixed(2)}
                      </div>
                      <div className="text-sm text-gray-500">spent</div>
                    </div>
                  </div>
                </motion.div>
              ))}
            </motion.div>
          )}
        </div>
      </div>
    </>
  );
}
