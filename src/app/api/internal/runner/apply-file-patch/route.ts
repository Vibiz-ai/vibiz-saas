// Sandbox v2 runner — POST /api/internal/runner/apply-file-patch
//
// Single-file edit path. The vibiz-side EditRouter classifier emits a
// unified diff against ONE file (typically the file under the user's
// VibizSelectBridge selection). This route applies that diff via
// `git apply` and commits.
//
// Flow:
//   1. Verify JWT (`withRunnerAuth`).
//   2. Parse + validate request body (`ApplyFilePatchRequestSchema`).
//   3. Pre-flight: working tree must be clean.
//   4. Sanity-check `filePath`: relative, no `..` escape, resolves inside
//      `RUNNER_APP_DIR`. The runner is the only writer in the sandbox,
//      but the LLM produces this path — defence in depth.
//   5. Verify the target file exists.
//   6. Write `unifiedDiff` to a temp file under `tmpdir()`.
//   7. `git apply --check <tmp>` — refuse on conflict (400).
//   8. `git apply <tmp>` — should always succeed after --check.
//   9. `git add <filePath>` + `git commit -m <summary>` via git-runner.
//  10. Return `{ commitSha, filesChanged, hmrReady, snapshotUploaded }`.
//
// Failure modes — all return JSON with a stable `error` code so the vibiz
// orchestrator can branch on it:
//   - 400 invalid_json / invalid_request — body shape problems
//   - 400 file_path_invalid               — escapes RUNNER_APP_DIR or absolute
//   - 400 file_not_found                  — target file missing
//   - 400 patch_does_not_apply            — `git apply --check` failed
//   - 500 dirty_tree                      — pre-existing uncommitted changes
//   - 500 patch_apply_failed              — `git apply` failed after --check
//   - 500 git_failed                      — add/commit/rev-parse failed
//   - 500 internal_error                  — unexpected throw

import { execFile } from "node:child_process";
import { access, mkdtemp, rm, writeFile } from "node:fs/promises";
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
import { ApplyFilePatchRequestSchema } from "@/lib/runner-types";

export const runtime = "nodejs";

const execFileAsync = promisify(execFile);

function getAppDir(): string {
  return process.env.RUNNER_APP_DIR || "/home/user/app";
}

interface JsonError {
  error: string;
  details?: unknown;
}

function jsonError(status: number, body: JsonError): Response {
  return Response.json(body, { status });
}

/**
 * Validate `filePath` is safe: must be relative, must not escape
 * `repoRoot` after `path.resolve`. Returns the absolute resolved path
 * on success, null on failure.
 */
function resolveSafePath(repoRoot: string, filePath: string): string | null {
  if (path.isAbsolute(filePath)) return null;
  const resolved = path.resolve(repoRoot, filePath);
  // Use a trailing separator on the root so a path like "/home/user/app2"
  // doesn't pass `startsWith("/home/user/app")`.
  const root = repoRoot.endsWith(path.sep) ? repoRoot : repoRoot + path.sep;
  if (resolved !== repoRoot && !resolved.startsWith(root)) return null;
  return resolved;
}

async function fileExists(p: string): Promise<boolean> {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
}

/**
 * Run `git apply` with the given args. Captures stderr so the route
 * layer can surface it under `details` to help the LLM fix the diff
 * on retry. Returns `{ ok: true }` or `{ ok: false, stderr }`.
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

export async function POST(req: Request): Promise<Response> {
  return (await withRunnerAuth(req, async (auth) => {
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return jsonError(400, { error: "invalid_json" });
    }

    const parsed = ApplyFilePatchRequestSchema.safeParse(body);
    if (!parsed.success) {
      console.log(
        `[Runner:apply-file-patch] orgId=${auth.orgId} sandboxId=${auth.sandboxId} bad_request=${parsed.error.issues.length}`,
      );
      return jsonError(400, { error: "invalid_request" });
    }

    const { filePath, unifiedDiff, summary } = parsed.data;
    const appDir = getAppDir();

    console.log(
      `[Runner:apply-file-patch] orgId=${auth.orgId} sandboxId=${auth.sandboxId} filePath=${filePath} summary="${summary}"`,
    );

    // 1. filePath sanity check — relative + inside repoRoot.
    const absolutePath = resolveSafePath(appDir, filePath);
    if (!absolutePath) {
      return jsonError(400, {
        error: "file_path_invalid",
        details:
          "filePath must be relative and must not escape RUNNER_APP_DIR",
      });
    }

    // 2. Pre-flight: clean tree. The runner is the sole writer; a dirty
    //    tree means a human or another process touched it and we should
    //    fail loud rather than mix changes into their commit.
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

    // 3. File must exist. The unified diff format supports creation/
    //    deletion, but for class B (selection-driven element edit) the
    //    file is always pre-existing. Refusing missing-file diffs early
    //    gives the LLM a clearer signal to recover.
    if (!(await fileExists(absolutePath))) {
      return jsonError(400, { error: "file_not_found" });
    }

    // 4. Stage the diff in a unique tmp file and run --check first.
    //    `mkdtemp` gives us an isolated dir so concurrent calls (very
    //    rare in production but possible in tests) can't collide.
    const tmpDir = await mkdtemp(path.join(tmpdir(), "vibiz-file-patch-"));
    const diffPath = path.join(tmpDir, `patch-${Date.now()}.diff`);

    try {
      await writeFile(diffPath, unifiedDiff, "utf8");

      const checkResult = await gitApply(appDir, ["--check", "--", diffPath]);
      if (!checkResult.ok) {
        return jsonError(400, {
          error: "patch_does_not_apply",
          details: checkResult.stderr,
        });
      }

      const applyResult = await gitApply(appDir, ["--", diffPath]);
      if (!applyResult.ok) {
        // --check passed but apply failed; very rare. Surface stderr so
        // the orchestrator has something useful to log.
        return jsonError(500, {
          error: "patch_apply_failed",
          details: applyResult.stderr,
        });
      }

      // 5. Commit. `gitAdd` + `gitCommit` go through the shared helpers
      //    so we get GitCommandError details on failure.
      let commitSha: string;
      try {
        await gitAdd(appDir, [filePath]);
        commitSha = await gitCommit(appDir, summary);
      } catch (error) {
        // Best-effort: if gitAdd/gitCommit threw, the working tree may
        // still have the patched file uncommitted. Reset it to HEAD so
        // the next call doesn't trip the dirty_tree precondition.
        try {
          await execFileAsync("git", ["checkout", "--", filePath], {
            cwd: appDir,
            env: process.env,
          });
        } catch {
          // best-effort restore — don't mask the real error
        }
        const message =
          error instanceof GitCommandError
            ? error.message
            : error instanceof Error
              ? error.message
              : String(error);
        return jsonError(500, { error: "git_failed", details: message });
      }

      // Sanity: gitCommit returns HEAD; verify it round-trips for logs.
      const head = await gitHead(appDir).catch(() => commitSha);
      console.log(
        `[Runner:apply-file-patch] orgId=${auth.orgId} sandboxId=${auth.sandboxId} commitSha=${head.slice(0, 12)}`,
      );

      return Response.json({
        commitSha,
        filesChanged: [filePath],
        hmrReady: true,
        snapshotUploaded: false,
      });
    } catch (error) {
      return jsonError(500, {
        error: "internal_error",
        details: error instanceof Error ? error.message : String(error),
      });
    } finally {
      // Always clean up the tmp diff dir.
      await rm(tmpDir, { recursive: true, force: true }).catch(() => {});
    }
  })) as Response;
}
