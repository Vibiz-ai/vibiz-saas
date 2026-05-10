#!/usr/bin/env node
// Sandbox v2 — end-to-end smoke test for /api/internal/runner/apply-config-patch.
//
// Verifies the runner happy path without touching the deployed sandbox:
//   1. Generates a fresh ES256 keypair inline.
//   2. Stages a temp working dir containing template.config.ts + a tiny
//      package.json, then `git init` + initial commit so the runner sees a
//      clean tree.
//   3. Spawns `next dev` on a free port with `RUNNER_APP_DIR` pointed at
//      the temp dir and `VIBIZ_RUNNER_PUBLIC_KEY` set to the generated key.
//   4. Mints a runner JWT (orgId/sandboxId/scope=runner/iat/exp) signed
//      with the matching private key.
//   5. POSTs an apply-config-patch op (set brand.colors.primary=#ff0000)
//      and asserts: 200 OK, 40-hex commitSha, file contains #ff0000,
//      git log shows two commits.
//
// Why spawn next dev instead of importing the route directly: the route
// uses `@/lib/...` path aliases which Next.js resolves but Node's
// strip-types loader does not. Spawning next dev is also a closer mirror
// to the real sandbox runtime.
//
// Run via:  npm run runner:smoke
// Exit:     0 on pass, 1 on any assertion failure.

import { spawn } from "node:child_process";
import {
  generateKeyPairSync,
  createPrivateKey,
} from "node:crypto";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, writeFile, rm, copyFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import { SignJWT, importPKCS8 } from "jose";

const execFileAsync = promisify(execFile);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, "..");

// Hardcoded so the smoke test isn't sensitive to TCP races on randomly
// chosen ports. 3033 is far enough from the default `next dev` 3000 that
// developer dev servers won't collide.
const PORT = 3033;
const BASE_URL = `http://127.0.0.1:${PORT}`;

const ORG_ID = "smoke-org";
const SANDBOX_ID = "smoke-sandbox";

// --- helpers ------------------------------------------------------------

function log(...args) {
  console.log("[smoke]", ...args);
}

function fail(msg) {
  console.error("[smoke] FAIL:", msg);
  process.exitCode = 1;
}

async function git(cwd, args) {
  const { stdout } = await execFileAsync("git", args, {
    cwd,
    env: { ...process.env, GIT_AUTHOR_NAME: "smoke", GIT_AUTHOR_EMAIL: "smoke@local", GIT_COMMITTER_NAME: "smoke", GIT_COMMITTER_EMAIL: "smoke@local" },
  });
  return stdout.trim();
}

function generateEs256Keys() {
  const { privateKey, publicKey } = generateKeyPairSync("ec", {
    namedCurve: "P-256",
    publicKeyEncoding: { type: "spki", format: "pem" },
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
  });
  return { privatePem: privateKey, publicPem: publicKey };
}

async function signRunnerJwt(privatePem, orgId, sandboxId) {
  const privateKey = await importPKCS8(privatePem, "ES256");
  const iat = Math.floor(Date.now() / 1000);
  const exp = iat + 60 * 5; // 5-minute TTL is plenty for a smoke test
  return await new SignJWT({ sandboxId, scope: "runner" })
    .setProtectedHeader({ alg: "ES256" })
    .setSubject(orgId)
    .setIssuedAt(iat)
    .setExpirationTime(exp)
    .sign(privateKey);
}

// Poll until the dev server answers. Returns true on first non-error
// response, throws if the timeout elapses. We hit a route that DOES NOT
// require auth — the chassis homepage — so we can detect "Next is up"
// without minting a JWT first.
async function waitForServer(timeoutMs = 60_000) {
  const start = Date.now();
  let lastError = null;
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(`${BASE_URL}/`, { method: "GET" });
      // Any HTTP response (200, 307, 500) means Next is listening.
      if (res.status > 0) return true;
    } catch (e) {
      lastError = e;
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`dev server did not come up in ${timeoutMs}ms: ${lastError?.message ?? "no response"}`);
}

// --- main ---------------------------------------------------------------

async function main() {
  // 1. Keypair + temp app dir
  const { privatePem, publicPem } = generateEs256Keys();
  const tempDir = await mkdtemp(path.join(tmpdir(), "vibiz-runner-smoke-"));
  log(`temp app dir: ${tempDir}`);

  // 2. Seed temp dir with template.config.ts + minimal package.json
  await copyFile(
    path.join(REPO_ROOT, "template.config.ts"),
    path.join(tempDir, "template.config.ts"),
  );
  await writeFile(
    path.join(tempDir, "package.json"),
    JSON.stringify({ name: "smoke-app", type: "module", version: "0.0.0" }, null, 2),
  );

  // 3. git init + initial commit
  await git(tempDir, ["init", "-q"]);
  await git(tempDir, ["add", "--", "template.config.ts", "package.json"]);
  await git(tempDir, ["commit", "-q", "-m", "smoke: initial commit"]);
  const initialSha = await git(tempDir, ["rev-parse", "HEAD"]);
  log(`initial commit: ${initialSha.slice(0, 8)}`);

  // 4. Spawn next dev with the runner env wired
  const nextDev = spawn(
    "npx",
    ["next", "dev", "-p", String(PORT)],
    {
      cwd: REPO_ROOT,
      env: {
        ...process.env,
        VIBIZ_RUNNER_PUBLIC_KEY: publicPem,
        RUNNER_APP_DIR: tempDir,
        // Stops next dev from auto-opening the browser etc.
        BROWSER: "none",
        NODE_ENV: "development",
      },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );

  let devOutput = "";
  nextDev.stdout?.on("data", (d) => {
    devOutput += d.toString();
  });
  nextDev.stderr?.on("data", (d) => {
    devOutput += d.toString();
  });

  let cleanedUp = false;
  async function cleanup() {
    if (cleanedUp) return;
    cleanedUp = true;
    try {
      nextDev.kill("SIGTERM");
    } catch {}
    // Give Next a moment to exit cleanly; then SIGKILL if still alive.
    await new Promise((r) => setTimeout(r, 500));
    try {
      if (!nextDev.killed) nextDev.kill("SIGKILL");
    } catch {}
    await rm(tempDir, { recursive: true, force: true }).catch(() => {});
  }
  process.on("exit", () => {
    if (!cleanedUp) {
      try { nextDev.kill("SIGKILL"); } catch {}
    }
  });
  process.on("SIGINT", async () => {
    await cleanup();
    process.exit(130);
  });

  try {
    log(`waiting for next dev on port ${PORT}...`);
    await waitForServer();
    log("dev server up");

    // 5. Forge JWT and POST the patch
    const jwt = await signRunnerJwt(privatePem, ORG_ID, SANDBOX_ID);
    const res = await fetch(`${BASE_URL}/api/internal/runner/apply-config-patch`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${jwt}`,
      },
      body: JSON.stringify({
        operations: [
          { op: "set", path: "brand.colors.primary", value: "#ff0000" },
        ],
        summary: "smoke: set primary color",
      }),
    });

    const body = await res.json();
    log(`response ${res.status}:`, JSON.stringify(body));

    // 6. Assertions
    let passed = 0;
    let total = 0;

    total++;
    if (res.status === 200) {
      log("PASS  status === 200");
      passed++;
    } else {
      fail(`status was ${res.status}, expected 200`);
    }

    total++;
    if (typeof body.commitSha === "string" && /^[0-9a-f]{40}$/.test(body.commitSha)) {
      log(`PASS  commitSha is 40-hex: ${body.commitSha}`);
      passed++;
    } else {
      fail(`commitSha missing or malformed: ${body.commitSha}`);
    }

    total++;
    const onDisk = await readFile(path.join(tempDir, "template.config.ts"), "utf8");
    if (onDisk.includes("#ff0000")) {
      log("PASS  template.config.ts contains #ff0000");
      passed++;
    } else {
      fail("template.config.ts does NOT contain #ff0000 after patch");
    }

    total++;
    const logCount = await git(tempDir, ["rev-list", "--count", "HEAD"]);
    if (logCount === "2") {
      log("PASS  git log shows 2 commits (initial + patch)");
      passed++;
    } else {
      fail(`git log has ${logCount} commits, expected 2`);
    }

    log(`${passed}/${total} assertions passed`);
    if (passed !== total) {
      console.error("\n[smoke] last 80 lines of next dev output:");
      console.error(devOutput.split("\n").slice(-80).join("\n"));
      process.exitCode = 1;
    } else {
      process.exitCode = 0;
    }
  } catch (error) {
    fail(error?.message ?? String(error));
    console.error("\n[smoke] last 80 lines of next dev output:");
    console.error(devOutput.split("\n").slice(-80).join("\n"));
    process.exitCode = 1;
  } finally {
    await cleanup();
  }
}

main().catch((e) => {
  console.error("[smoke] unexpected:", e);
  process.exit(1);
});
