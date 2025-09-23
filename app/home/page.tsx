'use client';

import { useState, useEffect } from 'react';

interface User {
  id: string;
  username: string;
  spendingLimit: number;
  profilePic: string;
}

export default function HomePage() {
  const [users, setUsers] = useState<User[]>([]);

  useEffect(() => {
    // Mock data for users ranked by spending limit (highest first)
    const mockUsers: User[] = [
      { id: '1', username: 'user1', spendingLimit: 1000, profilePic: 'https://via.placeholder.com/50' },
      { id: '2', username: 'user2', spendingLimit: 800, profilePic: 'https://via.placeholder.com/50' },
      { id: '3', username: 'user3', spendingLimit: 600, profilePic: 'https://via.placeholder.com/50' },
    ];
    setUsers(mockUsers);
  }, []);

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold">Homepage - Top Spenders</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {users.map((user, index) => (
          <div key={user.id} className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
            <div className="flex items-center space-x-4">
              <img src={user.profilePic} alt={user.username} className="w-12 h-12 rounded-full" />
              <div>
                <h3 className="text-lg font-semibold">#{index + 1} {user.username}</h3>
                <p className="text-gray-600 dark:text-gray-400">Spending Limit: {user.spendingLimit} USDC per interaction</p>
              </div>
            </div>
            <button className="mt-4 bg-green-500 text-white px-4 py-2 rounded w-full">Like to Earn</button>
          </div>
        ))}
      </div>
    </div>
  );
}