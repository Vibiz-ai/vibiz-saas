import { betterAuth } from "better-auth";
import { appUrl } from "./app-url";

const dbUrl = process.env.DATABASE_URL;

function trustedOrigins(): string[] {
  const origins: string[] = [];
  const add = (raw: string | undefined) => {
    if (!raw) return;
    const url = raw.startsWith("http") ? raw : `https://${raw}`;
    if (!origins.includes(url)) origins.push(url);
  };
  add(process.env.BETTER_AUTH_URL);
  add(process.env.NEXT_PUBLIC_APP_URL);
  add(process.env.VERCEL_PROJECT_PRODUCTION_URL);
  add(process.env.VERCEL_URL);
  add(process.env.VERCEL_BRANCH_URL);
  return origins;
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
      baseURL: appUrl(),
      trustedOrigins: trustedOrigins(),
      secret: process.env.BETTER_AUTH_SECRET,
    })
  : null;
