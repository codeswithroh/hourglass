import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@hourglass/shared"],
  async redirects() {
    return [
      { source: "/portfolio", destination: "/app/portfolio", permanent: false },
      { source: "/providers", destination: "/app/providers", permanent: false },
    ];
  },
};

export default nextConfig;
