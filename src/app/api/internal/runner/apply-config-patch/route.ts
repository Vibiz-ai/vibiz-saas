// Sandbox v2 runner — POST /api/internal/runner/apply-config-patch
//
// AST-aware patch application for `template.config.ts`. The vibiz-side
// EditRouter classifier (Step 8) emits ops shaped against
// `ApplyConfigPatchRequestSchema`; this route applies them via the
// ts-morph executor in `src/lib/config-patch-executor.ts`, validates the
// result by dynamic import + zod parse, and commits via git.
//
// Flow:
//   1. Verify JWT (`withRunnerAuth`).
//   2. Parse + validate request body (`ApplyConfigPatchRequestSchema`).
//   3. Read `<APP_DIR>/template.config.ts` from disk.
//   4. Apply ops in-memory through `applyConfigOps`.
//   5. Write result back to disk (atomic-ish: write-then-validate-then-restore).
//   6. Validate by dynamic-import + `TemplateConfigSchema.parse`.
//   7. `git add` + `git commit -m <summary>` in <APP_DIR>.
//   8. Return `{ commitSha, filesChanged, hmrReady, snapshotUploaded }`.
//
// Failure modes — all return JSON with a stable `error` code so the vibiz
// orchestrator can branch on it:
//   - 400 invalid_json / invalid_request — body shape problems
//   - 400 patch_failed                     — op error (path missing, etc.)
//   - 400 invalid_config                   — zod parse failed after patch
//   - 500 dirty_tree                       — pre-existing uncommitted changes
//   - 500 git_failed                       — git add/commit failed
//   - 500 internal_error                   — unexpected throw
//
// On any failure after the file has been written, we restore the original
// source so the runner never leaves the working tree in a half-applied
// state.

import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";

import { applyConfigOps, ConfigPatchError } from "@/lib/config-patch-executor";
import { withRunnerAuth } from "@/lib/runner-auth";
import { ApplyConfigPatchRequestSchema } from "@/lib/runner-types";
import { TemplateConfigSchema } from "@/lib/template-config.schema";

export const runtime = "nodejs";

// Both the chassis production runtime and local tests need a configurable
// app directory. In E2B the chassis lives at `/home/user/app`; in CI/dev
// override via `RUNNER_APP_DIR`. Lazy-resolved at call time.
function getAppDir(): string {
  return process.env.RUNNER_APP_DIR || "/home/user/app";
}

const execFileAsync = promisify(execFile);

interface JsonError {
  error: string;
  details?: unknown;
  step?: string;
}

function jsonError(status: number, body: JsonError): Response {
  return Response.json(body, { status });
}

/**
 * Run a git command in the given cwd. Throws on non-zero exit.
 *
 * Uses `execFile` (not `exec`) so each arg is passed directly to git
 * without shell interpolation — protects against `summary` strings that
 * contain `$`, `;`, backticks, etc.
 */
// `-c safe.directory=*` whitelists ownership mismatch — needed because
// /home/user/app/.git is created by root (template build) but the route
// handler may run as a different uid.
async function git(cwd: string, args: string[]): Promise<string> {
  const { stdout } = await execFileAsync(
    "git",
    ["-c", "safe.directory=*", ...args],
    { cwd, env: process.env },
  );
  return stdout.trim();
}

function tsxBin(appDir: string): string {
  return path.join(appDir, "node_modules", ".bin", "tsx");
}

/**
 * Returns true if the tree at <cwd> has uncommitted changes (excluding
 * untracked-but-ignored files). Used as a precondition: the runner is the
 * sole writer, so a dirty tree means something else mutated it.
 */
async function isWorkingTreeDirty(cwd: string): Promise<boolean> {
  const out = await git(cwd, ["status", "--porcelain"]);
  return out.length > 0;
}

/**
 * Validate a TypeScript source by spawning a child Node process with
 * `--experimental-strip-types`, dynamically importing the file, and
 * printing `JSON.stringify(config)` to stdout. Parent then runs that
 * JSON through `TemplateConfigSchema`.
 *
 * Why a subprocess instead of an inline `await import(url)`:
 *   - This route handler is bundled by Next.js (Webpack / Turbopack).
 *     A bare `await import(url)` becomes a critical-dependency expression
 *     in the bundle and the resulting bundled handler cannot resolve
 *     arbitrary file:// URLs at runtime.
 *   - Spawning a fresh `node` process side-steps the bundler entirely
 *     and lets node's strip-types loader handle the .ts file directly.
 *
 * Trade-off: ~80-200ms overhead per call (spawn + boot). Acceptable for
 * the runner — apply-config-patch happens on the order of 1/minute.
 *
 * The chassis already requires Node 22+ (see `node --experimental-strip-types`
 * usage in `package.json` scripts), so the loader is available.
 */
async function validateConfigSource(sourceText: string): Promise<
  | { ok: true }
  | { ok: false; error: string; details: unknown }
> {
  const dir = await mkdtemp(path.join(tmpdir(), "vibiz-config-"));
  const filePath = path.join(dir, `config-${Date.now()}.ts`);
  const evalScript = `
    import('${filePath.replace(/\\/g, "\\\\").replace(/'/g, "\\'")}')
      .then((m) => {
        process.stdout.write(JSON.stringify(m.config ?? null));
      })
      .catch((e) => {
        process.stderr.write(e && e.stack ? e.stack : String(e));
        process.exit(2);
      });
  `;
  try {
    await writeFile(filePath, sourceText, "utf8");

    let stdout: string;
    try {
      // tsx works on any Node version. We write the eval script to a
      // .mjs file and run it via tsx (sandbox Node is 20.x which
      // lacks --experimental-strip-types).
      const scriptPath = path.join(dir, `eval-${Date.now()}.mjs`);
      await writeFile(scriptPath, evalScript, "utf8");
      const result = await execFileAsync(
        tsxBin(getAppDir()),
        [scriptPath],
        { env: process.env, maxBuffer: 8 * 1024 * 1024 },
      );
      stdout = result.stdout;
    } catch (error) {
      const err = error as { stderr?: string; message?: string };
      return {
        ok: false,
        error: "module_import_failed",
        details: err.stderr ?? err.message ?? String(error),
      };
    }

    let parsedJson: unknown;
    try {
      parsedJson = JSON.parse(stdout);
    } catch (error) {
      return {
        ok: false,
        error: "module_import_failed",
        details: `subprocess stdout was not JSON: ${error instanceof Error ? error.message : String(error)}`,
      };
    }

    if (!parsedJson || typeof parsedJson !== "object") {
      return {
        ok: false,
        error: "config_export_missing",
        details: "imported module did not export `config` as an object",
      };
    }

    const result = TemplateConfigSchema.safeParse(parsedJson);
    if (!result.success) {
      return {
        ok: false,
        error: "schema_parse_failed",
        details: result.error.issues,
      };
    }
    return { ok: true };
  } finally {
    // Best-effort cleanup; never throws to the caller.
    await rm(dir, { recursive: true, force: true }).catch(() => {});
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

    const parsed = ApplyConfigPatchRequestSchema.safeParse(body);
    if (!parsed.success) {
      console.log(
        `[Runner:apply-config-patch] orgId=${auth.orgId} sandboxId=${auth.sandboxId} bad_request=${parsed.error.issues.length}`,
      );
      return jsonError(400, { error: "invalid_request" });
    }

    const appDir = getAppDir();
    const configPath = path.join(appDir, "template.config.ts");
    console.log(
      `[Runner:apply-config-patch] orgId=${auth.orgId} sandboxId=${auth.sandboxId} ops=${parsed.data.operations.length} summary="${parsed.data.summary}"`,
    );

    // 1. Pre-flight: make sure the tree is clean. The runner is the only
    //    writer; a dirty tree means a human or another process intervened
    //    and we should fail loud rather than silently mix changes into
    //    their commit.
    try {
      if (await isWorkingTreeDirty(appDir)) {
        return jsonError(500, {
          error: "dirty_tree",
          details: "working tree has uncommitted changes; runner refuses to commit on top",
        });
      }
    } catch (error) {
      return jsonError(500, {
        error: "git_failed",
        details: error instanceof Error ? error.message : String(error),
      });
    }

    // 2. Read original source — needed for restore-on-failure.
    let originalSource: string;
    try {
      originalSource = await readFile(configPath, "utf8");
    } catch (error) {
      return jsonError(500, {
        error: "read_failed",
        details: error instanceof Error ? error.message : String(error),
      });
    }

    // 3. Apply ops in-memory.
    let newSource: string;
    try {
      const result = await applyConfigOps(originalSource, parsed.data.operations);
      newSource = result.newSourceText;
    } catch (error) {
      if (error instanceof ConfigPatchError) {
        return jsonError(400, {
          error: "patch_failed",
          details: { code: error.code, message: error.message },
        });
      }
      return jsonError(500, {
        error: "internal_error",
        details: error instanceof Error ? error.message : String(error),
      });
    }

    // 4. Write to disk so the dynamic-import validator can load it.
    try {
      await writeFile(configPath, newSource, "utf8");
    } catch (error) {
      return jsonError(500, {
        error: "write_failed",
        details: error instanceof Error ? error.message : String(error),
      });
    }

    // 5. Validate the new file by dynamic-import + zod parse. On failure,
    //    restore the original source and return a structured error.
    const validation = await validateConfigSource(newSource);
    if (!validation.ok) {
      await writeFile(configPath, originalSource, "utf8").catch(() => {});
      return jsonError(400, {
        error: "invalid_config",
        details: { stage: validation.error, info: validation.details },
      });
    }

    // 6. Commit via git. We add only template.config.ts so an unrelated
    //    untracked file (e.g. an editor scratch) doesn't sneak in.
    let commitSha: string;
    try {
      await git(appDir, ["add", "--", "template.config.ts"]);
      // execFile passes each arg verbatim to git — no shell quoting needed.
      await git(appDir, ["commit", "-m", parsed.data.summary]);
      commitSha = await git(appDir, ["rev-parse", "HEAD"]);
    } catch (error) {
      // Best-effort restore; the file is already committed-or-not so this
      // mostly matters if `commit` itself succeeded but `rev-parse` failed
      // (vanishingly rare).
      await writeFile(configPath, originalSource, "utf8").catch(() => {});
      return jsonError(500, {
        error: "git_failed",
        details: error instanceof Error ? error.message : String(error),
      });
    }

    return Response.json({
      commitSha,
      filesChanged: ["template.config.ts"],
      hmrReady: true,
      snapshotUploaded: false,
    });
  })) as Response;
}
