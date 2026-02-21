/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'img.a.transfermarkt.technology',
        pathname: '/**',
      },
    ],
  },
}

module.exports = nextConfig
