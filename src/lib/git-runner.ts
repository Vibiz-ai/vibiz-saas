// Sandbox v2 — git helper used by the in-sandbox runner routes.
//
// Single source of truth for shelling out to `git` from the runner. All
// callers (`/claim`, `/apply-config-patch`, `/apply-file-patch`,
// `/apply-multi-patch`, `/git-revert`) go through these helpers so we have
// one consistent error shape and one place to harden against shell quirks.
//
// Design notes:
// - Uses `execFile` (NOT `exec`) with explicit arg arrays — no shell, no
//   injection surface even if a path or message contains spaces or quotes.
// - Captures stdout AND stderr and embeds both in thrown errors so the
//   route layer can return them verbatim under `details` for debugging.
// - Stays Node-built-ins-only (`child_process`, `fs/promises`, `path`) so
//   the chassis avoids new deps and the E2B image stays small.
// - `ensureGitRepo` is idempotent: safe to call on a repo that already has
//   `.git`. The `initialized` flag tells the caller whether THIS call did
//   the bootstrap.
// - The bootstrap commit uses `--allow-empty` so an empty `repoRoot` (no
//   files staged) still produces a valid HEAD sha — saves the caller from
//   special-casing "first commit on an empty template".

import { execFile } from "node:child_process";
import { stat } from "node:fs/promises";
import path from "node:path";

export interface GitState {
  /** True iff this call performed the bootstrap `git init` + initial commit. */
  initialized: boolean;
  /** 40-char SHA of HEAD after the call. */
  headSha: string;
}

const DEFAULT_BRANCH = "main";
const AGENT_EMAIL = "agent@vibiz.local";
const AGENT_NAME = "Vibiz Agent";
const INITIAL_COMMIT_MESSAGE = "Initial template (vibiz-saas baseline)";

class GitCommandError extends Error {
  readonly stdout: string;
  readonly stderr: string;
  readonly args: ReadonlyArray<string>;
  constructor(opts: {
    args: ReadonlyArray<string>;
    stdout: string;
    stderr: string;
    cause: unknown;
  }) {
    const causeMsg =
      opts.cause instanceof Error ? opts.cause.message : String(opts.cause);
    const summary = (opts.stderr || opts.stdout || causeMsg).trim();
    super(`git ${opts.args.join(" ")} failed: ${summary}`);
    this.name = "GitCommandError";
    this.stdout = opts.stdout;
    this.stderr = opts.stderr;
    this.args = opts.args;
  }
}

/**
 * Promise wrapper around `execFile('git', args, { cwd })`.
 * Throws `GitCommandError` with stdout+stderr captured on non-zero exit.
 */
function runGit(
  cwd: string,
  args: ReadonlyArray<string>,
): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    execFile(
      "git",
      args.slice(),
      { cwd, encoding: "utf8", maxBuffer: 16 * 1024 * 1024 },
      (error, stdout, stderr) => {
        // `encoding: "utf8"` above narrows both stdout and stderr to string.
        if (error) {
          reject(
            new GitCommandError({ args, stdout, stderr, cause: error }),
          );
          return;
        }
        resolve({ stdout, stderr });
      },
    );
  });
}

async function pathExists(p: string): Promise<boolean> {
  try {
    await stat(p);
    return true;
  } catch {
    return false;
  }
}

/**
 * Ensure `repoRoot` is a git repository with at least one commit.
 *
 * - If `<repoRoot>/.git` already exists: returns `{ initialized: false,
 *   headSha }` where `headSha = git rev-parse HEAD`.
 * - Otherwise: runs `git init -b main`, sets the agent identity, stages
 *   everything (`git add .`), and creates an initial commit with
 *   `--allow-empty` so an empty directory still gets a real HEAD sha.
 *   Returns `{ initialized: true, headSha }`.
 *
 * Throws `GitCommandError` if any sub-command fails. The error carries
 * both stdout and stderr so the route layer can surface them under
 * `details` in the 500 response.
 */
export async function ensureGitRepo(repoRoot: string): Promise<GitState> {
  const gitDir = path.join(repoRoot, ".git");
  if (await pathExists(gitDir)) {
    const headSha = await gitHead(repoRoot);
    return { initialized: false, headSha };
  }

  // Fresh repo — bootstrap. Order matters: init first, then identity (must
  // be set before commit), then stage + commit.
  await runGit(repoRoot, ["init", "-b", DEFAULT_BRANCH]);
  await runGit(repoRoot, ["config", "user.email", AGENT_EMAIL]);
  await runGit(repoRoot, ["config", "user.name", AGENT_NAME]);
  await runGit(repoRoot, ["add", "."]);
  // `--allow-empty` so an empty `repoRoot` still produces HEAD. Without it
  // git refuses an initial commit with no staged changes, which would force
  // every caller to special-case the empty-template path.
  await runGit(repoRoot, [
    "commit",
    "--allow-empty",
    "-m",
    INITIAL_COMMIT_MESSAGE,
  ]);
  const headSha = await gitHead(repoRoot);
  return { initialized: true, headSha };
}

/** `git rev-parse HEAD` — the 40-char SHA of the current HEAD. */
export async function gitHead(repoRoot: string): Promise<string> {
  const { stdout } = await runGit(repoRoot, ["rev-parse", "HEAD"]);
  return stdout.trim();
}

/**
 * Stage the given paths. Pass `["."]` to stage everything.
 * No-op if `paths` is empty.
 */
export async function gitAdd(
  repoRoot: string,
  paths: string[],
): Promise<void> {
  if (paths.length === 0) return;
  await runGit(repoRoot, ["add", "--", ...paths]);
}

/**
 * Commit currently-staged changes with `message`. Returns the new HEAD
 * sha. Assumes the caller has already run `gitAdd` (or otherwise staged
 * the changes). Uses `--allow-empty` so callers don't have to pre-check
 * for an empty index — the runner endpoints frequently produce no-op
 * patches and we'd rather record an empty commit than throw.
 */
export async function gitCommit(
  repoRoot: string,
  message: string,
): Promise<string> {
  await runGit(repoRoot, ["commit", "--allow-empty", "-m", message]);
  return gitHead(repoRoot);
}

/**
 * True iff the working tree has no uncommitted or untracked changes.
 *
 * Uses `git status --porcelain` (machine-readable, stable across versions);
 * any non-empty output means there's at least one entry to clean up.
 */
export async function gitWorktreeIsClean(repoRoot: string): Promise<boolean> {
  const { stdout } = await runGit(repoRoot, ["status", "--porcelain"]);
  return stdout.trim().length === 0;
}

// Re-exported so route handlers can `instanceof`-check before formatting
// the 500 response.
export { GitCommandError };
