import { betterAuth } from "better-auth";

const dbUrl = process.env.DATABASE_URL;

function inferBaseUrl(): string | undefined {
  if (process.env.BETTER_AUTH_URL) return process.env.BETTER_AUTH_URL;
  if (process.env.NEXT_PUBLIC_APP_URL) return process.env.NEXT_PUBLIC_APP_URL;
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return undefined;
}

/**
 * Auth is only active when DATABASE_URL is set.
 * Local dev: file:./dev.db (SQLite)
 * Production: libsql://... (Turso — set automatically by vibiz on deploy)
 * Not set: auth disabled, app runs as a landing page.
 */
export const auth = dbUrl
  ? betterAuth({
      database: {
        provider: "sqlite",
        url: dbUrl,
        ...(process.env.TURSO_AUTH_TOKEN
          ? { authToken: process.env.TURSO_AUTH_TOKEN }
          : {}),
      },
      emailAndPassword: { enabled: true },
      session: { expiresIn: 60 * 60 * 24 * 7 },
      baseURL: inferBaseUrl(),
      secret: process.env.BETTER_AUTH_SECRET,
    })
  : null;
