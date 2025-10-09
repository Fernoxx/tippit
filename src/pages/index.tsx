import { useHomepageData, useLeaderboardData } from '@/hooks/usePIT';
import { useFarcasterWallet } from '@/hooks/useFarcasterWallet';
import { formatAmount } from '@/utils/contracts';
import { useState, useEffect } from 'react';

interface CastEmbed {
  url?: string;
  metadata?: any;
}

interface CastReactions {
  likes_count?: number;
  recasts_count?: number;
}

interface CastReplies {
  count?: number;
}

interface CastTipper {
  userAddress: string;
  username?: string;
  displayName?: string;
  pfpUrl?: string;
  fid?: number;
  totalEngagementValue?: number | null;
  likeAmount?: number;
  recastAmount?: number;
  replyAmount?: number;
  criteria?: {
    audience: number;
    minFollowerCount: number;
    minNeynarScore: number;
  };
}

interface Cast {
  hash: string;
  text: string;
  timestamp: string;
  embeds?: CastEmbed[];
  reactions?: CastReactions;
  replies?: CastReplies;
  tipper?: CastTipper;
  farcasterUrl?: string;
}

export default function Home() {
  const [timeFilter, setTimeFilter] = useState<'24h' | '7d' | '30d'>('24h');
  const { casts, users: tipsReceivedUsers, amounts: tipsReceivedAmounts, isLoading, isLoadingMore, hasMore, loadMore } = useHomepageData(timeFilter);
  const { users: tipsGivenUsers, amounts: tipsGivenAmounts } = useLeaderboardData(timeFilter);
  const { connectWallet, isLoading: walletLoading, isConnected, currentUser } = useFarcasterWallet();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const handleGetStarted = async () => {
    try {
      await connectWallet();
    } catch (error) {
      console.error('Failed to connect wallet:', error);
    }
  };

  if (!mounted) return null;

  return (
    <div className="max-w-4xl mx-auto px-4 py-8 bg-yellow-50 min-h-full">
        {/* Hero Section */}
        <div className="text-center py-6">
          <h2 className="text-3xl font-bold text-gray-900 mb-4">
            Tip Your Audience
          </h2>
          <p className="text-lg text-gray-600 mb-4 max-w-2xl mx-auto">
            With Ecion you can boost your casts by tipping engagers for their interactions easily.
          </p>
          {!isConnected && (
            <button 
              onClick={handleGetStarted}
              disabled={walletLoading}
              className="bg-blue-600 text-white px-6 py-3 rounded-lg font-medium hover:bg-blue-700 transition-colors disabled:opacity-50"
            >
              {walletLoading ? 'Connecting...' : 'Get Started'}
            </button>
          )}
        </div>

        {/* Recent Casts from Tippers */}
        <div className="mb-8">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Recent Casts from Tippers</h3>
          <div className="space-y-3">
            {isLoading ? (
              <div className="space-y-3">
                {[1, 2, 3, 4, 5].map((i) => (
                  <div key={i} className="animate-pulse">
                    <div className="bg-white border border-gray-200 rounded-lg p-6">
                      {/* User Info Skeleton */}
                      <div className="flex items-center space-x-3 mb-3">
                        <div className="w-12 h-12 bg-gray-300 rounded-full"></div>
                        <div className="flex-1">
                          <div className="w-32 h-4 bg-gray-300 rounded mb-1"></div>
                          <div className="w-24 h-3 bg-gray-300 rounded"></div>
                        </div>
                        <div className="w-20 h-6 bg-gray-300 rounded-full"></div>
                      </div>
                      
                      {/* Cast Content Skeleton */}
                      <div className="mb-3">
                        <div className="w-full h-4 bg-gray-300 rounded mb-2"></div>
                        <div className="w-3/4 h-4 bg-gray-300 rounded mb-2"></div>
                        <div className="w-1/2 h-4 bg-gray-300 rounded"></div>
                      </div>
                      
                      {/* Cast Stats Skeleton */}
                      <div className="flex items-center space-x-6 mb-3">
                        <div className="w-8 h-3 bg-gray-300 rounded"></div>
                        <div className="w-8 h-3 bg-gray-300 rounded"></div>
                        <div className="w-8 h-3 bg-gray-300 rounded"></div>
                      </div>
                      
                      {/* Criteria Skeleton */}
                      <div className="bg-gray-100 border border-gray-200 rounded-lg p-3">
                        <div className="w-full h-3 bg-gray-300 rounded mb-1"></div>
                        <div className="w-2/3 h-3 bg-gray-300 rounded"></div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : !casts || casts.length === 0 ? (
              <div className="bg-white border border-gray-200 rounded-lg p-12 text-center text-gray-500">
                <p className="text-lg">No recent casts from tippers yet!</p>
                <p className="text-sm mt-1">Users need to approve USDC and configure tipping to appear here</p>
              </div>
            ) : (
              casts.map((cast: Cast, index: number) => (
                <div
                  key={cast.hash}
                  className="bg-white border border-gray-200 rounded-lg p-6 hover:shadow-md transition-shadow cursor-pointer"
                  onClick={() => {
                    if (cast.farcasterUrl) {
                      window.open(cast.farcasterUrl, '_blank');
                    }
                  }}
                >
                  {/* User Info */}
                  <div className="flex items-center space-x-3 mb-3">
                    {cast.tipper?.pfpUrl ? (
                      <img
                        src={cast.tipper.pfpUrl}
                        alt={cast.tipper.displayName || cast.tipper.username}
                        className="w-12 h-12 rounded-full"
                      />
                    ) : (
                      <div className="w-12 h-12 bg-gray-300 rounded-full flex items-center justify-center">
                        <span className="text-lg font-bold text-gray-600">
                          {(cast.tipper?.displayName || cast.tipper?.username || 'U')[0].toUpperCase()}
                        </span>
                      </div>
                    )}
                    <div>
                      <p className="font-semibold text-gray-900">
                        {cast.tipper?.displayName || cast.tipper?.username || 'Anonymous Tipper'}
                      </p>
                      <p className="text-sm text-gray-500">
                        @{cast.tipper?.username || 'unknown'} • {new Date(cast.timestamp).toLocaleDateString()}
                      </p>
                    </div>
                    <div className="ml-auto">
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800 whitespace-nowrap">
                        Active Tipper
                      </span>
                    </div>
                  </div>

                  {/* Cast Content */}
                  <div className="mb-3">
                    <p className="text-gray-900 leading-relaxed">
                      {cast.text}
                    </p>
                    
                    {/* Cast Images */}
                    {cast.embeds && cast.embeds.length > 0 && (
                      <div className="mt-3 grid grid-cols-2 gap-2">
                        {cast.embeds.slice(0, 4).map((embed: CastEmbed, embedIndex: number) => (
                          embed.url && embed.url.match(/\.(jpeg|jpg|gif|png)$/i) && (
                            <img
                              key={embedIndex}
                              src={embed.url}
                              alt="Cast embed"
                              className="rounded-lg max-h-48 w-full object-cover"
                            />
                          )
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Engagement Stats - Show tip amounts inline */}
                  <div className="flex items-center space-x-6 text-sm mb-3">
                    {/* Like */}
                    <span className="flex items-center space-x-1">
                      <span>❤️</span>
                      {typeof cast.tipper?.likeAmount === 'number' && cast.tipper.likeAmount > 0 ? (
                        <span className="font-semibold text-green-600">
                          ${cast.tipper.likeAmount >= 0.01 
                            ? cast.tipper.likeAmount.toString() 
                            : cast.tipper.likeAmount.toFixed(3)}
                        </span>
                      ) : (
                        <span className="text-gray-500">{cast.reactions?.likes_count || 0}</span>
                      )}
                    </span>
                    
                    {/* Recast */}
                    <span className="flex items-center space-x-1">
                      <span>🔄</span>
                      {typeof cast.tipper?.recastAmount === 'number' && cast.tipper.recastAmount > 0 ? (
                        <span className="font-semibold text-green-600">
                          ${cast.tipper.recastAmount >= 0.01 
                            ? cast.tipper.recastAmount.toString() 
                            : cast.tipper.recastAmount.toFixed(3)}
                        </span>
                      ) : (
                        <span className="text-gray-500">{cast.reactions?.recasts_count || 0}</span>
                      )}
                    </span>
                    
                    {/* Reply */}
                    <span className="flex items-center space-x-1">
                      <span>💬</span>
                      {typeof cast.tipper?.replyAmount === 'number' && cast.tipper.replyAmount > 0 ? (
                        <span className="font-semibold text-green-600">
                          ${cast.tipper.replyAmount >= 0.01 
                            ? cast.tipper.replyAmount.toString() 
                            : cast.tipper.replyAmount.toFixed(3)}
                        </span>
                      ) : (
                        <span className="text-gray-500">{cast.replies?.count || 0}</span>
                      )}
                    </span>
                  </div>

                  {/* Tipper Criteria */}
                  {cast.tipper?.criteria && (
                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-sm">
                      <div className="space-y-1 text-gray-700">
                        {cast.tipper.criteria.audience === 0 && (
                          <div>• Must be followed by @{cast.tipper.username}</div>
                        )}
                        {cast.tipper.criteria.audience === 1 && (
                          <div>• Must be a follower of @{cast.tipper.username}</div>
                        )}
                        {cast.tipper.criteria.audience === 2 && (
                          <div>• Anyone can earn tips</div>
                        )}
                        {cast.tipper.criteria.minFollowerCount > 0 && (
                          <div>• Must have {cast.tipper.criteria.minFollowerCount}+ followers</div>
                        )}
                        {cast.tipper.criteria.minNeynarScore > 0 && (
                          <div>• Must have {cast.tipper.criteria.minNeynarScore}+ Neynar score</div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              ))
            )}
            
            {/* Load More Button - Only show if there are 10+ casts */}
            {hasMore && casts && casts.length >= 10 && (
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
                    'Load More Casts'
                  )}
                </button>
              </div>
            )}
          </div>
        </div>

    </div>
  );
}