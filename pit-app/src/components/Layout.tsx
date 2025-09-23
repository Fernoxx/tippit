import { ReactNode } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import { Home, Trophy, Settings, Zap } from 'lucide-react';
import { motion } from 'framer-motion';

interface LayoutProps {
  children: ReactNode;
}

export default function Layout({ children }: LayoutProps) {
  const router = useRouter();

  const navItems = [
    { href: '/', icon: Home, label: 'Home' },
    { href: '/leaderboard', icon: Trophy, label: 'Leaderboard' },
    { href: '/settings', icon: Settings, label: 'Settings' },
  ];

  return (
    <div className="min-h-screen bg-primary relative overflow-hidden">
      {/* Wavy background pattern */}
      <div className="absolute inset-0 wavy-bg opacity-20"></div>
      
      {/* Header */}
      <header className="relative z-10 border-b-4 border-accent bg-white/90 backdrop-blur-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-20">
            <Link href="/" className="flex items-center space-x-3">
              <motion.div
                whileHover={{ rotate: 360 }}
                transition={{ duration: 0.5 }}
                className="bg-accent p-3 rounded-xl"
              >
                <Zap className="w-8 h-8 text-white" />
              </motion.div>
              <h1 className="text-3xl font-bold text-accent">PIT</h1>
            </Link>

            <nav className="hidden md:flex items-center space-x-8">
              {navItems.map((item) => {
                const Icon = item.icon;
                const isActive = router.pathname === item.href;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`flex items-center space-x-2 px-4 py-2 rounded-xl transition-all duration-200 ${
                      isActive
                        ? 'bg-accent text-white'
                        : 'text-accent hover:bg-accent/10'
                    }`}
                  >
                    <Icon className="w-5 h-5" />
                    <span className="font-medium">{item.label}</span>
                  </Link>
                );
              })}
            </nav>

            <ConnectButton />
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {children}
      </main>

      {/* Mobile navigation */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-white border-t-4 border-accent z-50">
        <div className="flex items-center justify-around h-16">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = router.pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex flex-col items-center justify-center w-full h-full transition-all duration-200 ${
                  isActive
                    ? 'bg-accent text-white'
                    : 'text-accent hover:bg-accent/10'
                }`}
              >
                <Icon className="w-6 h-6" />
                <span className="text-xs mt-1">{item.label}</span>
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}