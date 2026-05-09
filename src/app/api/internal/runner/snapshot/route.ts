// Sandbox v2 runner — POST /api/internal/runner/snapshot
//
// Tarballs the workspace and PUTs it to a Supabase Storage signed upload
// URL minted by the orchestrator. The runner never holds Supabase
// credentials — the signed URL is the entire authorization. The
// orchestrator handles bucket layout + rotation server-side; this route
// only knows how to "make a tar.gz of the working tree and ship it".
//
// Flow:
//   1. Verify JWT via `withRunnerAuth`.
//   2. Parse + validate body (`SnapshotRequestSchema`).
//   3. Pre-flight: working tree must be clean. A snapshot of dirty state
//      would be inconsistent with the head sha already recorded.
//   4. `tar -czf /tmp/snapshot-<ts>.tar.gz --exclude=node_modules
//      --exclude=.next --exclude=.next-cache -C ${RUNNER_APP_DIR} .`
//      The `.` includes hidden files like `.git/` (canonical git history
//      is part of the snapshot — restore is a literal directory replay).
//   5. PUT the tarball Buffer to `uploadUrl` with
//      `Content-Type: application/gzip`.
//   6. Cleanup tmp file in `finally`.
//
// Failure modes (all return 500 JSON `{ error, details }`):
//   - dirty_tree           — pre-flight clean check failed
//   - tar_failed           — tar exited non-zero
//   - read_failed          — could not read the produced tarball
//   - upload_failed        — PUT returned non-2xx OR network error
//   - internal_error       — anything else

import { execFile } from "node:child_process";
import { readFile, stat, unlink } from "node:fs/promises";
import { promisify } from "node:util";

import { gitWorktreeIsClean } from "@/lib/git-runner";
import { withRunnerAuth } from "@/lib/runner-auth";
import { SnapshotRequestSchema } from "@/lib/runner-types";

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

    const parsed = SnapshotRequestSchema.safeParse(body);
    if (!parsed.success) {
      console.log(
        `[Runner:snapshot] orgId=${auth.orgId} sandboxId=${auth.sandboxId} bad_request=${parsed.error.issues.length}`,
      );
      return jsonError(400, { error: "invalid_request" });
    }

    const appDir = getAppDir();
    const tarballPath = `/tmp/snapshot-${Date.now()}-${Math.random().toString(36).slice(2, 10)}.tar.gz`;

    // 1. Pre-flight: refuse to snapshot a dirty tree. A dirty tree means
    //    the runner is mid-edit (or someone else mutated /home/user/app),
    //    and the resulting tarball would be inconsistent with the head
    //    sha the orchestrator just recorded.
    try {
      const clean = await gitWorktreeIsClean(appDir);
      if (!clean) {
        return jsonError(500, {
          error: "dirty_tree",
          details:
            "working tree has uncommitted changes; snapshot would be inconsistent with the head sha",
        });
      }
    } catch (error) {
      return jsonError(500, {
        error: "internal_error",
        details: error instanceof Error ? error.message : String(error),
      });
    }

    try {
      // 2. Build the tarball. `-C <dir>` cd's first, then `.` packs the
      //    cwd. Hidden entries (.git, .gitignore) are included by default;
      //    `--exclude=node_modules --exclude=.next --exclude=.next-cache`
      //    keeps the tar to ~a few MB.
      try {
        await execFileAsync(
          "tar",
          [
            "-czf",
            tarballPath,
            "--exclude=node_modules",
            "--exclude=.next",
            "--exclude=.next-cache",
            "-C",
            appDir,
            ".",
          ],
          { env: process.env, maxBuffer: 8 * 1024 * 1024 },
        );
      } catch (error) {
        const err = error as { stderr?: string; message?: string };
        return jsonError(500, {
          error: "tar_failed",
          details: err.stderr ?? err.message ?? String(error),
        });
      }

      // 3. Read the tarball + size.
      let buf: Buffer;
      let sizeBytes: number;
      try {
        const st = await stat(tarballPath);
        sizeBytes = st.size;
        buf = await readFile(tarballPath);
      } catch (error) {
        return jsonError(500, {
          error: "read_failed",
          details: error instanceof Error ? error.message : String(error),
        });
      }

      // 4. PUT to the signed Supabase Storage URL.
      try {
        const res = await fetch(parsed.data.uploadUrl, {
          method: "PUT",
          headers: { "Content-Type": "application/gzip" },
          body: new Uint8Array(buf),
        });
        if (!res.ok) {
          const text = await res.text().catch(() => "");
          return jsonError(500, {
            error: "upload_failed",
            details: `HTTP ${res.status}: ${text.slice(0, 256)}`,
          });
        }
      } catch (error) {
        return jsonError(500, {
          error: "upload_failed",
          details: error instanceof Error ? error.message : String(error),
        });
      }

      console.log(
        `[Runner:snapshot] orgId=${auth.orgId} sandboxId=${auth.sandboxId} ok sizeBytes=${sizeBytes}`,
      );
      return Response.json({ ok: true, sizeBytes });
    } finally {
      // Best-effort cleanup; never throws to the caller.
      await unlink(tarballPath).catch(() => {});
    }
  })) as Response;
}
