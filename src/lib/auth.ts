import { betterAuth } from "better-auth";

const dbUrl = process.env.DATABASE_URL;

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
      baseURL: process.env.BETTER_AUTH_URL || process.env.NEXT_PUBLIC_APP_URL,
      secret: process.env.BETTER_AUTH_SECRET,
    })
  : null;
