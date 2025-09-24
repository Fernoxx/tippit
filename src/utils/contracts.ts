// Backend-only system - no smart contracts needed
// This file is kept for compatibility but will be removed in future updates

export const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:3001';

// USDC on Base for reference
export const USDC_BASE = {
  address: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
  symbol: 'USDC',
  decimals: 6,
  name: 'USD Coin'
};

// Helper function to format amounts (no longer needed with backend-only)
export const formatAmount = (amount: string | number): string => {
  if (typeof amount === 'string') return amount;
  return amount.toString();
};