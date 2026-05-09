// Sandbox v2 — codegen export.
// Emits two artifacts under `dist-schema/` from the zod source of truth:
//   - template-config.schema.json  (JSON Schema 7, used by vibiz to validate
//     payloads before sending them across the runner boundary).
//   - template-config.types.d.ts   (TypeScript declarations re-exporting the
//     inferred `TemplateConfig` type, used by vibiz's `tsc --noEmit` gate).
//
// Run via `npm run schema:export` (which calls `node --experimental-strip-types`
// — node >=22 supports inline TS without a separate transformer).
//
// See vibiz/docs/sandbox-v2-types-sharing.md (decision C) for the
// generate-and-commit-with-CI-parity rationale.

import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";

import { TemplateConfigSchema } from "../src/lib/template-config.schema.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, "..");
const outDir = join(repoRoot, "dist-schema");

const HEADER = `// AUTO-GENERATED — do not edit by hand. Run \`npm run schema:export\` in vibiz-saas.\n`;

async function main(): Promise<void> {
  await mkdir(outDir, { recursive: true });

  // 1) JSON Schema (zod v4 has native toJSONSchema — no extra dep needed).
  const jsonSchema = z.toJSONSchema(TemplateConfigSchema, {
    target: "draft-7",
  });
  const jsonSchemaWithMeta = {
    $comment:
      "AUTO-GENERATED — do not edit by hand. Run `npm run schema:export` in vibiz-saas.",
    title: "TemplateConfig",
    ...jsonSchema,
  };
  await writeFile(
    join(outDir, "template-config.schema.json"),
    `${JSON.stringify(jsonSchemaWithMeta, null, 2)}\n`,
    "utf8",
  );

  // 2) TypeScript declarations. Re-export the inferred type from the source
  //    schema. The vibiz-side `tsc --noEmit` consumes this committed `.d.ts`
  //    after `pnpm sandbox:sync-types` copies it into the vibiz tree.
  //    Path is relative to dist-schema/ → ../src/lib/template-config.schema.
  const dtsBody = `${HEADER}export type { TemplateConfig } from "../src/lib/template-config.schema";\n`;
  await writeFile(join(outDir, "template-config.types.d.ts"), dtsBody, "utf8");

  console.log(`[schema:export] wrote artifacts to ${outDir}`);
}

main().catch((error: unknown) => {
  console.error(
    "[schema:export] failed:",
    error instanceof Error ? error.message : error,
  );
  process.exit(1);
});
