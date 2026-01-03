// LEADERBOARD DISABLED - Maintenance Mode
// The leaderboard feature is currently under maintenance to reduce Neynar API usage.
// All original code has been preserved in leaderboard.tsx.backup for future use.

// Maintenance mode - Display maintenance message instead
import { Wrench } from 'lucide-react';

export default function Leaderboard() {
  return (
    <div className="min-h-screen bg-yellow-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl p-8 max-w-md w-full text-center">
        <div className="flex justify-center mb-4">
          <div className="bg-yellow-100 rounded-full p-4">
            <Wrench className="w-12 h-12 text-yellow-600" />
          </div>
        </div>
        <h1 className="text-2xl font-bold text-gray-900 mb-3">
          Leaderboard Under Maintenance
        </h1>
        <p className="text-gray-600 mb-6">
          The leaderboard feature is temporarily unavailable while we optimize our systems. 
          We&apos;ll be back soon with an improved experience!
        </p>
        <div className="bg-yellow-50 rounded-lg p-4 border border-yellow-200">
          <p className="text-sm text-yellow-800">
            Check back later for updates on top tippers and earners.
          </p>
        </div>
      </div>
    </div>
  );
}
