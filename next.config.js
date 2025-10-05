/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  images: {
    domains: ['i.imgur.com', 'imagedelivery.net'],
  },
  async redirects() {
    return [
      {
        source: '/.well-known/farcaster.json',
        destination: 'https://api.farcaster.xyz/miniapps/hosted-manifest/PLACEHOLDER_MANIFEST_ID',
        permanent: false,
      },
    ]
  },
}

module.exports = nextConfig