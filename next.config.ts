import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  env: {
    NEXT_PUBLIC_AUTH_ENABLED:
      (process.env.TURSO_DATABASE_URL ?? process.env.DATABASE_URL) ? "true" : "false",
  },
  serverExternalPackages: ["@libsql/kysely-libsql", "@libsql/client", "libsql"],
};

export default nextConfig;
