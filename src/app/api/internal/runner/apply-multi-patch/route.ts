// Sandbox v2 runner — POST /api/internal/runner/apply-multi-patch
//
// Class C — multi-file structural edit. The vibiz-side orchestrator
// emits an array of unified diffs (e.g. "add a new /about page" =
// new file `app/about/page.tsx` + a small edit to the nav config).
// All diffs are applied atomically: any single failure aborts the
// whole batch and leaves the working tree exactly as we found it.
//
// Body shape (zod-validated via ApplyMultiPatchRequestSchema):
//   {
//     diffs: Array<{ path: string; diff: string }>;
//     summary: string;
//     userPrompt?: string;
//   }
//
// Flow:
//   1. Verify JWT (`withRunnerAuth`).
//   2. Parse + validate request body.
//   3. Pre-flight: working tree must be clean.
//   4. Sanity-check every diff `path`: relative, no `..` escape, must
//      resolve INSIDE `RUNNER_APP_DIR`. The runner is the only writer
//      but the LLM provides the path — defence in depth.
//   5. Write each diff to a unique tmp file.
//   6. Two-phase apply:
//        a. CHECK phase — `git apply --check <tmp>` for every diff.
//           If ANY fails → 400 patch_does_not_apply. NO files modified.
//        b. APPLY phase — `git apply <tmp>` for every diff IN ORDER.
//           A diff that creates a new file uses `--- /dev/null`; a
//           diff that deletes a file uses `+++ /dev/null`. Both are
//           handled natively by `git apply`. ORDER MATTERS — if two
//           diffs touch the same file, later diffs see the earlier
//           diff's changes. If a mid-batch apply fails (rare after
//           --check), `git restore .` rolls back to HEAD and we
//           return 500 patch_apply_failed.
//   7. `git add -A` (catches new files added by `new file mode` diffs).
//   8. `git commit -m <summary>` once for the whole batch — single
//      atomic commit on success.
//   9. Always cleanup tmp files in finally.
//  10. Return `{ commitSha, filesChanged, hmrReady, snapshotUploaded }`.
//
// Failure modes (stable error codes for the orchestrator to branch on):
//   - 400 invalid_json / invalid_request    — body shape problems
//   - 400 empty_diffs                        — diffs array length 0 (zod
//                                              also rejects, this is
//                                              defence in depth)
//   - 400 file_path_invalid                  — diff path escapes
//                                              RUNNER_APP_DIR
//   - 400 patch_does_not_apply               — `git apply --check` failed
//   - 500 dirty_tree                         — pre-existing uncommitted
//                                              changes
//   - 500 patch_apply_failed                 — apply failed mid-batch
//                                              after --check passed; we
//                                              rolled back via
//                                              `git restore`
//   - 500 git_failed                         — add/commit/rev-parse failed
//   - 500 internal_error                     — unexpected throw

import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";

import {
  gitAdd,
  gitCommit,
  gitHead,
  gitWorktreeIsClean,
  GitCommandError,
} from "@/lib/git-runner";
import { withRunnerAuth } from "@/lib/runner-auth";
import { ApplyMultiPatchRequestSchema } from "@/lib/runner-types";

export const runtime = "nodejs";

const execFileAsync = promisify(execFile);

function getAppDir(): string {
  return process.env.RUNNER_APP_DIR || "/home/user/app";
}

interface JsonError {
  error: string;
  details?: unknown;
  failedPath?: string;
}

function jsonError(status: number, body: JsonError): Response {
  return Response.json(body, { status });
}

/**
 * Validate `filePath` is safe: must be relative, must not escape
 * `repoRoot` after `path.resolve`. Returns the absolute resolved path
 * on success, null on failure. Mirrors apply-file-patch/route.ts so
 * both endpoints share the same defence.
 */
function resolveSafePath(repoRoot: string, filePath: string): string | null {
  if (path.isAbsolute(filePath)) return null;
  const resolved = path.resolve(repoRoot, filePath);
  const root = repoRoot.endsWith(path.sep) ? repoRoot : repoRoot + path.sep;
  if (resolved !== repoRoot && !resolved.startsWith(root)) return null;
  return resolved;
}

/**
 * Run `git apply` with the given args. Captures stderr so the route
 * can surface it under `details` to help the LLM fix the diff on
 * retry. Returns `{ ok: true }` or `{ ok: false, stderr }`.
 */
async function gitApply(
  cwd: string,
  args: ReadonlyArray<string>,
): Promise<{ ok: true } | { ok: false; stderr: string }> {
  try {
    await execFileAsync("git", ["apply", ...args], {
      cwd,
      env: process.env,
      maxBuffer: 16 * 1024 * 1024,
    });
    return { ok: true };
  } catch (error) {
    const err = error as { stderr?: string; message?: string };
    return {
      ok: false,
      stderr: (err.stderr ?? err.message ?? String(error)).trim(),
    };
  }
}

/**
 * Roll back the working tree + index to HEAD. Used after a mid-batch
 * apply failure so we don't leave partial diffs lying around. Best-
 * effort — if the rollback itself errors we log and let the caller
 * still see the original failure.
 */
async function rollbackToHead(cwd: string): Promise<void> {
  try {
    // `git restore --staged --worktree -- .` returns the index AND the
    // working tree to HEAD, but is gentler than `git reset --hard` (it
    // doesn't touch HEAD itself). Untracked files created by a
    // `new file mode` diff aren't tracked yet, so `git restore` leaves
    // them; clean them with `git clean -fd`.
    await execFileAsync(
      "git",
      ["restore", "--staged", "--worktree", "--", "."],
      { cwd, env: process.env },
    );
    await execFileAsync("git", ["clean", "-fd"], {
      cwd,
      env: process.env,
    });
  } catch (err) {
    console.error(
      "[Runner:apply-multi-patch] rollback failed:",
      err instanceof Error ? err.message : err,
    );
  }
}

export async function POST(req: Request): Promise<Response> {
  return (await withRunnerAuth(req, async (auth) => {
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return jsonError(400, { error: "invalid_json" });
    }

    const parsed = ApplyMultiPatchRequestSchema.safeParse(body);
    if (!parsed.success) {
      console.log(
        `[Runner:apply-multi-patch] orgId=${auth.orgId} sandboxId=${auth.sandboxId} bad_request=${parsed.error.issues.length}`,
      );
      return jsonError(400, { error: "invalid_request" });
    }

    const { diffs, summary } = parsed.data;
    const appDir = getAppDir();

    // Belt-and-braces: zod's .min(1) already rejects an empty array,
    // but we want a stable, dedicated error code for the orchestrator
    // to branch on.
    if (diffs.length === 0) {
      return jsonError(400, { error: "empty_diffs" });
    }

    console.log(
      `[Runner:apply-multi-patch] orgId=${auth.orgId} sandboxId=${auth.sandboxId} files=${diffs.length} summary="${summary}"`,
    );

    // 1. Validate every diff path is safe (relative, inside repoRoot).
    //    Defer all I/O until after this gate so a malicious path fails
    //    before we touch the disk.
    for (const entry of diffs) {
      const resolved = resolveSafePath(appDir, entry.path);
      if (!resolved) {
        return jsonError(400, {
          error: "file_path_invalid",
          failedPath: entry.path,
          details: "path must be relative and must not escape RUNNER_APP_DIR",
        });
      }
    }

    // 2. Pre-flight: clean tree. If a human or another process has
    //    pending changes, refuse — we don't want to mix their work into
    //    our atomic commit.
    try {
      if (!(await gitWorktreeIsClean(appDir))) {
        return jsonError(500, {
          error: "dirty_tree",
          details:
            "working tree has uncommitted changes; runner refuses to commit on top",
        });
      }
    } catch (error) {
      return jsonError(500, {
        error: "git_failed",
        details: error instanceof Error ? error.message : String(error),
      });
    }

    // 3. Stage every diff in its own tmp file. One isolated dir for the
    //    whole batch keeps cleanup trivial in `finally`.
    const tmpDir = await mkdtemp(path.join(tmpdir(), "vibiz-multi-patch-"));
    const tmpFiles: string[] = [];

    try {
      for (let i = 0; i < diffs.length; i++) {
        const entry = diffs[i];
        if (!entry) continue;
        const tmpPath = path.join(tmpDir, `patch-${i}.diff`);
        await writeFile(tmpPath, entry.diff, "utf8");
        tmpFiles.push(tmpPath);
      }

      // 4a. CHECK phase — verify EVERY diff would apply cleanly before
      //     we mutate anything. If any fails we return 400 and the
      //     working tree stays exactly as we found it.
      for (let i = 0; i < tmpFiles.length; i++) {
        const tmpPath = tmpFiles[i];
        const entry = diffs[i];
        if (!tmpPath || !entry) continue;
        const checkResult = await gitApply(appDir, ["--check", "--", tmpPath]);
        if (!checkResult.ok) {
          return jsonError(400, {
            error: "patch_does_not_apply",
            failedPath: entry.path,
            details: checkResult.stderr,
          });
        }
      }

      // 4b. APPLY phase — run each diff in order. Order matters: a
      //     later diff that depends on an earlier one (e.g. two diffs
      //     touching the same file) sees the earlier diff's changes.
      //     If anything fails mid-batch we roll back to HEAD via
      //     `git restore` so the caller sees an unchanged tree on retry.
      for (let i = 0; i < tmpFiles.length; i++) {
        const tmpPath = tmpFiles[i];
        const entry = diffs[i];
        if (!tmpPath || !entry) continue;
        const applyResult = await gitApply(appDir, ["--", tmpPath]);
        if (!applyResult.ok) {
          await rollbackToHead(appDir);
          return jsonError(500, {
            error: "patch_apply_failed",
            failedPath: entry.path,
            details: applyResult.stderr,
          });
        }
      }

      // 5. `git add -A` picks up new files (`new file mode` diffs leave
      //    them untracked) AND deletions (`+++ /dev/null` diffs).
      //    Single commit captures the whole batch atomically.
      let commitSha: string;
      try {
        await gitAdd(appDir, ["-A"]);
        commitSha = await gitCommit(appDir, summary);
      } catch (error) {
        // Apply succeeded but commit failed — roll back so the next
        // call doesn't trip the dirty_tree precondition.
        await rollbackToHead(appDir);
        const message =
          error instanceof GitCommandError
            ? error.message
            : error instanceof Error
              ? error.message
              : String(error);
        return jsonError(500, { error: "git_failed", details: message });
      }

      // Sanity round-trip: gitCommit returned HEAD; verify it for the
      // log line. On failure we still trust the commit sha we got back.
      const head = await gitHead(appDir).catch(() => commitSha);
      console.log(
        `[Runner:apply-multi-patch] orgId=${auth.orgId} sandboxId=${auth.sandboxId} commitSha=${head.slice(0, 12)} files=${diffs.length}`,
      );

      return Response.json({
        commitSha,
        filesChanged: diffs.map((d) => d.path),
        hmrReady: true,
        snapshotUploaded: false,
      });
    } catch (error) {
      // Safety net: anything we didn't anticipate. Best-effort rollback
      // so we don't leave the tree in a weird state for the next call.
      await rollbackToHead(appDir);
      return jsonError(500, {
        error: "internal_error",
        details: error instanceof Error ? error.message : String(error),
      });
    } finally {
      await rm(tmpDir, { recursive: true, force: true }).catch(() => {});
    }
  })) as Response;
}
