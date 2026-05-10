#!/usr/bin/env node
// Sandbox v2 — end-to-end smoke test for /api/internal/runner/apply-multi-patch.
//
// Mirrors smoke-runner-file-patch.mjs but exercises the class C path:
// a multi-file unified-diff batch that mixes (1) a modify on an existing
// file with (2) a new-file create. Asserts atomicity — both diffs land
// in a SINGLE commit, the working tree ends up exactly as expected, and
// the new file shows up with the right contents.
//
//   1. Generates a fresh ES256 keypair inline.
//   2. Stages a temp working dir containing existing.tsx (content: "old")
//      + a tiny package.json, then `git init` + initial commit.
//   3. Spawns `next dev` with `RUNNER_APP_DIR` pointed at the temp dir.
//   4. Mints a runner JWT and POSTs a multi-patch with:
//        - existing.tsx: "old" -> "new"
//        - new.tsx: created with content "hello"
//   5. Asserts: 200, 40-hex commitSha, existing.tsx == "new",
//      new.tsx exists with "hello", git log has exactly 2 commits
//      (atomic — one new commit on top of the initial bootstrap).
//
// Run via:  npm run runner:smoke-multi
// Exit:     0 on pass, 1 on any assertion failure.

import { spawn } from "node:child_process";
import { generateKeyPairSync } from "node:crypto";
import { execFile } from "node:child_process";
import { access, mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import { SignJWT, importPKCS8 } from "jose";

const execFileAsync = promisify(execFile);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, "..");

// Distinct port from the other smokes (3033 config-patch, 3034 file-patch)
// so they can run in parallel during local iteration.
const PORT = 3035;
const BASE_URL = `http://127.0.0.1:${PORT}`;

const ORG_ID = "smoke-org";
const SANDBOX_ID = "smoke-sandbox";

function log(...args) {
  console.log("[smoke-multi]", ...args);
}

function fail(msg) {
  console.error("[smoke-multi] FAIL:", msg);
  process.exitCode = 1;
}

async function git(cwd, args) {
  const { stdout } = await execFileAsync("git", args, {
    cwd,
    env: {
      ...process.env,
      GIT_AUTHOR_NAME: "smoke",
      GIT_AUTHOR_EMAIL: "smoke@local",
      GIT_COMMITTER_NAME: "smoke",
      GIT_COMMITTER_EMAIL: "smoke@local",
    },
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
  const exp = iat + 60 * 5;
  return await new SignJWT({ sandboxId, scope: "runner" })
    .setProtectedHeader({ alg: "ES256" })
    .setSubject(orgId)
    .setIssuedAt(iat)
    .setExpirationTime(exp)
    .sign(privateKey);
}

async function waitForServer(timeoutMs = 60_000) {
  const start = Date.now();
  let lastError = null;
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(`${BASE_URL}/`, { method: "GET" });
      if (res.status > 0) return true;
    } catch (e) {
      lastError = e;
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(
    `dev server did not come up in ${timeoutMs}ms: ${lastError?.message ?? "no response"}`,
  );
}

// Diff #1 — modify existing.tsx: "old" -> "new" on the only line.
function buildModifyDiff() {
  return [
    "diff --git a/existing.tsx b/existing.tsx",
    "--- a/existing.tsx",
    "+++ b/existing.tsx",
    "@@ -1 +1 @@",
    "-old",
    "+new",
    "",
  ].join("\n");
}

// Diff #2 — create new.tsx with a single line "hello".
//
// `--- /dev/null` + `+++ b/new.tsx` is the standard `git diff` shape
// for a new-file diff. The `new file mode 100644` header isn't strictly
// required by `git apply`, but we include it because real LLM output
// will, and we want the smoke to match the wire shape.
function buildCreateDiff() {
  return [
    "diff --git a/new.tsx b/new.tsx",
    "new file mode 100644",
    "--- /dev/null",
    "+++ b/new.tsx",
    "@@ -0,0 +1 @@",
    "+hello",
    "",
  ].join("\n");
}

async function fileExists(p) {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
}

async function main() {
  const { privatePem, publicPem } = generateEs256Keys();
  const tempDir = await mkdtemp(path.join(tmpdir(), "vibiz-runner-smoke-multi-"));
  log(`temp app dir: ${tempDir}`);

  await writeFile(path.join(tempDir, "existing.tsx"), "old\n");
  await writeFile(
    path.join(tempDir, "package.json"),
    JSON.stringify(
      { name: "smoke-app", type: "module", version: "0.0.0" },
      null,
      2,
    ),
  );

  await git(tempDir, ["init", "-q"]);
  await git(tempDir, ["add", "--", "existing.tsx", "package.json"]);
  await git(tempDir, ["commit", "-q", "-m", "smoke: initial commit"]);
  const initialSha = await git(tempDir, ["rev-parse", "HEAD"]);
  log(`initial commit: ${initialSha.slice(0, 8)}`);

  const nextDev = spawn(
    "npx",
    ["next", "dev", "-p", String(PORT)],
    {
      cwd: REPO_ROOT,
      env: {
        ...process.env,
        VIBIZ_RUNNER_PUBLIC_KEY: publicPem,
        RUNNER_APP_DIR: tempDir,
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
    await new Promise((r) => setTimeout(r, 500));
    try {
      if (!nextDev.killed) nextDev.kill("SIGKILL");
    } catch {}
    await rm(tempDir, { recursive: true, force: true }).catch(() => {});
  }
  process.on("exit", () => {
    if (!cleanedUp) {
      try {
        nextDev.kill("SIGKILL");
      } catch {}
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

    const jwt = await signRunnerJwt(privatePem, ORG_ID, SANDBOX_ID);
    const res = await fetch(
      `${BASE_URL}/api/internal/runner/apply-multi-patch`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${jwt}`,
        },
        body: JSON.stringify({
          diffs: [
            { path: "existing.tsx", diff: buildModifyDiff() },
            { path: "new.tsx", diff: buildCreateDiff() },
          ],
          summary: "smoke: modify existing + create new",
        }),
      },
    );

    const body = await res.json();
    log(`response ${res.status}:`, JSON.stringify(body));

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
    if (
      typeof body.commitSha === "string" &&
      /^[0-9a-f]{40}$/.test(body.commitSha)
    ) {
      log(`PASS  commitSha is 40-hex: ${body.commitSha}`);
      passed++;
    } else {
      fail(`commitSha missing or malformed: ${body.commitSha}`);
    }

    total++;
    const existing = await readFile(
      path.join(tempDir, "existing.tsx"),
      "utf8",
    );
    if (existing.trim() === "new") {
      log("PASS  existing.tsx content is 'new'");
      passed++;
    } else {
      fail(`existing.tsx content was '${existing.trim()}', expected 'new'`);
    }

    total++;
    const newPath = path.join(tempDir, "new.tsx");
    if (await fileExists(newPath)) {
      const created = await readFile(newPath, "utf8");
      if (created.trim() === "hello") {
        log("PASS  new.tsx exists with 'hello'");
        passed++;
      } else {
        fail(`new.tsx content was '${created.trim()}', expected 'hello'`);
      }
    } else {
      fail("new.tsx was not created");
    }

    total++;
    // Atomicity check — exactly one new commit on top of the initial
    // bootstrap. If diff #1 had committed separately from diff #2 we'd
    // see 3 commits.
    const logCount = await git(tempDir, ["rev-list", "--count", "HEAD"]);
    if (logCount === "2") {
      log("PASS  git log shows 2 commits (atomic batch)");
      passed++;
    } else {
      fail(`git log has ${logCount} commits, expected 2`);
    }

    total++;
    const filesChanged = Array.isArray(body.filesChanged)
      ? body.filesChanged
      : [];
    if (
      filesChanged.length === 2 &&
      filesChanged.includes("existing.tsx") &&
      filesChanged.includes("new.tsx")
    ) {
      log("PASS  filesChanged lists both diff paths");
      passed++;
    } else {
      fail(
        `filesChanged was ${JSON.stringify(filesChanged)}, expected ['existing.tsx', 'new.tsx']`,
      );
    }

    log(`${passed}/${total} assertions passed`);
    if (passed !== total) {
      console.error("\n[smoke-multi] last 80 lines of next dev output:");
      console.error(devOutput.split("\n").slice(-80).join("\n"));
      process.exitCode = 1;
    } else {
      process.exitCode = 0;
    }
  } catch (error) {
    fail(error?.message ?? String(error));
    console.error("\n[smoke-multi] last 80 lines of next dev output:");
    console.error(devOutput.split("\n").slice(-80).join("\n"));
    process.exitCode = 1;
  } finally {
    await cleanup();
  }
}

main().catch((e) => {
  console.error("[smoke-multi] unexpected:", e);
  process.exit(1);
});
