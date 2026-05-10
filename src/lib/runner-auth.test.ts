// Sandbox v2 — Runner JWT verifier smoke test.
//
// vibiz-saas does not ship vitest (chassis stays small for the E2B image),
// so this is a runnable script. Execute via:
//   node --experimental-strip-types src/lib/runner-auth.test.ts
// Exits 0 on pass, 1 on failure. Mirror of the pattern used by
// `template-config.schema.test.ts`.
//
// Strategy:
//   - Generate a fresh ES256 keypair per run (no fixtures committed).
//   - Mint tokens inline using `jose.SignJWT` exactly the way the upstream
//     signer does in `vibiz/lib/services/sandbox/runner-jwt.ts` — same
//     header (`alg: ES256`), same payload shape (`sub`, `sandboxId`,
//     `scope: 'runner'`, `iat`, `exp`).
//   - Inject the public key into `process.env.VIBIZ_RUNNER_PUBLIC_KEY`,
//     bust the verifier's lazy cache between cases that change the key.
//   - Cover: happy path, missing header, wrong scope, wrong algorithm
//     (HS256), expired, tampered.

import { generateKeyPairSync } from "node:crypto";
import { SignJWT, importPKCS8 } from "jose";
import {
  verifyRunnerJwt,
  RunnerAuthError,
  __resetRunnerKeyCacheForTests,
} from "./runner-auth.ts";

// --- helpers ------------------------------------------------------------

type CheckFn = () => Promise<void>;
const checks: Array<{ name: string; fn: CheckFn }> = [];
function check(name: string, fn: CheckFn): void {
  checks.push({ name, fn });
}
function assert(cond: boolean, msg: string): void {
  if (!cond) throw new Error(`assertion failed: ${msg}`);
}

function makeRequest(headers: Record<string, string> = {}): Request {
  return new Request("https://chassis.local/api/internal/runner/test", {
    method: "POST",
    headers,
  });
}

function generateEs256Keys(): { privatePem: string; publicPem: string } {
  // Use node's PEM export directly — jose's exportSPKI requires extractable
  // CryptoKeys, which subtle-crypto doesn't always grant. PEM in, PEM out
  // is the simplest path and matches what the production env vars look like.
  const { privateKey, publicKey } = generateKeyPairSync("ec", {
    namedCurve: "P-256",
    publicKeyEncoding: { type: "spki", format: "pem" },
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
  });
  return { privatePem: privateKey, publicPem: publicKey };
}

// Mirrors `signRunnerJwt` from vibiz/lib/services/sandbox/runner-jwt.ts.
// Exact same header alg, exact same payload shape and claim setters.
async function signRunnerJwtLike(opts: {
  privatePem: string;
  orgId: string;
  sandboxId: string;
  ttlSeconds?: number;
  scope?: string;
  iatOffsetSeconds?: number;
}): Promise<string> {
  const {
    privatePem,
    orgId,
    sandboxId,
    ttlSeconds = 60 * 60,
    scope = "runner",
    iatOffsetSeconds = 0,
  } = opts;
  const privateKey = await importPKCS8(privatePem, "ES256");
  const iat = Math.floor(Date.now() / 1000) + iatOffsetSeconds;
  const exp = iat + ttlSeconds;
  return await new SignJWT({ sandboxId, scope })
    .setProtectedHeader({ alg: "ES256" })
    .setSubject(orgId)
    .setIssuedAt(iat)
    .setExpirationTime(exp)
    .sign(privateKey);
}

// --- generate one keypair shared across cases ---------------------------

const { privatePem, publicPem } = generateEs256Keys();
process.env.VIBIZ_RUNNER_PUBLIC_KEY = publicPem;
__resetRunnerKeyCacheForTests();

// --- cases --------------------------------------------------------------

check("valid token returns expected { orgId, sandboxId, exp }", async () => {
  const token = await signRunnerJwtLike({
    privatePem,
    orgId: "org_test_123",
    sandboxId: "sbx_test_abc",
    ttlSeconds: 600,
  });
  const result = await verifyRunnerJwt(
    makeRequest({ authorization: `Bearer ${token}` }),
  );
  assert(result.orgId === "org_test_123", `orgId mismatch: ${result.orgId}`);
  assert(
    result.sandboxId === "sbx_test_abc",
    `sandboxId mismatch: ${result.sandboxId}`,
  );
  assert(typeof result.exp === "number", "exp not a number");
  assert(result.exp > Math.floor(Date.now() / 1000), "exp not in future");
});

check("missing Authorization header throws missing_token", async () => {
  let caught: unknown;
  try {
    await verifyRunnerJwt(makeRequest());
  } catch (error) {
    caught = error;
  }
  assert(caught instanceof RunnerAuthError, "expected RunnerAuthError");
  assert(
    (caught as RunnerAuthError).code === "missing_token",
    `expected code missing_token, got ${(caught as RunnerAuthError).code}`,
  );
});

check("malformed Authorization header throws missing_token", async () => {
  let caught: unknown;
  try {
    await verifyRunnerJwt(makeRequest({ authorization: "not-a-bearer" }));
  } catch (error) {
    caught = error;
  }
  assert(caught instanceof RunnerAuthError, "expected RunnerAuthError");
  assert(
    (caught as RunnerAuthError).code === "missing_token",
    `expected code missing_token, got ${(caught as RunnerAuthError).code}`,
  );
});

check("wrong scope (admin) throws invalid_claims", async () => {
  const token = await signRunnerJwtLike({
    privatePem,
    orgId: "org_test_123",
    sandboxId: "sbx_test_abc",
    scope: "admin",
  });
  let caught: unknown;
  try {
    await verifyRunnerJwt(
      makeRequest({ authorization: `Bearer ${token}` }),
    );
  } catch (error) {
    caught = error;
  }
  assert(caught instanceof RunnerAuthError, "expected RunnerAuthError");
  assert(
    (caught as RunnerAuthError).code === "invalid_claims",
    `expected code invalid_claims, got ${(caught as RunnerAuthError).code}`,
  );
});

check("wrong algorithm (HS256) throws invalid_token", async () => {
  // Manually craft a HS256 token with the same payload shape; the verifier
  // must reject because it whitelists ES256 only.
  const hsKey = new TextEncoder().encode("a-very-long-hs256-secret-key-bytes-32+");
  const hsToken = await new SignJWT({ sandboxId: "sbx_x", scope: "runner" })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject("org_x")
    .setIssuedAt()
    .setExpirationTime(Math.floor(Date.now() / 1000) + 600)
    .sign(hsKey);
  let caught: unknown;
  try {
    await verifyRunnerJwt(
      makeRequest({ authorization: `Bearer ${hsToken}` }),
    );
  } catch (error) {
    caught = error;
  }
  assert(caught instanceof RunnerAuthError, "expected RunnerAuthError");
  assert(
    (caught as RunnerAuthError).code === "invalid_token",
    `expected code invalid_token, got ${(caught as RunnerAuthError).code}`,
  );
});

check("expired token throws expired", async () => {
  // iat = now - 7200, ttl = 3600 → exp = now - 3600 (1h in the past).
  const token = await signRunnerJwtLike({
    privatePem,
    orgId: "org_test_123",
    sandboxId: "sbx_test_abc",
    ttlSeconds: 3600,
    iatOffsetSeconds: -7200,
  });
  let caught: unknown;
  try {
    await verifyRunnerJwt(
      makeRequest({ authorization: `Bearer ${token}` }),
    );
  } catch (error) {
    caught = error;
  }
  assert(caught instanceof RunnerAuthError, "expected RunnerAuthError");
  assert(
    (caught as RunnerAuthError).code === "expired",
    `expected code expired, got ${(caught as RunnerAuthError).code}`,
  );
});

check("tampered payload throws invalid_token", async () => {
  const token = await signRunnerJwtLike({
    privatePem,
    orgId: "org_test_123",
    sandboxId: "sbx_test_abc",
    ttlSeconds: 600,
  });
  // Mutate the payload segment: keep header + signature, swap orgId.
  const [header, payload, signature] = token.split(".");
  if (!header || !payload || !signature) {
    throw new Error("token did not split into 3 segments");
  }
  const decoded = JSON.parse(
    Buffer.from(payload, "base64url").toString("utf8"),
  ) as Record<string, unknown>;
  decoded.sub = "org_attacker";
  const tampered = Buffer.from(JSON.stringify(decoded), "utf8")
    .toString("base64url");
  const tamperedToken = `${header}.${tampered}.${signature}`;

  let caught: unknown;
  try {
    await verifyRunnerJwt(
      makeRequest({ authorization: `Bearer ${tamperedToken}` }),
    );
  } catch (error) {
    caught = error;
  }
  assert(caught instanceof RunnerAuthError, "expected RunnerAuthError");
  assert(
    (caught as RunnerAuthError).code === "invalid_token",
    `expected code invalid_token, got ${(caught as RunnerAuthError).code}`,
  );
});

// --- runner -------------------------------------------------------------

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
  console.error(`\n[runner-auth.test] ${failures}/${checks.length} check(s) failed`);
  process.exit(1);
}
console.log(`\n[runner-auth.test] all ${checks.length} check(s) passed`);
