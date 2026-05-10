// Sandbox v2 runner — GET /api/internal/runner/file?path=<relative>
//
// Read an arbitrary file from the sandbox repo root (`RUNNER_APP_DIR`).
// The vibiz-side orchestrator calls this for class B (single-file edit)
// before generating the unified diff so the LLM sees the actual current
// source instead of guessing.
//
// Errors:
//   - 400 missing_path        — `path` query param absent
//   - 400 file_path_invalid   — absolute path or escapes RUNNER_APP_DIR
//   - 404 file_not_found      — file does not exist
//   - 500 read_failed         — read errored for any other reason
//   - 500 git_failed          — `git rev-parse HEAD` failed

import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

import { withRunnerAuth } from "@/lib/runner-auth";
import type { FileReadResponse } from "@/lib/runner-types";

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
 * `repoRoot`. Returns the absolute resolved path on success, null on
 * failure. Same logic as apply-file-patch.
 */
function resolveSafePath(repoRoot: string, filePath: string): string | null {
  if (path.isAbsolute(filePath)) return null;
  const resolved = path.resolve(repoRoot, filePath);
  const root = repoRoot.endsWith(path.sep) ? repoRoot : repoRoot + path.sep;
  if (resolved !== repoRoot && !resolved.startsWith(root)) return null;
  return resolved;
}

async function git(cwd: string, args: string[]): Promise<string> {
  const { stdout } = await execFileAsync("git", args, {
    cwd,
    env: process.env,
  });
  return stdout.trim();
}

export async function GET(req: Request): Promise<Response> {
  return (await withRunnerAuth(req, async (auth) => {
    const url = new URL(req.url);
    const filePath = url.searchParams.get("path");
    if (!filePath) {
      return jsonError(400, { error: "missing_path" });
    }

    const appDir = getAppDir();
    const absolutePath = resolveSafePath(appDir, filePath);
    if (!absolutePath) {
      return jsonError(400, {
        error: "file_path_invalid",
        details:
          "path must be relative and must not escape RUNNER_APP_DIR",
      });
    }

    let contents: string;
    try {
      contents = await readFile(absolutePath, "utf8");
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code === "ENOENT" || code === "EISDIR") {
        return jsonError(404, { error: "file_not_found" });
      }
      return jsonError(500, {
        error: "read_failed",
        details: error instanceof Error ? error.message : String(error),
      });
    }

    let sha: string;
    try {
      sha = await git(appDir, ["rev-parse", "HEAD"]);
    } catch (error) {
      return jsonError(500, {
        error: "git_failed",
        details: error instanceof Error ? error.message : String(error),
      });
    }

    console.log(
      `[Runner:file] orgId=${auth.orgId} sandboxId=${auth.sandboxId} path=${filePath} bytes=${contents.length} sha=${sha.slice(0, 12)}`,
    );

    const response: FileReadResponse = { contents, sha };
    return Response.json(response);
  })) as Response;
}
