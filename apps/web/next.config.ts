import type { NextConfig } from "next";
const config: NextConfig = {
  devIndicators: false,
  distDir: process.env.KYA_NEXT_DIST_DIR || ".next",
  serverExternalPackages: ["@daytona/sdk"],
  async rewrites() {
    return [
      { source: "/principals", destination: "/api/principals" },
      { source: "/sandboxes", destination: "/api/sandboxes" },
      { source: "/delegations", destination: "/api/delegations" },
      { source: "/agents/:path*", destination: "/api/agents/:path*" },
    ];
  },
};
export default config;
