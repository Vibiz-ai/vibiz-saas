// Sandbox v2 — runner wire-contract schemas.
//
// These zod schemas are the SHARED source of truth for the request/response
// shapes accepted by `/api/internal/runner/*`. Both this chassis (the
// sandbox-side route handlers) and the vibiz-side runner client (Step 5)
// must reference these — keep this file dependency-light (zod only) so it
// can be copied/imported across the boundary without dragging Next.js
// types along.
//
// Conventions:
// - `.strict()` on every object so a stray field fails loud.
// - Operation-style payloads (config patch, multi-patch) keep their
//   discriminators as zod literals so future ops can be added safely.
// - Response schemas are exported alongside request schemas; the runner
//   client SDK in vibiz parses responses against these to harden the
//   integration.

import { z } from "zod";

// --- /claim --------------------------------------------------------------

export const ClaimRequestSchema = z
  .object({
    gitRemote: z.string().min(1).optional(),
    branch: z.string().min(1).optional(),
    schemaVersion: z.number().int().positive(),
  })
  .strict();
export type ClaimRequest = z.infer<typeof ClaimRequestSchema>;

export const ClaimResponseSchema = z.discriminatedUnion("ready", [
  z
    .object({
      ready: z.literal(true),
      headSha: z.string().min(1),
      devServerPort: z.number().int().positive(),
      runnerVersion: z.string().min(1),
      // True iff /claim performed the bootstrap `git init` + initial commit
      // on this call. False when the repo was already initialized.
      initialized: z.boolean(),
    })
    .strict(),
  z
    .object({
      ready: z.literal(false),
      reason: z.enum(["not-initialized"]),
    })
    .strict(),
]);
export type ClaimResponse = z.infer<typeof ClaimResponseSchema>;

// --- /current-config -----------------------------------------------------

// GET response shape for `/api/internal/runner/current-config`. The chassis
// reads + evaluates `template.config.ts` and returns the parsed `config`
// object plus the current git HEAD sha for caching/reproducibility. We
// keep `config` as `z.unknown()` here because the structural validation
// against `TemplateConfigSchema` is the chassis's job at write-time; the
// vibiz-side client re-validates this against the same schema after fetch.
export const CurrentConfigResponseSchema = z
  .object({
    config: z.unknown(),
    sha: z.string().min(1),
  })
  .strict();
export type CurrentConfigResponse = z.infer<typeof CurrentConfigResponseSchema>;

// --- /apply-config-patch -------------------------------------------------

export const ConfigOpSchema = z.discriminatedUnion("op", [
  z
    .object({
      op: z.literal("set"),
      path: z.string().min(1),
      value: z.unknown(),
    })
    .strict(),
  z
    .object({
      op: z.literal("append"),
      path: z.string().min(1),
      value: z.unknown(),
    })
    .strict(),
  z
    .object({
      op: z.literal("remove"),
      path: z.string().min(1),
    })
    .strict(),
]);
export type ConfigOp = z.infer<typeof ConfigOpSchema>;

export const ApplyConfigPatchRequestSchema = z
  .object({
    operations: z.array(ConfigOpSchema).min(1),
    summary: z.string().min(1),
    userPrompt: z.string().optional(),
  })
  .strict();
export type ApplyConfigPatchRequest = z.infer<
  typeof ApplyConfigPatchRequestSchema
>;

// --- /file (GET) ---------------------------------------------------------

// GET response shape for `/api/internal/runner/file?path=...`. Reads an
// arbitrary file from `RUNNER_APP_DIR` and returns its UTF-8 contents
// plus the current git HEAD sha (used by the vibiz orchestrator as
// version context for the LLM diff prompt). Path validation lives in
// the route — schema only constrains the response shape here.
export const FileReadResponseSchema = z
  .object({
    contents: z.string(),
    sha: z.string().min(1),
  })
  .strict();
export type FileReadResponse = z.infer<typeof FileReadResponseSchema>;

// --- /apply-file-patch ---------------------------------------------------

export const ApplyFilePatchRequestSchema = z
  .object({
    filePath: z.string().min(1),
    unifiedDiff: z.string().min(1),
    summary: z.string().min(1),
    userPrompt: z.string().optional(),
  })
  .strict();
export type ApplyFilePatchRequest = z.infer<
  typeof ApplyFilePatchRequestSchema
>;

// --- /apply-multi-patch --------------------------------------------------

export const MultiPatchEntrySchema = z
  .object({
    path: z.string().min(1),
    diff: z.string().min(1),
  })
  .strict();
export type MultiPatchEntry = z.infer<typeof MultiPatchEntrySchema>;

export const ApplyMultiPatchRequestSchema = z
  .object({
    diffs: z.array(MultiPatchEntrySchema).min(1),
    summary: z.string().min(1),
    userPrompt: z.string().optional(),
  })
  .strict();
export type ApplyMultiPatchRequest = z.infer<
  typeof ApplyMultiPatchRequestSchema
>;

// --- /git-revert ---------------------------------------------------------

export const GitRevertRequestSchema = z
  .object({
    sha: z.string().min(1),
  })
  .strict();
export type GitRevertRequest = z.infer<typeof GitRevertRequestSchema>;

// Success response for `git-revert`. Mirrors the success shape of
// apply-config-patch in spirit: ok flag + the new HEAD sha so the
// orchestrator can confirm the reset landed where it expected.
export const GitRevertResponseSchema = z
  .object({
    ok: z.literal(true),
    headSha: z.string().min(1),
  })
  .strict();
export type GitRevertResponse = z.infer<typeof GitRevertResponseSchema>;

// --- /snapshot -----------------------------------------------------------

// Tarball snapshot upload. The orchestrator pre-signs a Supabase Storage
// PUT URL (private bucket), the runner streams a `.tar.gz` of the workspace
// to that URL. No Supabase credentials live in the sandbox — the signed
// URL is the entire authorization.
export const SnapshotRequestSchema = z
  .object({
    uploadUrl: z.string().url(),
  })
  .strict();
export type SnapshotRequest = z.infer<typeof SnapshotRequestSchema>;

export const SnapshotResponseSchema = z
  .object({
    ok: z.literal(true),
    sizeBytes: z.number(),
  })
  .strict();
export type SnapshotResponse = z.infer<typeof SnapshotResponseSchema>;

// --- /restore ------------------------------------------------------------

// Pull a previously-uploaded snapshot back into the sandbox. The
// orchestrator pre-signs a Supabase Storage GET URL; the runner fetches
// it, extracts onto `RUNNER_APP_DIR`, and reports the restored HEAD.
export const RestoreRequestSchema = z
  .object({
    downloadUrl: z.string().url(),
  })
  .strict();
export type RestoreRequest = z.infer<typeof RestoreRequestSchema>;

export const RestoreResponseSchema = z
  .object({
    ok: z.literal(true),
    headSha: z.string(),
  })
  .strict();
export type RestoreResponse = z.infer<typeof RestoreResponseSchema>;

// --- /build-status (SSE) -------------------------------------------------

// SSE event payload shape. The route streams JSON objects matching this
// schema, one per `data:` line. Currently only `not-implemented` ships;
// future statuses (`building`, `ready`, `error`) will extend the union.
export const BuildStatusEventSchema = z.discriminatedUnion("status", [
  z.object({ status: z.literal("not-implemented") }).strict(),
  z.object({ status: z.literal("building") }).strict(),
  z
    .object({
      status: z.literal("ready"),
      url: z.string().url().optional(),
    })
    .strict(),
  z
    .object({
      status: z.literal("error"),
      message: z.string().min(1),
    })
    .strict(),
]);
export type BuildStatusEvent = z.infer<typeof BuildStatusEventSchema>;

// Poll-style snapshot returned by `GET /build-status` when the client
// sends `Accept: application/json` (the orchestrator's verify-or-revert
// loop uses this — SSE is unsuitable for short bounded polls because it
// streams an unknown number of events and never closes until the build
// resolves).
//
// Shape MUST stay in sync with `BuildStatusPollResponseSchema` in
// `vibiz/lib/services/sandbox/runner-client.ts` — that schema is
// `.strict()` so we cannot add extra fields without breaking the
// orchestrator's parse. `not-implemented` is the wire signal the
// orchestrator's verify treats as a soft-pass (no real build state
// available); we emit it whenever the chassis can't determine actual
// build state.
export const BuildStatusJsonResponseSchema = z.discriminatedUnion("status", [
  z.object({ status: z.literal("compiling") }).strict(),
  z.object({ status: z.literal("ok") }).strict(),
  z
    .object({
      status: z.literal("failed"),
      error: z.string().min(1),
    })
    .strict(),
  z.object({ status: z.literal("not-implemented") }).strict(),
]);
export type BuildStatusJsonResponse = z.infer<
  typeof BuildStatusJsonResponseSchema
>;

// --- shared error envelope -----------------------------------------------

// Most endpoints return `{ error: string }` on failure. Documented here so
// the client can parse it uniformly. `step` is included for stub responses
// to point at the milestone that will fill them in.
export const RunnerErrorResponseSchema = z
  .object({
    error: z.string().min(1),
    step: z.string().optional(),
  })
  .strict();
export type RunnerErrorResponse = z.infer<typeof RunnerErrorResponseSchema>;
