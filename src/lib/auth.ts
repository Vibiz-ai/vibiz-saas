import { betterAuth } from "better-auth";
import { LibsqlDialect } from "@libsql/kysely-libsql";
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

function buildDialect(url: string) {
  return new LibsqlDialect({
    url,
    authToken: process.env.TURSO_AUTH_TOKEN,
  });
}

/**
 * Auth is only active when DATABASE_URL is set.
 * Local dev: libsql://localhost:8080 via `turso dev` (or remote Turso URL)
 * Production: libsql://<db>.turso.io with TURSO_AUTH_TOKEN
 * file:// URLs are not supported by the libsql Kysely dialect — use Turso
 * (free tier is fine for local). Not set: auth disabled.
 */
export const auth = dbUrl
  ? betterAuth({
      database: {
        dialect: buildDialect(dbUrl),
        type: "sqlite",
      },
      emailAndPassword: { enabled: true },
      session: { expiresIn: 60 * 60 * 24 * 7 },
      baseURL: appUrl(),
      trustedOrigins: trustedOrigins(),
      secret: process.env.BETTER_AUTH_SECRET,
    })
  : null;
