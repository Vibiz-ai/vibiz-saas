// Sandbox v2 — runner-types smoke test.
//
// vibiz-saas does not ship vitest (the chassis stays small for the E2B
// image), so this is a runnable script. Execute via:
//   node --experimental-strip-types src/lib/runner-types.test.ts
// Exits 0 on pass, 1 on failure. Mirrors the pattern used by
// `template-config.schema.test.ts` and `runner-auth.test.ts`.
//
// Strategy: exercise each request schema with one valid payload and a
// minimum-friction invalid payload. Goal isn't exhaustive coverage — it's
// to fail loud if a schema is loosened or a discriminator is dropped.

import {
  ApplyConfigPatchRequestSchema,
  ApplyFilePatchRequestSchema,
  ApplyMultiPatchRequestSchema,
  BuildStatusEventSchema,
  ClaimRequestSchema,
  ClaimResponseSchema,
  ConfigOpSchema,
  CurrentConfigResponseSchema,
  FileReadResponseSchema,
  GitRevertRequestSchema,
  RestoreRequestSchema,
  RestoreResponseSchema,
  SnapshotRequestSchema,
} from "./runner-types.ts";

type CheckFn = () => void;
const checks: Array<{ name: string; fn: CheckFn }> = [];
function check(name: string, fn: CheckFn): void {
  checks.push({ name, fn });
}
function assert(cond: boolean, msg: string): void {
  if (!cond) throw new Error(`assertion failed: ${msg}`);
}

// --- /claim --------------------------------------------------------------

check("ClaimRequest accepts schemaVersion-only payload", () => {
  const r = ClaimRequestSchema.safeParse({ schemaVersion: 1 });
  assert(r.success, "expected parse to succeed");
});

check("ClaimRequest accepts gitRemote + branch + schemaVersion", () => {
  const r = ClaimRequestSchema.safeParse({
    gitRemote: "https://example.com/repo.git",
    branch: "main",
    schemaVersion: 1,
  });
  assert(r.success, "expected parse to succeed");
});

check("ClaimRequest rejects missing schemaVersion", () => {
  const r = ClaimRequestSchema.safeParse({ branch: "main" });
  assert(!r.success, "expected parse to fail");
});

check("ClaimRequest rejects negative schemaVersion", () => {
  const r = ClaimRequestSchema.safeParse({ schemaVersion: -1 });
  assert(!r.success, "expected parse to fail");
});

check("ClaimResponse accepts ready=true with all fields", () => {
  const r = ClaimResponseSchema.safeParse({
    ready: true,
    headSha: "abc123",
    devServerPort: 3000,
    runnerVersion: "0.1.0",
    initialized: false,
  });
  assert(r.success, "expected parse to succeed");
});

check("ClaimResponse accepts ready=true with initialized=true", () => {
  const r = ClaimResponseSchema.safeParse({
    ready: true,
    headSha: "abc123",
    devServerPort: 3000,
    runnerVersion: "0.1.0",
    initialized: true,
  });
  assert(r.success, "expected parse to succeed");
});

check("ClaimResponse accepts ready=false with not-initialized reason", () => {
  const r = ClaimResponseSchema.safeParse({
    ready: false,
    reason: "not-initialized",
  });
  assert(r.success, "expected parse to succeed");
});

check("ClaimResponse rejects ready=true missing headSha", () => {
  const r = ClaimResponseSchema.safeParse({
    ready: true,
    devServerPort: 3000,
    runnerVersion: "0.1.0",
    initialized: false,
  });
  assert(!r.success, "expected parse to fail");
});

check("ClaimResponse rejects ready=true missing initialized", () => {
  const r = ClaimResponseSchema.safeParse({
    ready: true,
    headSha: "abc123",
    devServerPort: 3000,
    runnerVersion: "0.1.0",
  });
  assert(!r.success, "expected parse to fail");
});

// --- ConfigOp ------------------------------------------------------------

check("ConfigOp accepts set with arbitrary value", () => {
  const r = ConfigOpSchema.safeParse({
    op: "set",
    path: "brand.colors.primary",
    value: "#7c3aed",
  });
  assert(r.success, "expected parse to succeed");
});

check("ConfigOp accepts append with array element value", () => {
  const r = ConfigOpSchema.safeParse({
    op: "append",
    path: "features",
    value: { icon: "zap", title: "Fast", description: "Very" },
  });
  assert(r.success, "expected parse to succeed");
});

check("ConfigOp accepts remove without value", () => {
  const r = ConfigOpSchema.safeParse({
    op: "remove",
    path: "features.0",
  });
  assert(r.success, "expected parse to succeed");
});

check("ConfigOp rejects unknown op", () => {
  const r = ConfigOpSchema.safeParse({
    op: "delete",
    path: "x",
  });
  assert(!r.success, "expected parse to fail");
});

// --- /current-config -----------------------------------------------------

check("CurrentConfigResponse accepts arbitrary config object + sha", () => {
  const r = CurrentConfigResponseSchema.safeParse({
    config: { product: { name: "Acme" }, brand: { primaryColor: "#7c3aed" } },
    sha: "deadbeef",
  });
  assert(r.success, "expected parse to succeed");
});

check("CurrentConfigResponse rejects missing sha", () => {
  const r = CurrentConfigResponseSchema.safeParse({
    config: { product: { name: "Acme" } },
  });
  assert(!r.success, "expected parse to fail");
});

// --- /apply-config-patch -------------------------------------------------

check("ApplyConfigPatchRequest accepts a non-empty op list", () => {
  const r = ApplyConfigPatchRequestSchema.safeParse({
    operations: [{ op: "set", path: "x", value: 1 }],
    summary: "tweak",
  });
  assert(r.success, "expected parse to succeed");
});

check("ApplyConfigPatchRequest rejects empty op list", () => {
  const r = ApplyConfigPatchRequestSchema.safeParse({
    operations: [],
    summary: "noop",
  });
  assert(!r.success, "expected parse to fail");
});

check("ApplyConfigPatchRequest rejects missing summary", () => {
  const r = ApplyConfigPatchRequestSchema.safeParse({
    operations: [{ op: "set", path: "x", value: 1 }],
  });
  assert(!r.success, "expected parse to fail");
});

// --- /file (GET) ---------------------------------------------------------

check("FileReadResponse accepts contents + sha", () => {
  const r = FileReadResponseSchema.safeParse({
    contents: "export const x = 1\n",
    sha: "deadbeef",
  });
  assert(r.success, "expected parse to succeed");
});

check("FileReadResponse accepts empty contents string", () => {
  const r = FileReadResponseSchema.safeParse({ contents: "", sha: "abc" });
  assert(r.success, "expected parse to succeed");
});

check("FileReadResponse rejects missing sha", () => {
  const r = FileReadResponseSchema.safeParse({ contents: "x" });
  assert(!r.success, "expected parse to fail");
});

// --- /apply-file-patch ---------------------------------------------------

check("ApplyFilePatchRequest accepts full payload", () => {
  const r = ApplyFilePatchRequestSchema.safeParse({
    filePath: "src/app/page.tsx",
    unifiedDiff: "--- a\n+++ b\n@@\n-old\n+new\n",
    summary: "rename hero",
  });
  assert(r.success, "expected parse to succeed");
});

check("ApplyFilePatchRequest rejects empty unifiedDiff", () => {
  const r = ApplyFilePatchRequestSchema.safeParse({
    filePath: "x",
    unifiedDiff: "",
    summary: "y",
  });
  assert(!r.success, "expected parse to fail");
});

// --- /apply-multi-patch --------------------------------------------------

check("ApplyMultiPatchRequest accepts multiple diff entries", () => {
  const r = ApplyMultiPatchRequestSchema.safeParse({
    diffs: [
      { path: "a.ts", diff: "..." },
      { path: "b.ts", diff: "..." },
    ],
    summary: "refactor",
  });
  assert(r.success, "expected parse to succeed");
});

check("ApplyMultiPatchRequest rejects empty diffs array", () => {
  const r = ApplyMultiPatchRequestSchema.safeParse({
    diffs: [],
    summary: "noop",
  });
  assert(!r.success, "expected parse to fail");
});

// --- /git-revert ---------------------------------------------------------

check("GitRevertRequest accepts a sha string", () => {
  const r = GitRevertRequestSchema.safeParse({ sha: "deadbeef" });
  assert(r.success, "expected parse to succeed");
});

check("GitRevertRequest rejects missing sha", () => {
  const r = GitRevertRequestSchema.safeParse({});
  assert(!r.success, "expected parse to fail");
});

// --- /snapshot -----------------------------------------------------------

check("SnapshotRequest accepts a valid https uploadUrl", () => {
  const r = SnapshotRequestSchema.safeParse({
    uploadUrl: "https://example.supabase.co/storage/v1/upload/sign/x?token=abc",
  });
  assert(r.success, "expected parse to succeed");
});

check("SnapshotRequest rejects a non-URL string", () => {
  const r = SnapshotRequestSchema.safeParse({ uploadUrl: "not-a-url" });
  assert(!r.success, "expected parse to fail");
});

// --- /restore ------------------------------------------------------------

check("RestoreRequest accepts a valid https downloadUrl", () => {
  const r = RestoreRequestSchema.safeParse({
    downloadUrl:
      "https://example.supabase.co/storage/v1/object/sign/bucket/key?token=abc",
  });
  assert(r.success, "expected parse to succeed");
});

check("RestoreResponse accepts ok=true with headSha", () => {
  const r = RestoreResponseSchema.safeParse({ ok: true, headSha: "deadbeef" });
  assert(r.success, "expected parse to succeed");
});

// --- /build-status (SSE event payload) -----------------------------------

check("BuildStatusEvent accepts not-implemented", () => {
  const r = BuildStatusEventSchema.safeParse({ status: "not-implemented" });
  assert(r.success, "expected parse to succeed");
});

check("BuildStatusEvent accepts ready with optional url", () => {
  const r = BuildStatusEventSchema.safeParse({
    status: "ready",
    url: "https://x.example.com",
  });
  assert(r.success, "expected parse to succeed");
});

check("BuildStatusEvent rejects unknown status", () => {
  const r = BuildStatusEventSchema.safeParse({ status: "spinning" });
  assert(!r.success, "expected parse to fail");
});

// --- runner --------------------------------------------------------------

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
  console.error(`\n[runner-types.test] ${failures}/${checks.length} check(s) failed`);
  process.exit(1);
}
console.log(`\n[runner-types.test] all ${checks.length} check(s) passed`);
