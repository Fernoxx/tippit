import { useHomepageData, useLeaderboardData } from '@/hooks/usePIT';
import { useFarcasterWallet } from '@/hooks/useFarcasterWallet';
import { formatAmount } from '@/utils/contracts';
import { useState, useEffect } from 'react';
import { Share2, ChevronDown } from 'lucide-react';

export default function Home() {
  const [timeFilter, setTimeFilter] = useState<'24h' | '7d' | '30d'>('24h');
  const { users: tipsReceivedUsers, amounts: tipsReceivedAmounts, isLoading: isLoadingHomepage } = useHomepageData(timeFilter);
  const { users: tipsGivenUsers, amounts: tipsGivenAmounts, isLoading: isLoadingLeaderboard } = useLeaderboardData(timeFilter);
  const { isConnected, currentUser } = useFarcasterWallet();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) return null;

  return (
    <div className="max-w-md mx-auto px-4 py-6 bg-gray-50 min-h-full">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center space-x-2">
          <div className="w-8 h-8 bg-gray-800 rounded-full"></div>
          <span className="text-lg font-medium">Best Casts</span>
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

      {/* Top Cast Card */}
      {tipsReceivedUsers.length > 0 && (
        <div className="bg-white rounded-lg p-4 mb-6">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center space-x-3">
              <div className="w-8 h-8 bg-green-500 rounded-full flex items-center justify-center text-white font-bold text-sm">
                1
              </div>
              <div className="flex items-center space-x-2">
                <div className="w-6 h-6 bg-gray-800 rounded-full"></div>
                <span className="font-medium text-sm">skycastle</span>
                <button className="p-1 hover:bg-gray-100 rounded">
                  <Share2 className="w-3 h-3" />
                </button>
              </div>
            </div>
          </div>
          
          <div className="mb-3">
            <p className="text-sm text-gray-700 leading-relaxed">
              Today we introduce Skycastle, and our network token, $SKY. Skycastle is the tokenized incubator for the Base + Farcaster ecosystems. We help early builders become credible founders and unify our network under one token.
            </p>
            <a href="#" className="text-blue-600 text-sm underline">view cast</a>
          </div>

          {/* Embedded Banner */}
          <div className="bg-black rounded-lg p-4 mb-3 text-white">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <div className="w-12 h-12 bg-white rounded-full"></div>
                <div>
                  <p className="font-bold text-lg">SKYCASTLE</p>
                </div>
              </div>
              <div className="text-right">
                <p className="font-bold text-lg">NAV-BACKED TOKEN INCUBATOR</p>
                <p className="text-sm">A network of expertise. An index of builders.</p>
              </div>
            </div>
          </div>

          {/* Tipping Info */}
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-gray-600">received 55 tips</span>
            <div className="flex items-center space-x-2">
              <span className="text-sm font-medium">$3.55</span>
              <div className="w-4 h-4 bg-gray-300 rounded-full"></div>
              <div className="w-4 h-4 bg-blue-500 rounded-full"></div>
            </div>
          </div>

          {/* Tippers */}
          <div className="flex items-center space-x-1 mb-1">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="w-4 h-4 bg-gray-300 rounded-full"></div>
            ))}
            <span className="text-xs text-gray-500 ml-2">+50</span>
          </div>
          <p className="text-xs text-gray-600">
            got noiced by atown, toadyhawk.eth, itsbasil, nickysap, runn3rr, corbin.eth, streetphoto, beingwayne.eth, phoeni...
          </p>
        </div>
      )}

      {/* Top Tippers Section */}
      <div className="mb-6">
        <h3 className="text-lg font-medium mb-4">Top Tippers</h3>
        {tipsGivenUsers.length === 0 ? (
          <div className="bg-white rounded-lg p-8 text-center">
            <p className="text-gray-500">No active tippers yet!</p>
          </div>
        ) : (
          <div className="space-y-2">
            {tipsGivenUsers.slice(0, 5).map((user, index) => (
              <div
                key={user}
                className="bg-white rounded-lg p-3 flex items-center justify-between"
              >
                <div className="flex items-center space-x-3">
                  <div className="w-6 h-6 bg-gray-100 rounded-full flex items-center justify-center text-xs font-medium">
                    {index + 1}
                  </div>
                  <div>
                    <p className="text-sm font-medium">
                      {user.slice(0, 6)}...{user.slice(-4)}
                    </p>
                    <p className="text-xs text-gray-500">received {Math.floor(Math.random() * 100) + 50} tips</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-sm font-medium">
                    ${formatAmount(tipsGivenAmounts[index])}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}