import { useLeaderboardData } from '@/hooks/usePIT';
import { formatAmount } from '@/utils/contracts';
import { Trophy, Share2 } from 'lucide-react';
import { useState, useEffect } from 'react';

export default function Leaderboard() {
  const [timeFilter, setTimeFilter] = useState<'24h' | '7d' | '30d'>('30d');
  const { users, amounts, isLoading } = useLeaderboardData(timeFilter);
  const [mounted, setMounted] = useState(false);
  const [activeTab, setActiveTab] = useState<'tipped' | 'earned'>('tipped');

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) return null;

  return (
    <div className="max-w-md mx-auto px-4 py-6 bg-gray-50 min-h-full">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center space-x-2">
          <div className="w-8 h-8 bg-gray-800 rounded-full"></div>
          <span className="text-lg font-medium">Nolce</span>
        </div>
        <div className="w-6 h-6 bg-gray-300 rounded"></div>
      </div>

      {/* Title and Time Filters */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center space-x-2">
          <h1 className="text-xl font-bold">Leaderboard</h1>
          <Share2 className="w-4 h-4 text-gray-500" />
        </div>
        <div className="flex space-x-1">
          {(['24h', '7d', '30d'] as const).map((period) => (
            <button
              key={period}
              onClick={() => setTimeFilter(period)}
              className={`px-3 py-1 text-sm rounded-full transition-colors ${
                timeFilter === period
                  ? 'bg-gray-200 text-gray-900'
                  : 'bg-white text-gray-600 hover:text-gray-900'
              }`}
            >
              {period}
            </button>
          ))}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex mb-6">
        <button
          onClick={() => setActiveTab('tipped')}
          className={`flex-1 py-2 text-center font-medium transition-colors ${
            activeTab === 'tipped'
              ? 'border-b-2 border-gray-900 text-gray-900'
              : 'text-gray-500'
          }`}
        >
          Tipped
        </button>
        <button
          onClick={() => setActiveTab('earned')}
          className={`flex-1 py-2 text-center font-medium transition-colors ${
            activeTab === 'earned'
              ? 'border-b-2 border-gray-900 text-gray-900'
              : 'text-gray-500'
          }`}
        >
          Earned
        </button>
      </div>

      {activeTab === 'tipped' ? (
        <>
          {/* Your Best (Tipped) Section */}
          <div className="mb-6">
            <h3 className="text-sm font-medium text-gray-700 mb-3">Your Best</h3>
            <div className="bg-white rounded-lg p-4">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center space-x-3">
                  <div className="w-6 h-6 bg-gray-100 rounded-full flex items-center justify-center text-xs font-medium">
                    2138
                  </div>
                  <div className="flex items-center space-x-2">
                    <div className="w-6 h-6 bg-gray-800 rounded-full"></div>
                    <span className="text-sm font-medium">doteth</span>
                  </div>
                </div>
                <span className="text-sm font-medium">$0.81</span>
              </div>
              <p className="text-xs text-gray-500 mb-2">received 290 tips</p>
              <div className="flex items-center space-x-1 mb-1">
                {Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="w-4 h-4 bg-gray-300 rounded-full"></div>
                ))}
                <span className="text-xs text-gray-500 ml-2">+69</span>
              </div>
              <p className="text-xs text-gray-600">
                got noiced by sara2003, riyaj, phoenix, unknownking, kindkknd, asimdobe, vocsel, kenwolfrit, nollyspot,...
              </p>
            </div>
          </div>
        </>
      ) : (
        <>
          {/* Earned Section */}
          <div className="mb-6">
            <h3 className="text-sm font-medium text-gray-700 mb-3">Earned</h3>
            <div className="bg-white rounded-lg p-4">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center space-x-3">
                  <div className="w-6 h-6 bg-green-500 rounded-full flex items-center justify-center text-white text-xs font-bold">
                    1
                  </div>
                  <div className="flex items-center space-x-2">
                    <div className="w-6 h-6 bg-gray-800 rounded-full"></div>
                    <span className="text-sm font-medium">toadyhawk.eth</span>
                    <button className="p-1 hover:bg-gray-100 rounded">
                      <Share2 className="w-3 h-3" />
                    </button>
                  </div>
                </div>
                <span className="text-sm font-medium">$175.06</span>
              </div>
              <p className="text-xs text-gray-500 mb-2">received 7559 tips</p>
              <div className="flex items-center space-x-1 mb-1">
                {Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="w-4 h-4 bg-gray-300 rounded-full"></div>
                ))}
                <span className="text-xs text-gray-500 ml-2">+212</span>
              </div>
              <p className="text-xs text-gray-600">
                got noiced by itsbasil, ak0o0.eth, 18kgoldsouvenir.eth, locoblock.eth, rphgrc.eth, yes2crypto.eth, shahinhizhaa,...
              </p>
            </div>
          </div>
        </>
      )}

      {/* Additional Leaderboard Entries */}
      <div className="space-y-2">
        {users.slice(0, 5).map((user, index) => (
          <div key={user} className="bg-white rounded-lg p-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium ${
                  index === 0 ? 'bg-green-500 text-white' : 'bg-gray-100'
                }`}>
                  {index + 2}
                </div>
                <div className="flex items-center space-x-2">
                  <div className="w-6 h-6 bg-gray-800 rounded-full"></div>
                  <span className="text-sm font-medium">
                    {user.slice(0, 8)}...{user.slice(-4)}
                  </span>
                </div>
              </div>
              <span className="text-sm font-medium">
                ${formatAmount(amounts[index] || '0')}
              </span>
            </div>
            <p className="text-xs text-gray-500 mt-1">
              received {Math.floor(Math.random() * 500) + 100} tips
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}