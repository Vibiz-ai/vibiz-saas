#!/usr/bin/env node
import { spawn } from "node:child_process";

// Vibiz-managed deploys ship TURSO_DATABASE_URL (provisioned by the
// parent repo's sandbox-deploy task). Standalone clones may set
// DATABASE_URL in .env. Read both, prefer the Vibiz-managed name.
const dbUrl = process.env.TURSO_DATABASE_URL ?? process.env.DATABASE_URL;
if (!dbUrl) {
  console.log("[migrate] no TURSO_DATABASE_URL / DATABASE_URL set — skipping schema migration");
  process.exit(0);
}

console.log("[migrate] syncing better-auth schema with %s", redactUrl(dbUrl));

const child = spawn(
  "npx",
  ["--yes", "@better-auth/cli@latest", "migrate"],
  {
    stdio: ["pipe", "inherit", "inherit"],
    env: process.env,
  },
);

child.stdin.write("y\n");
child.stdin.end();

child.on("exit", (code) => {
  if (code === 0) {
    console.log("[migrate] schema in sync");
    process.exit(0);
  }
  console.warn(`[migrate] CLI exited with code ${code} — continuing build anyway`);
  console.warn("[migrate] sign-in/sign-up may 500 until schema is fixed manually");
  process.exit(0);
});

child.on("error", (err) => {
  console.warn("[migrate] failed to spawn CLI:", err.message);
  console.warn("[migrate] continuing build anyway");
  process.exit(0);
});

function redactUrl(url) {
  try {
    const u = new URL(url);
    return `${u.protocol}//${u.host}`;
  } catch {
    return "<db-url>";
  }
}
