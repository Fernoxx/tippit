import { ReactNode, useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import Image from 'next/image';
import { Home, Settings, Trophy } from 'lucide-react';
import { useFarcasterWallet } from '@/hooks/useFarcasterWallet';

interface LayoutProps {
  children: ReactNode;
}

export default function Layout({ children }: LayoutProps) {
  const router = useRouter();
  const [currentPage, setCurrentPage] = useState(0);
  const { isConnected, currentUser } = useFarcasterWallet();

  const pages = [
    { href: '/', icon: Home, label: 'Home' },
    { href: '/leaderboard', icon: Trophy, label: 'Leaderboard' },
    { href: '/settings', icon: Settings, label: 'Settings' },
  ];


  // Update current page when route changes
  useEffect(() => {
    const currentIndex = pages.findIndex(page => page.href === router.pathname);
    if (currentIndex !== -1) {
      setCurrentPage(currentIndex);
    }
  }, [router.pathname]);

  return (
    <div className="min-h-screen bg-yellow-50 flex flex-col">
      {/* Header with Logo and FID */}
      <header className="border-b border-gray-100">
        <div className="max-w-4xl mx-auto px-4">
          <div className="flex justify-center items-center h-20 relative">
            <Image
              src="/ecion.png"
              alt="Ecion Logo"
              width={64}
              height={64}
              className="w-16 h-16"
            />
            {/* FID Display with Green Dot */}
            {isConnected && currentUser?.fid && (
              <div className="absolute right-4 flex items-center space-x-2">
                <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                <span className="text-sm font-medium text-gray-700">
                  FID: {currentUser.fid}
                </span>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Main Content with Swipe Support */}
      <main 
        className="flex-1 overflow-y-auto pb-20"
        style={{ touchAction: 'pan-y' }}
      >
        {children}
      </main>

      {/* Bottom Navigation - Fixed at bottom with 50% transparency and icons only */}
      <nav className="fixed bottom-0 left-0 right-0 border-t border-gray-100 bg-white/50 backdrop-blur-sm z-50">
        <div className="max-w-4xl mx-auto px-4">
          <div className="flex items-center justify-around h-16">
            {pages.map((page, index) => {
              const Icon = page.icon;
              const isActive = router.pathname === page.href;
              return (
                <Link
                  key={page.href}
                  href={page.href}
                  className={`flex items-center justify-center w-full h-full transition-colors ${
                    isActive
                      ? 'text-blue-600'
                      : 'text-gray-500 hover:text-gray-700'
                  }`}
                >
                  <Icon className="w-6 h-6" />
                </Link>
              );
            })}
          </div>
        </div>
      </nav>
    </div>
  );
}