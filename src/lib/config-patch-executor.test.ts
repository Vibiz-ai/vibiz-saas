// Sandbox v2 — config-patch-executor smoke test.
//
// Vitest is not configured in vibiz-saas (the chassis stays small for the
// E2B image). Run via:
//   node --experimental-strip-types src/lib/config-patch-executor.test.ts
// Exits 0 on pass, 1 on failure.
//
// Coverage:
//   1. set scalar (brand.colors.primary).
//   2. set nested object (replace hero.cta).
//   3. set array element (features[1].title).
//   4. append (features[]).
//   5. remove (testimonials[2]).
//   6. set on non-existent key throws.
//   7. multi-op transaction: 3 ops applied sequentially, intermediate state correct.
//   8. output is parseable by ts-morph (no syntax errors after applyConfigOps).
//   9. output round-trips through TemplateConfigSchema after dynamic import.

import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { Project } from "ts-morph";

import {
  applyConfigOps,
  ConfigPatchError,
} from "./config-patch-executor.ts";
import type { ConfigOp } from "./runner-types.ts";
import { TemplateConfigSchema } from "./template-config.schema.ts";

const here = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(here, "..", "..");
const TEMPLATE_CONFIG_PATH = path.join(REPO_ROOT, "template.config.ts");

type CheckFn = () => Promise<void> | void;
const checks: Array<{ name: string; fn: CheckFn }> = [];
function check(name: string, fn: CheckFn): void {
  checks.push({ name, fn });
}
function assert(cond: boolean, msg: string): void {
  if (!cond) throw new Error(`assertion failed: ${msg}`);
}

async function loadTemplateSource(): Promise<string> {
  return readFile(TEMPLATE_CONFIG_PATH, "utf8");
}

/**
 * Write the given TS source to a temp file, dynamic-import it, return its
 * `config` export. Used by tests that want to verify post-patch values.
 */
async function importConfig(source: string): Promise<unknown> {
  const dir = await mkdtemp(path.join(tmpdir(), "vibiz-test-"));
  const filePath = path.join(dir, `cfg-${Date.now()}-${Math.random().toString(36).slice(2)}.ts`);
  try {
    await writeFile(filePath, source, "utf8");
    const mod = (await import(pathToFileURL(filePath).href)) as { config: unknown };
    return mod.config;
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

// --- 1. set scalar -------------------------------------------------------

check("set scalar: brand.colors.primary -> #ff0000", async () => {
  const source = await loadTemplateSource();
  const ops: ConfigOp[] = [
    { op: "set", path: "brand.colors.primary", value: "#ff0000" },
  ];
  const result = await applyConfigOps(source, ops);
  const cfg = (await importConfig(result.newSourceText)) as {
    brand: { colors: { primary: string } };
  };
  assert(
    cfg.brand.colors.primary === "#ff0000",
    `expected primary=#ff0000, got ${cfg.brand.colors.primary}`,
  );
});

// --- 2. set nested object ------------------------------------------------

check("set nested object: replace hero.cta entirely", async () => {
  const source = await loadTemplateSource();
  const ops: ConfigOp[] = [
    {
      op: "set",
      path: "hero.cta",
      value: { text: "Get the Demo", href: "/demo" },
    },
  ];
  const result = await applyConfigOps(source, ops);
  const cfg = (await importConfig(result.newSourceText)) as {
    hero: { cta: { text: string; href: string } };
  };
  assert(
    cfg.hero.cta.text === "Get the Demo" && cfg.hero.cta.href === "/demo",
    `unexpected hero.cta = ${JSON.stringify(cfg.hero.cta)}`,
  );
});

// --- 3. set array element field ------------------------------------------

check("set array element field: features[1].title -> Bulletproof", async () => {
  const source = await loadTemplateSource();
  const ops: ConfigOp[] = [
    { op: "set", path: "features[1].title", value: "Bulletproof" },
  ];
  const result = await applyConfigOps(source, ops);
  const cfg = (await importConfig(result.newSourceText)) as {
    features: Array<{ title: string }>;
  };
  assert(
    cfg.features[1]?.title === "Bulletproof",
    `expected features[1].title=Bulletproof, got ${cfg.features[1]?.title}`,
  );
});

// --- 4. append -----------------------------------------------------------

check("append: new feature added to features[]", async () => {
  const source = await loadTemplateSource();
  const before = (await importConfig(source)) as {
    features: Array<{ title: string }>;
  };
  const beforeLen = before.features.length;

  const ops: ConfigOp[] = [
    {
      op: "append",
      path: "features[]",
      value: {
        icon: "rocket",
        title: "Ship Faster",
        description: "Cut release cycles in half.",
      },
    },
  ];
  const result = await applyConfigOps(source, ops);
  const cfg = (await importConfig(result.newSourceText)) as {
    features: Array<{ icon: string; title: string; description: string }>;
  };
  assert(
    cfg.features.length === beforeLen + 1,
    `expected features.length=${beforeLen + 1}, got ${cfg.features.length}`,
  );
  assert(
    cfg.features[cfg.features.length - 1]?.title === "Ship Faster",
    "expected last feature title 'Ship Faster'",
  );
});

// --- 4b. append (no-bracket key) ----------------------------------------

check("append: features (no brackets) also targets the array", async () => {
  const source = await loadTemplateSource();
  const ops: ConfigOp[] = [
    {
      op: "append",
      path: "features",
      value: { icon: "wand", title: "Magic", description: "Pulled from a hat." },
    },
  ];
  const result = await applyConfigOps(source, ops);
  const cfg = (await importConfig(result.newSourceText)) as {
    features: Array<{ title: string }>;
  };
  assert(
    cfg.features[cfg.features.length - 1]?.title === "Magic",
    "expected appended feature 'Magic' at end",
  );
});

// --- 5. remove -----------------------------------------------------------

check("remove: testimonials[2] is dropped", async () => {
  const source = await loadTemplateSource();
  const before = (await importConfig(source)) as {
    testimonials: Array<{ name: string }>;
  };
  const beforeLen = before.testimonials.length;
  const namesBefore = before.testimonials.map((t) => t.name);

  const ops: ConfigOp[] = [{ op: "remove", path: "testimonials[2]" }];
  const result = await applyConfigOps(source, ops);
  const cfg = (await importConfig(result.newSourceText)) as {
    testimonials: Array<{ name: string }>;
  };
  assert(
    cfg.testimonials.length === beforeLen - 1,
    `expected testimonials.length=${beforeLen - 1}, got ${cfg.testimonials.length}`,
  );
  // Element at index 2 should now be missing; the previous index-2 name
  // should not appear in the post-patch list.
  const removedName = namesBefore[2]!;
  assert(
    !cfg.testimonials.some((t) => t.name === removedName),
    `expected '${removedName}' to be removed`,
  );
});

// --- 6. set on non-existent key throws ----------------------------------

check("set on non-existent key throws ConfigPatchError(path_not_found)", async () => {
  const source = await loadTemplateSource();
  let threw: ConfigPatchError | null = null;
  try {
    await applyConfigOps(source, [
      { op: "set", path: "brand.colors.unicorn", value: "#abcabc" },
    ]);
  } catch (error) {
    if (error instanceof ConfigPatchError) threw = error;
    else throw error;
  }
  assert(threw !== null, "expected ConfigPatchError to be thrown");
  assert(
    threw!.code === "path_not_found",
    `expected code=path_not_found, got ${threw!.code}`,
  );
});

// --- 7. multi-op transaction --------------------------------------------

check("multi-op: 3 ops applied in sequence, intermediate state correct", async () => {
  const source = await loadTemplateSource();
  const ops: ConfigOp[] = [
    // 1. mutate primary color
    { op: "set", path: "brand.colors.primary", value: "#0033ff" },
    // 2. append a feature
    {
      op: "append",
      path: "features[]",
      value: { icon: "key", title: "Secure", description: "End-to-end encrypted." },
    },
    // 3. mutate the title of the JUST-APPENDED feature; index depends on
    //    intermediate state so this only works if append committed before
    //    set runs.
    { op: "set", path: "features[6].title", value: "Hardened" },
  ];
  const result = await applyConfigOps(source, ops);
  const cfg = (await importConfig(result.newSourceText)) as {
    brand: { colors: { primary: string } };
    features: Array<{ title: string }>;
  };
  assert(
    cfg.brand.colors.primary === "#0033ff",
    `primary mutation lost: ${cfg.brand.colors.primary}`,
  );
  assert(
    cfg.features[6]?.title === "Hardened",
    `expected features[6].title=Hardened, got ${cfg.features[6]?.title}`,
  );
});

// --- 8. output parseable by ts-morph ------------------------------------

check("output is parseable by ts-morph (no syntax errors)", async () => {
  const source = await loadTemplateSource();
  const result = await applyConfigOps(source, [
    { op: "set", path: "product.tagline", value: "Tagline w/ \"quotes\" & symbols" },
    { op: "set", path: "footer.copyright", value: "2026 Foo. All rights reserved." },
  ]);
  const project = new Project({
    useInMemoryFileSystem: true,
    skipAddingFilesFromTsConfig: true,
  });
  const sf = project.createSourceFile("verify.ts", result.newSourceText);
  const diags = sf
    .getPreEmitDiagnostics()
    .filter((d) => d.getCategory() === 1 && d.getCode() >= 1000 && d.getCode() < 1500);
  assert(
    diags.length === 0,
    `expected no syntax diagnostics, got ${diags.length}`,
  );
});

// --- 9. output passes TemplateConfigSchema after dynamic import ---------

check("output round-trips through TemplateConfigSchema after dynamic import", async () => {
  const source = await loadTemplateSource();
  const result = await applyConfigOps(source, [
    { op: "set", path: "brand.colors.primary", value: "#aa00ff" },
    {
      op: "append",
      path: "faq[]",
      value: {
        question: "Does it scale?",
        answer: "Yes — horizontally, on demand.",
      },
    },
  ]);
  const cfg = await importConfig(result.newSourceText);
  const cloned = JSON.parse(JSON.stringify(cfg)) as Record<string, unknown>;
  const withVersion = { schemaVersion: 1, ...cloned };
  const parsed = TemplateConfigSchema.safeParse(withVersion);
  if (!parsed.success) {
    console.error(
      "[config-patch-executor.test] schema parse failed:",
      JSON.stringify(parsed.error.issues, null, 2),
    );
  }
  assert(parsed.success, "expected TemplateConfigSchema parse to succeed");
});

// --- runner --------------------------------------------------------------

let failures = 0;
for (const { name, fn } of checks) {
  try {
    await fn();
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
  console.error(
    `\n[config-patch-executor.test] ${failures}/${checks.length} check(s) failed`,
  );
  process.exit(1);
}
console.log(
  `\n[config-patch-executor.test] all ${checks.length} check(s) passed`,
);
