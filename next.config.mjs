/** @type {import('next').NextConfig} */
const nextConfig = {
  // Produces a self-contained server build (.next/standalone/server.js) for
  // Plesk / Phusion Passenger. See DEPLOY-PLESK.md.
  output: "standalone",
  eslint: {
    // Linting is run separately; don't fail production builds on lint.
    ignoreDuringBuilds: true,
  },
  experimental: {
    serverActions: {
      bodySizeLimit: "15mb",
    },
  },
};

export default nextConfig;
