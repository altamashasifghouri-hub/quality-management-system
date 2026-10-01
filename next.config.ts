import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async redirects() {
    return [
      {
        source: "/audit/visit",
        destination: "/room-inspections",
        permanent: true,
      },
    ];
  },
};

export default nextConfig;
