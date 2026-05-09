// Sandbox v2 runner — POST /api/_internal/runner/claim
//
// Self-bootstrapping endpoint the parent vibiz orchestrator calls once at
// the start of every sandbox session. If `/home/user/app/.git` is missing
// we run the initial `git init` + commit so all downstream apply-* routes
// can assume a usable repo. This collapses what used to be two round-trips
// (claim → init) into one and removes the dedicated init endpoint.
//
// Behavior:
//   - existing repo: returns { ready: true, headSha, ..., initialized: false }
//   - missing repo: bootstraps, returns { ready: true, headSha, ..., initialized: true }
//   - bootstrap failure: 500 { error: 'git_init_failed', details: <stderr> }
//
// Real implementation. Other endpoints in this tree are stubs until their
// respective steps land.

import { GitCommandError, ensureGitRepo } from "@/lib/git-runner";
import { withRunnerAuth } from "@/lib/runner-auth";
import {
  ClaimRequestSchema,
  type ClaimResponse,
} from "@/lib/runner-types";

export const runtime = "nodejs";

const APP_DIR = "/home/user/app";
const RUNNER_VERSION = "0.1.0";
const DEV_SERVER_PORT = 3000;

export async function POST(req: Request): Promise<Response> {
  return (await withRunnerAuth(req, async (auth) => {
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return Response.json({ error: "invalid_json" }, { status: 400 });
    }

    const parsed = ClaimRequestSchema.safeParse(body);
    if (!parsed.success) {
      console.log(
        `[Runner:claim] orgId=${auth.orgId} sandboxId=${auth.sandboxId} bad_request=${parsed.error.issues.length}`,
      );
      return Response.json({ error: "invalid_request" }, { status: 400 });
    }

    console.log(
      `[Runner:claim] orgId=${auth.orgId} sandboxId=${auth.sandboxId} schemaVersion=${parsed.data.schemaVersion}`,
    );

    try {
      const { initialized, headSha } = await ensureGitRepo(APP_DIR);
      console.log(
        `[Runner:claim] orgId=${auth.orgId} sandboxId=${auth.sandboxId} initialized=${initialized} headSha=${headSha.slice(0, 12)}`,
      );
      const response: ClaimResponse = {
        ready: true,
        headSha,
        devServerPort: DEV_SERVER_PORT,
        runnerVersion: RUNNER_VERSION,
        initialized,
      };
      return Response.json(response);
    } catch (error) {
      const details =
        error instanceof GitCommandError
          ? error.stderr.trim() || error.stdout.trim() || error.message
          : error instanceof Error
            ? error.message
            : String(error);
      console.log(
        `[Runner:claim] orgId=${auth.orgId} sandboxId=${auth.sandboxId} git_init_failed=${details}`,
      );
      return Response.json(
        { error: "git_init_failed", details },
        { status: 500 },
      );
    }
  })) as Response;
}
