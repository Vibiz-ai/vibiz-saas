// Sandbox v2 runner — POST /api/internal/runner/restore
//
// Pull a snapshot tarball from a Supabase Storage signed URL and extract
// it on top of `RUNNER_APP_DIR`. Used by claim() when the orchestrator
// detects a `current.tar.gz` for this orgId — restore replaces the
// template's pristine initial commit with the workspace's history.
//
// Flow:
//   1. Verify JWT via `withRunnerAuth`.
//   2. Parse + validate body (`RestoreRequestSchema`).
//   3. GET the tarball from `downloadUrl` as a Buffer.
//   4. Write to `/tmp/restore-<ts>.tar.gz`.
//   5. `tar -xzf <tmp> -C ${RUNNER_APP_DIR}`. Existing files are
//      overwritten; `node_modules/` is untouched because it is not in
//      the tar (the dev server's installed deps survive across restores).
//   6. Read `git rev-parse HEAD` and return it as `headSha`.
//   7. Cleanup tmp file in `finally`.
//
// Failure modes (all return 500 JSON `{ error, details }`):
//   - download_failed      — fetch of downloadUrl returned non-2xx OR
//                            threw a network error
//   - write_failed         — could not stash the tarball to disk
//   - tar_failed           — tar exited non-zero
//   - head_failed          — git rev-parse HEAD failed (no .git after
//                            extract → corrupt tarball)
//   - internal_error       — anything else

import { execFile } from "node:child_process";
import { unlink, writeFile } from "node:fs/promises";
import { promisify } from "node:util";

import { GitCommandError, gitHead } from "@/lib/git-runner";
import { withRunnerAuth } from "@/lib/runner-auth";
import { RestoreRequestSchema } from "@/lib/runner-types";

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

export async function POST(req: Request): Promise<Response> {
  return (await withRunnerAuth(req, async (auth) => {
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return jsonError(400, { error: "invalid_json" });
    }

    const parsed = RestoreRequestSchema.safeParse(body);
    if (!parsed.success) {
      console.log(
        `[Runner:restore] orgId=${auth.orgId} sandboxId=${auth.sandboxId} bad_request=${parsed.error.issues.length}`,
      );
      return jsonError(400, { error: "invalid_request" });
    }

    const appDir = getAppDir();
    const tmpPath = `/tmp/restore-${Date.now()}-${Math.random().toString(36).slice(2, 10)}.tar.gz`;

    try {
      // 1. Fetch the tarball.
      let tarBytes: Uint8Array;
      try {
        const res = await fetch(parsed.data.downloadUrl);
        if (!res.ok) {
          const text = await res.text().catch(() => "");
          return jsonError(500, {
            error: "download_failed",
            details: `HTTP ${res.status}: ${text.slice(0, 256)}`,
          });
        }
        tarBytes = new Uint8Array(await res.arrayBuffer());
        if (tarBytes.byteLength === 0) {
          return jsonError(500, {
            error: "download_failed",
            details: "snapshot tarball is empty",
          });
        }
      } catch (error) {
        return jsonError(500, {
          error: "download_failed",
          details: error instanceof Error ? error.message : String(error),
        });
      }

      // 2. Stash to disk so tar can stream-extract.
      try {
        await writeFile(tmpPath, tarBytes);
      } catch (error) {
        return jsonError(500, {
          error: "write_failed",
          details: error instanceof Error ? error.message : String(error),
        });
      }

      // 3. Extract on top of RUNNER_APP_DIR. Existing files overwrite;
      //    node_modules/ is untouched because it isn't in the tar.
      try {
        await execFileAsync("tar", ["-xzf", tmpPath, "-C", appDir], {
          env: process.env,
          maxBuffer: 8 * 1024 * 1024,
        });
      } catch (error) {
        const err = error as { stderr?: string; message?: string };
        return jsonError(500, {
          error: "tar_failed",
          details: err.stderr ?? err.message ?? String(error),
        });
      }

      // 4. Read HEAD from the restored .git. If this fails the tarball
      //    was corrupt or missing .git/.
      let headSha: string;
      try {
        headSha = await gitHead(appDir);
      } catch (error) {
        const details =
          error instanceof GitCommandError
            ? error.stderr.trim() || error.stdout.trim() || error.message
            : error instanceof Error
              ? error.message
              : String(error);
        return jsonError(500, { error: "head_failed", details });
      }

      console.log(
        `[Runner:restore] orgId=${auth.orgId} sandboxId=${auth.sandboxId} ok headSha=${headSha.slice(0, 12)}`,
      );
      return Response.json({ ok: true, headSha });
    } finally {
      await unlink(tmpPath).catch(() => {});
    }
  })) as Response;
}
