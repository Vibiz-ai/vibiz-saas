// Sandbox v2 — Runner JWT verifier.
//
// Mirrors the signer in `vibiz/lib/services/sandbox/runner-jwt.ts`.
// The vibiz orchestrator mints short-lived ES256 tokens; every call to
// `/api/_internal/runner/*` in this chassis MUST verify them via this module.
//
// Algorithm is whitelisted to ['ES256'] to defeat algorithm-confusion
// attacks. The public key (PEM SPKI) is read from VIBIZ_RUNNER_PUBLIC_KEY
// lazily — module load doesn't crash if the env is missing; the throw
// happens at call time per `.claude/rules/typescript-quality.md`.

import { importSPKI, jwtVerify, type KeyObject, errors as joseErrors } from "jose";

const ALG = "ES256";
const SCOPE: RunnerJwtScope = "runner";

export type RunnerJwtScope = "runner";

export type RunnerAuthErrorCode =
  | "missing_token"
  | "invalid_token"
  | "expired"
  | "invalid_claims"
  | "config_missing";

export class RunnerAuthError extends Error {
  readonly code: RunnerAuthErrorCode;
  constructor(code: RunnerAuthErrorCode, message?: string) {
    super(message ?? code);
    this.name = "RunnerAuthError";
    this.code = code;
  }
}

export interface RunnerAuthContext {
  orgId: string;
  sandboxId: string;
  exp: number;
}

// Lazy public-key cache. Module load must not fail when the env is
// unset (e.g. during `next build` in environments without runner secrets).
let cachedPublicKey: CryptoKey | KeyObject | null = null;
let cachedPemFingerprint: string | null = null;

async function getPublicKey(): Promise<CryptoKey | KeyObject> {
  const pem = process.env.VIBIZ_RUNNER_PUBLIC_KEY;
  if (!pem) {
    throw new RunnerAuthError(
      "config_missing",
      "VIBIZ_RUNNER_PUBLIC_KEY is required",
    );
  }
  // Refresh if the env value changed (e.g. test injection between calls).
  if (cachedPublicKey && cachedPemFingerprint === pem) {
    return cachedPublicKey;
  }
  const key = await importSPKI(pem, ALG);
  cachedPublicKey = key;
  cachedPemFingerprint = pem;
  return key;
}

function extractBearerToken(req: Request): string {
  const header = req.headers.get("authorization") ?? req.headers.get("Authorization");
  if (!header) {
    throw new RunnerAuthError("missing_token", "Authorization header missing");
  }
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  if (!match || !match[1]) {
    throw new RunnerAuthError("missing_token", "Authorization header malformed");
  }
  return match[1].trim();
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export async function verifyRunnerJwt(req: Request): Promise<RunnerAuthContext> {
  const token = extractBearerToken(req);
  const publicKey = await getPublicKey();

  let payload: Record<string, unknown>;
  try {
    const result = await jwtVerify(token, publicKey, {
      algorithms: [ALG],
    });
    payload = result.payload as Record<string, unknown>;
  } catch (error) {
    if (error instanceof joseErrors.JWTExpired) {
      throw new RunnerAuthError("expired", "Token expired");
    }
    // Anything else from jose (signature, alg, decode, claim type) is
    // bucketed as invalid_token. We never leak internal error messages.
    if (
      error instanceof joseErrors.JOSEError ||
      error instanceof joseErrors.JWTInvalid ||
      error instanceof joseErrors.JWSInvalid ||
      error instanceof joseErrors.JWSSignatureVerificationFailed ||
      error instanceof joseErrors.JOSEAlgNotAllowed
    ) {
      throw new RunnerAuthError("invalid_token", "Token verification failed");
    }
    throw new RunnerAuthError("invalid_token", "Token verification failed");
  }

  if (!isPlainObject(payload)) {
    throw new RunnerAuthError("invalid_claims", "Payload is not an object");
  }

  const { sub, sandboxId, scope, exp } = payload as {
    sub?: unknown;
    sandboxId?: unknown;
    scope?: unknown;
    exp?: unknown;
  };

  if (typeof sub !== "string" || sub.length === 0) {
    throw new RunnerAuthError("invalid_claims", "sub (orgId) missing");
  }
  if (typeof sandboxId !== "string" || sandboxId.length === 0) {
    throw new RunnerAuthError("invalid_claims", "sandboxId missing");
  }
  if (scope !== SCOPE) {
    throw new RunnerAuthError("invalid_claims", "scope must be 'runner'");
  }
  if (typeof exp !== "number" || !Number.isFinite(exp)) {
    throw new RunnerAuthError("invalid_claims", "exp missing or invalid");
  }

  return { orgId: sub, sandboxId, exp };
}

/**
 * Convenience wrapper for route handlers. Catches RunnerAuthError and
 * returns a 401 JSON response; lets unrelated throws bubble (caller's
 * generic 500 handler should catch them).
 *
 * Usage:
 *   export async function POST(req: Request) {
 *     return withRunnerAuth(req, async (auth) => {
 *       // auth.orgId, auth.sandboxId, auth.exp
 *       return Response.json({ ok: true });
 *     });
 *   }
 */
export async function withRunnerAuth<T>(
  req: Request,
  handler: (auth: RunnerAuthContext) => Promise<T>,
): Promise<Response | T> {
  let auth: RunnerAuthContext;
  try {
    auth = await verifyRunnerJwt(req);
  } catch (error) {
    if (error instanceof RunnerAuthError) {
      const status = error.code === "config_missing" ? 500 : 401;
      return Response.json({ error: error.code }, { status });
    }
    throw error;
  }
  return handler(auth);
}

// Test-only: clear the cached key so unit tests can swap the env between
// cases. Not exported through any barrel; importers must reach into this
// file directly. Safe to call in production but no-op there.
export function __resetRunnerKeyCacheForTests(): void {
  cachedPublicKey = null;
  cachedPemFingerprint = null;
}
