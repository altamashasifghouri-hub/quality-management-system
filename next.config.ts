import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async redirects() {
    return [
      {
        source: "/audit/visit",
        destination: "/visit",
        permanent: true,
      },
    ];
  },
};

export default nextConfig;
