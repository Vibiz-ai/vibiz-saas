import type { NextConfig } from "next";

const inferredAppUrl =
  process.env.NEXT_PUBLIC_APP_URL ??
  (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3100");

const nextConfig: NextConfig = {
  env: {
    NEXT_PUBLIC_AUTH_ENABLED: process.env.DATABASE_URL ? "true" : "false",
    NEXT_PUBLIC_APP_URL: inferredAppUrl,
  },
};

export default nextConfig;
