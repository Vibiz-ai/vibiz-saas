// Sandbox v2 — git-runner helper smoke test.
//
// vibiz-saas does not ship vitest (chassis stays small for the E2B image),
// so this is a runnable script. Execute via:
//   node --experimental-strip-types src/lib/git-runner.test.ts
// Exits 0 on pass, 1 on failure. Mirrors `runner-auth.test.ts` and
// `runner-types.test.ts`.
//
// Strategy: every test allocates a fresh temp dir under os.tmpdir() and
// cleans up after itself. The helpers shell out to real git, so this is an
// integration test against the local git binary — but that's fine: every
// dev box and every E2B image has git, and we want to catch real CLI
// breakage (e.g. an old git that doesn't accept `-b main`).

import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import {
  ensureGitRepo,
  gitAdd,
  gitCommit,
  gitHead,
  gitWorktreeIsClean,
} from "./git-runner.ts";

type CheckFn = () => Promise<void>;
const checks: Array<{ name: string; fn: CheckFn }> = [];
function check(name: string, fn: CheckFn): void {
  checks.push({ name, fn });
}
function assert(cond: boolean, msg: string): void {
  if (!cond) throw new Error(`assertion failed: ${msg}`);
}

async function makeTempDir(label: string): Promise<string> {
  return mkdtemp(path.join(os.tmpdir(), `git-runner-${label}-`));
}

async function withTempDir(
  label: string,
  fn: (dir: string) => Promise<void>,
): Promise<void> {
  const dir = await makeTempDir(label);
  try {
    await fn(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

const SHA_RE = /^[0-9a-f]{40}$/;

// --- cases --------------------------------------------------------------

check(
  "ensureGitRepo on fresh dir creates repo, makes initial commit",
  async () => {
    await withTempDir("fresh", async (dir) => {
      await writeFile(path.join(dir, "README.md"), "hello\n", "utf8");
      const state = await ensureGitRepo(dir);
      assert(state.initialized === true, "expected initialized=true");
      assert(
        SHA_RE.test(state.headSha),
        `headSha not a 40-char sha: ${state.headSha}`,
      );
    });
  },
);

check(
  "ensureGitRepo on dir with existing .git returns initialized=false",
  async () => {
    await withTempDir("existing", async (dir) => {
      await writeFile(path.join(dir, "a.txt"), "1\n", "utf8");
      const first = await ensureGitRepo(dir);
      assert(first.initialized === true, "expected first call initialized=true");

      const second = await ensureGitRepo(dir);
      assert(
        second.initialized === false,
        "expected second call initialized=false",
      );
      assert(
        second.headSha === first.headSha,
        `expected same headSha; got ${first.headSha} vs ${second.headSha}`,
      );
    });
  },
);

check("gitHead returns a 40-char SHA after init", async () => {
  await withTempDir("head", async (dir) => {
    await ensureGitRepo(dir);
    const sha = await gitHead(dir);
    assert(SHA_RE.test(sha), `not a 40-char sha: ${sha}`);
  });
});

check(
  "gitWorktreeIsClean true after init, false after untracked file",
  async () => {
    await withTempDir("clean", async (dir) => {
      await ensureGitRepo(dir);
      const cleanInitially = await gitWorktreeIsClean(dir);
      assert(cleanInitially === true, "expected clean immediately after init");

      await writeFile(path.join(dir, "untracked.txt"), "stuff\n", "utf8");
      const dirty = await gitWorktreeIsClean(dir);
      assert(dirty === false, "expected dirty after creating untracked file");
    });
  },
);

check(
  "gitCommit after gitAdd produces a new HEAD different from previous",
  async () => {
    await withTempDir("commit", async (dir) => {
      await ensureGitRepo(dir);
      const before = await gitHead(dir);

      await writeFile(path.join(dir, "new.txt"), "fresh\n", "utf8");
      await gitAdd(dir, ["."]);
      const newHead = await gitCommit(dir, "add new.txt");

      assert(SHA_RE.test(newHead), `new head not a sha: ${newHead}`);
      assert(
        newHead !== before,
        `expected new HEAD to differ; got ${newHead} === ${before}`,
      );
      const cleanAfter = await gitWorktreeIsClean(dir);
      assert(cleanAfter === true, "expected clean worktree after commit");
    });
  },
);

check(
  "ensureGitRepo on empty dir succeeds via --allow-empty initial commit",
  async () => {
    await withTempDir("empty", async (dir) => {
      // No files written — directory is empty other than the .git we'll
      // create. With `--allow-empty` the bootstrap commit must still
      // produce a real HEAD sha.
      const state = await ensureGitRepo(dir);
      assert(state.initialized === true, "expected initialized=true");
      assert(
        SHA_RE.test(state.headSha),
        `headSha not a 40-char sha: ${state.headSha}`,
      );
      const clean = await gitWorktreeIsClean(dir);
      assert(clean === true, "expected clean worktree for empty repo");
    });
  },
);

// --- runner -------------------------------------------------------------

let failures = 0;
for (const { name, fn } of checks) {
  try {
    await fn();
    console.log(`  ok  ${name}`);
  } catch (error) {
    failures += 1;
    console.error(
      `  FAIL  ${name}:`,
      error instanceof Error ? error.message : error,
    );
  }
}

if (failures > 0) {
  console.error(`\n[git-runner.test] ${failures}/${checks.length} check(s) failed`);
  process.exit(1);
}
console.log(`\n[git-runner.test] all ${checks.length} check(s) passed`);
