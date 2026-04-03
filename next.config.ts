import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  env: {
    NEXT_PUBLIC_AUTH_ENABLED: process.env.DATABASE_URL ? "true" : "false",
  },
};

export default nextConfig;
