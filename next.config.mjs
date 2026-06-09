/** @type {import('next').NextConfig} */
const nextConfig = {
  // Produces a self-contained server build (.next/standalone/server.js) that
  // server.js boots in production via Plesk's Node.js extension (Passenger) on
  // Ubuntu. See DEPLOY-PLESK.md.
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
