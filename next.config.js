/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  images: {
    minimumCacheTTL: 31536000,
    remotePatterns: [
      { protocol: "https", hostname: "**" },
    ],
  },
};

module.exports = nextConfig;
