'use client';

import { Inter } from 'next/font/google';
import './globals.css';

const inter = Inter({ subsets: ['latin'] });

export const metadata = {
  title: 'PIT - Reverse Tipping App',
  description: 'Get tipped for interacting on Farcaster!',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className={`${inter.className} bg-gray-100 dark:bg-gray-900 text-gray-900 dark:text-gray-100`}>
        <nav className="bg-white dark:bg-gray-800 shadow">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex justify-between h-16">
              <div className="flex items-center">
                <h1 className="text-xl font-bold">PIT</h1>
              </div>
              <div className="flex items-center space-x-4">
                <a href="/home" className="text-gray-700 dark:text-gray-300 hover:text-gray-900">Home</a>
                <a href="/leaderboard" className="text-gray-700 dark:text-gray-300 hover:text-gray-900">Leaderboard</a>
                <a href="/settings" className="text-gray-700 dark:text-gray-300 hover:text-gray-900">Settings</a>
                <button className="bg-blue-500 text-white px-4 py-2 rounded">Connect Wallet</button>
              </div>
            </div>
          </div>
        </nav>
        <main className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
          {children}
        </main>
      </body>
    </html>
  );
}