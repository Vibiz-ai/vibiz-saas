// Sandbox v2 runner — GET /api/internal/runner/current-config
//
// Reads the live `<APP_DIR>/template.config.ts` from disk, evaluates it
// in a Node subprocess (mirrors the validator in apply-config-patch), and
// returns `{ config, sha }`. The vibiz orchestrator calls this right
// before generating ConfigOps so the LLM has the actual current state of
// the config — colors, copy, hero, etc. — instead of guessing from the
// schema description.
//
// Why a subprocess (`execFile node --experimental-strip-types`) and not
// a bare `await import(url)`: the route handler is bundled by Next.js
// and a dynamic import of an arbitrary file:// URL becomes a
// critical-dependency expression that breaks at runtime in the bundled
// output. Spawning fresh node side-steps the bundler entirely and lets
// node's strip-types loader handle the .ts file directly. Same pattern
// as `validateConfigSource` in `apply-config-patch/route.ts`.
//
// Errors:
//   - 500 config_missing  — template.config.ts not present / unreadable
//   - 500 config_invalid  — subprocess eval failed (with stderr details)
//   - 500 git_failed      — `git rev-parse HEAD` failed

import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";

import { withRunnerAuth } from "@/lib/runner-auth";
import type { CurrentConfigResponse } from "@/lib/runner-types";

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

async function git(cwd: string, args: string[]): Promise<string> {
  const { stdout } = await execFileAsync("git", args, {
    cwd,
    env: process.env,
  });
  return stdout.trim();
}

/**
 * Evaluate the source by writing it to a temp file and importing it in a
 * fresh node process. Returns the parsed `config` export as `unknown` so
 * the vibiz-side runner client can re-validate against the canonical
 * TemplateConfigSchema (same shape lives in `template-config.schema.ts`).
 */
async function evalConfigSource(sourceText: string): Promise<
  | { ok: true; value: unknown }
  | { ok: false; details: string }
> {
  const dir = await mkdtemp(path.join(tmpdir(), "vibiz-current-config-"));
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
      const result = await execFileAsync(
        process.execPath,
        ["--experimental-strip-types", "--input-type=module", "-e", evalScript],
        { env: process.env, maxBuffer: 8 * 1024 * 1024 },
      );
      stdout = result.stdout;
    } catch (error) {
      const err = error as { stderr?: string; message?: string };
      return {
        ok: false,
        details: err.stderr ?? err.message ?? String(error),
      };
    }

    let parsedJson: unknown;
    try {
      parsedJson = JSON.parse(stdout);
    } catch (error) {
      return {
        ok: false,
        details: `subprocess stdout was not JSON: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
    return { ok: true, value: parsedJson };
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

export async function GET(req: Request): Promise<Response> {
  return (await withRunnerAuth(req, async (auth) => {
    const appDir = getAppDir();
    const configPath = path.join(appDir, "template.config.ts");

    let sourceText: string;
    try {
      sourceText = await readFile(configPath, "utf8");
    } catch (error) {
      console.log(
        `[Runner:current-config] orgId=${auth.orgId} sandboxId=${auth.sandboxId} read_failed=${error instanceof Error ? error.message : String(error)}`,
      );
      return jsonError(500, { error: "config_missing" });
    }

    const evalResult = await evalConfigSource(sourceText);
    if (!evalResult.ok) {
      console.log(
        `[Runner:current-config] orgId=${auth.orgId} sandboxId=${auth.sandboxId} eval_failed`,
      );
      return jsonError(500, {
        error: "config_invalid",
        details: evalResult.details,
      });
    }

    let sha: string;
    try {
      sha = await git(appDir, ["rev-parse", "HEAD"]);
    } catch (error) {
      console.log(
        `[Runner:current-config] orgId=${auth.orgId} sandboxId=${auth.sandboxId} git_failed=${error instanceof Error ? error.message : String(error)}`,
      );
      return jsonError(500, {
        error: "git_failed",
        details: error instanceof Error ? error.message : String(error),
      });
    }

    console.log(
      `[Runner:current-config] orgId=${auth.orgId} sandboxId=${auth.sandboxId} sha=${sha.slice(0, 12)}`,
    );
    const response: CurrentConfigResponse = {
      config: evalResult.value,
      sha,
    };
    return Response.json(response);
  })) as Response;
}
