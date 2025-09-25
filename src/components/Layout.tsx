import { ReactNode, useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import Image from 'next/image';
import { Home, Settings, Trophy } from 'lucide-react';

interface LayoutProps {
  children: ReactNode;
}

export default function Layout({ children }: LayoutProps) {
  const router = useRouter();
  const [currentPage, setCurrentPage] = useState(0);
  const [touchStart, setTouchStart] = useState(0);
  const [touchEnd, setTouchEnd] = useState(0);

  const pages = [
    { href: '/', icon: Home, label: 'Home' },
    { href: '/leaderboard', icon: Trophy, label: 'Leaderboard' },
    { href: '/settings', icon: Settings, label: 'Settings' },
  ];

  // Handle swipe gestures
  const handleTouchStart = (e: React.TouchEvent) => {
    setTouchStart(e.targetTouches[0].clientX);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    setTouchEnd(e.targetTouches[0].clientX);
  };

  const handleTouchEnd = () => {
    if (!touchStart || !touchEnd) return;
    
    const distance = touchStart - touchEnd;
    const isLeftSwipe = distance > 50;
    const isRightSwipe = distance < -50;

    if (isLeftSwipe && currentPage < pages.length - 1) {
      // Swipe left - go to next page
      const nextPage = currentPage + 1;
      setCurrentPage(nextPage);
      router.push(pages[nextPage].href);
    }
    
    if (isRightSwipe && currentPage > 0) {
      // Swipe right - go to previous page
      const prevPage = currentPage - 1;
      setCurrentPage(prevPage);
      router.push(pages[prevPage].href);
    }
  };

  // Update current page when route changes
  useEffect(() => {
    const currentIndex = pages.findIndex(page => page.href === router.pathname);
    if (currentIndex !== -1) {
      setCurrentPage(currentIndex);
    }
  }, [router.pathname]);

  return (
    <div className="min-h-screen bg-white flex flex-col">
      {/* Header with Logo */}
      <header className="border-b border-gray-100">
        <div className="max-w-4xl mx-auto px-4">
          <div className="flex justify-center items-center h-16">
            <div className="flex items-center space-x-3">
              <Image
                src="/ecion.png"
                alt="Ecion Logo"
                width={32}
                height={32}
                className="w-8 h-8"
              />
              <span className="text-xl font-semibold text-gray-900">Ecion</span>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content with Swipe Support */}
      <main 
        className="flex-1 overflow-hidden"
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        {children}
      </main>

      {/* Bottom Navigation */}
      <nav className="border-t border-gray-100 bg-white">
        <div className="max-w-4xl mx-auto px-4">
          <div className="flex items-center justify-around h-16">
            {pages.map((page, index) => {
              const Icon = page.icon;
              const isActive = router.pathname === page.href;
              return (
                <Link
                  key={page.href}
                  href={page.href}
                  className={`flex flex-col items-center justify-center w-full h-full transition-colors ${
                    isActive
                      ? 'text-blue-600'
                      : 'text-gray-500 hover:text-gray-700'
                  }`}
                >
                  <Icon className="w-6 h-6 mb-1" />
                  <span className="text-xs font-medium">{page.label}</span>
                </Link>
              );
            })}
          </div>
        </div>
      </nav>
    </div>
  );
}