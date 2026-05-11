import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  env: {
    NEXT_PUBLIC_AUTH_ENABLED:
      (process.env.TURSO_DATABASE_URL ?? process.env.DATABASE_URL) ? "true" : "false",
  },
  serverExternalPackages: ["@libsql/kysely-libsql", "@libsql/client", "libsql"],
  // `getConfig()` in src/lib/config-server.ts reads `data/config-overrides.json`
  // at request-time via `fs.readFileSync(path.join(process.cwd(), ...))`.
  // Next's static tracer can miss the dynamic path; explicitly include the
  // data folder so the file ships with the serverless function bundle.
  outputFileTracingIncludes: {
    "/**/*": ["./data/**"],
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "*.supabase.co",
        pathname: "/**",
      },
    ],
  },
};

export default nextConfig;
