import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      // 50 MiB file cap plus multipart/Server Action envelope overhead.
      bodySizeLimit: "51mb",
    },
  },
};

export default nextConfig;
