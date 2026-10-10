/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  // Private runtime records and local tools must not become deployment assets.
  outputFileTracingExcludes: {
    "/*": [".data/**/*", ".cache/**/*", ".codex-remote-attachments/**/*"],
  },
  images: {
    minimumCacheTTL: 31536000,
    remotePatterns: [
      { protocol: "https", hostname: "**" },
    ],
  },
};

module.exports = nextConfig;
