// Sandbox v2 — schema parity smoke test.
//
// Vitest is not configured in vibiz-saas (the chassis ships without test
// tooling to keep the E2B image small), so this file is written as a
// runnable script. Execute via:
//   node --experimental-strip-types src/lib/template-config.schema.test.ts
// It exits 0 on pass, 1 on failure. Wire it into `npm test` later when
// vitest lands.
//
// What we assert (3 cases):
//   1. The runtime `template.config.ts` object parses cleanly as-is. The
//      chassis now ships `schemaVersion: 1` natively, so no injection is
//      needed; this is the chassis-runner contract.
//   2. Removing a required field (`hero.headline`) throws. Guards against
//      accidental loosening to `.optional()` during refactors.
//   3. An unknown root key is rejected. Guards against `.strict()` being
//      replaced with `.passthrough()` / `.loose()` somewhere.

import { config } from "../../template.config.ts";
import { TemplateConfigSchema } from "./template-config.schema.ts";

type CheckFn = () => void;

const checks: Array<{ name: string; fn: CheckFn }> = [];
function check(name: string, fn: CheckFn): void {
  checks.push({ name, fn });
}
function assert(cond: boolean, msg: string): void {
  if (!cond) throw new Error(`assertion failed: ${msg}`);
}

// --- 1. Existing chassis config parses as-is (no injection) -------------
check("existing template.config.ts parses cleanly", () => {
  // The runtime config is `as const` so the auth.providers field comes back
  // as `readonly ["email-password"]`. We deep-clone via JSON to drop the
  // readonly markers for the parser — equivalent to what the runner does
  // when it serializes the patch payload over JSON.
  const cloned = JSON.parse(JSON.stringify(config)) as Record<string, unknown>;
  const result = TemplateConfigSchema.safeParse(cloned);
  if (!result.success) {
    console.error(
      "[schema-test] parse error:",
      JSON.stringify(result.error.issues, null, 2),
    );
  }
  assert(result.success, "TemplateConfigSchema should accept the runtime config");
});

// --- 2. Removing a required field fails ---------------------------------
check("removing hero.headline causes parse to throw", () => {
  const cloned = JSON.parse(JSON.stringify(config)) as {
    hero: Record<string, unknown>;
    [k: string]: unknown;
  };
  delete cloned.hero.headline;
  const result = TemplateConfigSchema.safeParse(cloned);
  assert(
    !result.success,
    "expected parse to fail when hero.headline is missing",
  );
});

// --- 3. Unknown root key fails (.strict() guard) ------------------------
check("unknown root key is rejected by .strict()", () => {
  const cloned = JSON.parse(JSON.stringify(config)) as Record<string, unknown>;
  const withGarbage = { ...cloned, wat: "huh" };
  const result = TemplateConfigSchema.safeParse(withGarbage);
  assert(
    !result.success,
    "expected parse to fail on unknown root key (root .strict())",
  );
});

let failures = 0;
for (const { name, fn } of checks) {
  try {
    fn();
    console.log(`  ok  ${name}`);
  } catch (error) {
    failures += 1;
    console.error(
      `  FAIL  ${name}:`,
      error instanceof Error ? error.message : error,
    );
  }
}

if (failures > 0) {
  console.error(`\n[schema-test] ${failures}/${checks.length} check(s) failed`);
  process.exit(1);
}
console.log(`\n[schema-test] all ${checks.length} check(s) passed`);
