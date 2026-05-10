// Sandbox v2 runner — POST /api/internal/runner/git-revert
//
// Hard-reset the working tree to a previously-known-good commit.
//
// Wire contract: `{ sha }` in, `{ ok: true, headSha }` out. `sha` must
// be a 40-char lowercase hex string — anything else short-circuits to
// 400 `invalid_request` so an upstream typo never reaches git.
//
// Semantics: we use `git reset --hard <sha>` (NOT `git revert <sha>`):
// the orchestrator's `verifyBuildOrRevert` policy is "go back to the
// pre-apply commit and discard everything on top". A `revert` would
// instead create a new inverse commit, leaving the broken state in
// history; that's the wrong shape for an auto-revert that needs to
// produce a clean snapshot for the next edit cycle.
//
// Failure modes (mirror apply-config-patch):
//   - 400 invalid_json     — body wasn't JSON
//   - 400 invalid_request  — Zod parse failed (missing/empty `sha`)
//   - 400 invalid_request  — `sha` is not a 40-char hex string
//   - 500 git_failed       — `git reset` threw (commit not found,
//                            corrupt index, etc.); stderr surfaced via
//                            GitCommandError.stderr under `details`

import { withRunnerAuth } from "@/lib/runner-auth";
import { GitCommandError, gitHead, runGit } from "@/lib/git-runner";
import { GitRevertRequestSchema } from "@/lib/runner-types";

export const runtime = "nodejs";

function getAppDir(): string {
  return process.env.RUNNER_APP_DIR || "/home/user/app";
}

const SHA_RE = /^[0-9a-f]{40}$/;

interface JsonError {
  error: string;
  details?: unknown;
}

function jsonError(status: number, body: JsonError): Response {
  return Response.json(body, { status });
}

export async function POST(req: Request): Promise<Response> {
  return (await withRunnerAuth(req, async (auth) => {
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return jsonError(400, { error: "invalid_json" });
    }

    const parsed = GitRevertRequestSchema.safeParse(body);
    if (!parsed.success) {
      console.log(
        `[Runner:git-revert] orgId=${auth.orgId} sandboxId=${auth.sandboxId} bad_request=${parsed.error.issues.length}`,
      );
      return jsonError(400, { error: "invalid_request" });
    }

    const sha = parsed.data.sha.trim().toLowerCase();
    if (!SHA_RE.test(sha)) {
      console.log(
        `[Runner:git-revert] orgId=${auth.orgId} sandboxId=${auth.sandboxId} bad_sha_format`,
      );
      return jsonError(400, {
        error: "invalid_request",
        details: "sha must be a 40-char lowercase hex string",
      });
    }

    const appDir = getAppDir();
    console.log(
      `[Runner:git-revert] orgId=${auth.orgId} sandboxId=${auth.sandboxId} reset_to=${sha}`,
    );

    try {
      // `--hard` discards both staged and working-tree changes — the
      // intent is "this commit IS HEAD now, drop everything on top".
      // If `sha` doesn't exist in the repo (orchestrator passed a
      // stale or wrong sha), git emits e.g.
      //   "fatal: ambiguous argument '<sha>': unknown revision"
      // and exits non-zero — runGit throws GitCommandError and we
      // surface stderr verbatim under `details`.
      await runGit(appDir, ["reset", "--hard", sha]);
    } catch (error) {
      if (error instanceof GitCommandError) {
        return jsonError(500, {
          error: "git_failed",
          details: {
            stderr: error.stderr,
            stdout: error.stdout,
          },
        });
      }
      return jsonError(500, {
        error: "git_failed",
        details: error instanceof Error ? error.message : String(error),
      });
    }

    let headSha: string;
    try {
      headSha = await gitHead(appDir);
    } catch (error) {
      // Vanishingly rare: reset succeeded but rev-parse failed. Still
      // a `git_failed` so the orchestrator surfaces it consistently.
      return jsonError(500, {
        error: "git_failed",
        details: error instanceof Error ? error.message : String(error),
      });
    }

    if (headSha !== sha) {
      // Defensive: reset --hard <sha> should always land HEAD at <sha>.
      // If it doesn't, something's deeply wrong with the repo state.
      console.error(
        `[Runner:git-revert] orgId=${auth.orgId} sandboxId=${auth.sandboxId} head_mismatch expected=${sha} got=${headSha}`,
      );
      return jsonError(500, {
        error: "git_failed",
        details: `HEAD did not advance to target sha (got ${headSha})`,
      });
    }

    return Response.json({ ok: true, headSha });
  })) as Response;
}
