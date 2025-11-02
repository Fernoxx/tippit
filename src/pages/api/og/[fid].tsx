import { GetServerSideProps } from 'next';

// Dynamic image generation endpoint - renders share stats as custom image
// This follows the Next.js generateMetadata pattern for dynamic image rendering
// Called when share URL is embedded and needs to render as an image
export default function DynamicOGImage() {
  // This route generates SVG image via getServerSideProps
  return null;
}

export const getServerSideProps: GetServerSideProps = async (context) => {
  const { fid } = context.params as { fid: string };
  const { time = 'total', type = 'earnings' } = context.query as { time?: string; type?: 'earnings' | 'tippings' };
  
  try {
    // Fetch user stats and profile from backend
    const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || 'https://tippit-production.up.railway.app';
    const [statsResponse, profileResponse] = await Promise.all([
      fetch(`${backendUrl}/api/user-earnings/${fid}`),
      fetch(`${backendUrl}/api/user-profile/${fid}`)
    ]);

    if (!statsResponse.ok || !profileResponse.ok) {
      context.res.status(404).send('User not found');
      return { props: {} };
    }

    const userStats = await statsResponse.json();
    const userProfile = await profileResponse.json();
    
    // Calculate amount
    let amount = 0;
    let timeLabel = '';
    
    switch (time) {
      case '24h':
        amount = type === 'earnings' ? userStats.earnings24h : userStats.tippings24h;
        timeLabel = '24h';
        break;
      case '7d':
        amount = type === 'earnings' ? userStats.earnings7d : userStats.tippings7d;
        timeLabel = '7d';
        break;
      case '30d':
        amount = type === 'earnings' ? userStats.earnings30d : userStats.tippings30d;
        timeLabel = '30d';
        break;
      case 'total':
      default:
        amount = type === 'earnings' ? userStats.totalEarnings : userStats.totalTippings;
        timeLabel = 'Total';
        break;
    }
    
    // Generate SVG image (dynamic custom image like generateMetadata pattern)
    const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg width="600" height="400" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#FFD700;stop-opacity:1" />
      <stop offset="100%" style="stop-color:#FFA500;stop-opacity:1" />
    </linearGradient>
  </defs>
  <rect width="600" height="400" fill="url(#bg)"/>
  <circle cx="100" cy="100" r="60" fill="#333" stroke="#fff" stroke-width="4"/>
  ${userProfile.pfpUrl ? `<image href="${userProfile.pfpUrl.replace(/"/g, '&quot;')}" x="40" y="40" width="120" height="120" clip-path="url(#avatarClip)"/><clipPath id="avatarClip"><circle cx="100" cy="100" r="60"/></clipPath>` : '<text x="100" y="110" font-family="Arial, sans-serif" font-size="24" fill="#fff" text-anchor="middle">👤</text>'}
  <text x="200" y="80" font-family="Arial, sans-serif" font-size="32" font-weight="bold" fill="#000">${(userProfile.username || 'User').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</text>
  <text x="200" y="130" font-family="Arial, sans-serif" font-size="48" font-weight="bold" fill="#000">${amount.toFixed(2)} USDC</text>
  <text x="200" y="170" font-family="Arial, sans-serif" font-size="24" fill="#000">${type === 'earnings' ? 'Earned' : 'Tipped'} in ${timeLabel}</text>
  <text x="500" y="350" font-family="Arial, sans-serif" font-size="20" font-weight="bold" fill="#000">Ecion</text>
</svg>`;
    
    // Return SVG as image
    context.res.setHeader('Content-Type', 'image/svg+xml');
    context.res.setHeader('Cache-Control', 'public, max-age=3600, s-maxage=3600'); // Cache for 1 hour
    context.res.write(svg);
    context.res.end();
    
    return { props: {} };
  } catch (error) {
    console.error('Error generating dynamic OG image:', error);
    context.res.status(500).send('Error generating image');
    return { props: {} };
  }
};
