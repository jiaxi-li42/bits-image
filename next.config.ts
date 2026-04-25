import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      // Allow up to 50 MB per upload — matches the validation cap in
      // modules/ingestion/server.ts. The Server Actions default is 1 MB,
      // which causes "An unexpected response was received from the server"
      // for any larger image.
      bodySizeLimit: "50mb",
    },
  },
};

export default nextConfig;
