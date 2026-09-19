import type { NextConfig } from "next";
const config: NextConfig = {
  devIndicators: false,
  distDir: process.env.KYA_NEXT_DIST_DIR || ".next",
  // @kya/core는 TS 소스를 그대로 내보내므로 Next가 함께 컴파일해야 한다.
  transpilePackages: ["@kya/core"],
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
