// Sandbox v2 — runner wire-contract schemas.
//
// These zod schemas are the SHARED source of truth for the request/response
// shapes accepted by `/api/_internal/runner/*`. Both this chassis (the
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
