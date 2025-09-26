import { useHomepageData, useLeaderboardData } from '@/hooks/usePIT';
import { useFarcasterWallet } from '@/hooks/useFarcasterWallet';
import { formatAmount } from '@/utils/contracts';
import { useState, useEffect } from 'react';

export default function Home() {
  const [timeFilter, setTimeFilter] = useState<'24h' | '7d' | '30d'>('24h');
  const { users: tipsReceivedUsers, amounts: tipsReceivedAmounts } = useHomepageData(timeFilter);
  const { users: tipsGivenUsers, amounts: tipsGivenAmounts } = useLeaderboardData(timeFilter);
  const { connectWallet, isLoading, isConnected, currentUser } = useFarcasterWallet();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) return null;

  return (
    <div className="max-w-4xl mx-auto px-4 py-8 bg-yellow-50 min-h-full">
        {/* Hero Section - Only show if wallet not connected */}
        {!isConnected && (
          <div className="text-center py-12">
            <h2 className="text-3xl font-bold text-gray-900 mb-4">
              Tip Your Audience
            </h2>
            <p className="text-lg text-gray-600 mb-8 max-w-2xl mx-auto">
              With Ecion you can boost your casts by tipping engagers for their interactions easily.
            </p>
          </div>
        )}
        
        {/* Time Filter for Top Content */}
        {isConnected && (
          <div className="flex justify-center mb-6">
            <div className="flex space-x-2 bg-white rounded-lg p-1 shadow-sm">
              {(['24h', '7d', '30d'] as const).map((period) => (
                <button
                  key={period}
                  onClick={() => setTimeFilter(period)}
                  className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${
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
        )}
        

        {/* Top Tippers */}
        <div className="mb-12">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Top Engager Tippers</h3>
          <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
            {tipsGivenUsers.length === 0 ? (
              <div className="text-center py-12 text-gray-500">
                <p className="text-lg">No active engager tippers yet!</p>
                <p className="text-sm mt-1">Be the first to set up reverse tipping for your engagers</p>
              </div>
            ) : (
              tipsGivenUsers.map((user, index) => (
                <div
                  key={user}
                  className={`flex items-center justify-between p-4 ${
                    index !== tipsGivenUsers.length - 1 ? 'border-b border-gray-100' : ''
                  }`}
                >
                  <div className="flex items-center space-x-3">
                    <div className="w-8 h-8 bg-gray-100 rounded-full flex items-center justify-center text-sm font-medium text-gray-600">
                      {index + 1}
                    </div>
                    <div>
                      <p className="font-medium text-gray-900">
                        {user.slice(0, 6)}...{user.slice(-4)}
                      </p>
                      <p className="text-sm text-gray-500">Farcaster User</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="font-semibold text-gray-900">
                      {formatAmount(tipsGivenAmounts[index])} USDC
                    </p>
                    <p className="text-sm text-gray-500">per interaction</p>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

    </div>
  );
}