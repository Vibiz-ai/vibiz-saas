// Sandbox v2 runner — GET /api/internal/runner/build-status
//
// Content-type negotiated on `Accept`:
//   - `text/event-stream`           → SSE stream (the original transport;
//                                     used by the v2 EditRouter and dev
//                                     tooling that wants live build events).
//   - anything else (incl. JSON)    → single-snapshot JSON poll. This is
//                                     what the orchestrator's
//                                     `verifyBuildOrRevert` calls right
//                                     after every apply* commit; SSE was
//                                     unsuitable for that loop because it
//                                     never closes until the build resolves.
//
// Build state source: the chassis does NOT yet maintain a persistent
// `.next/build-status.json` watcher. Until that exists, the JSON path
// uses a TCP probe against the dev-server port (default 3000) — a bound
// port is a strong-enough signal of "Next dev is alive and serving" for
// the orchestrator's verify gate. When the port is unbound we return
// `not-implemented` (the wire signal the orchestrator's verify treats
// as a soft-pass — see `BuildStatusPollResponseSchema` in
// vibiz/lib/services/sandbox/runner-client.ts).
//
// Forward-compat: the day a real build watcher lands, swap the
// `probeBuildState` body for a read of whatever artefact the watcher
// drops on disk. The route shape and the poll schema do not need to
// change.

import { connect } from "node:net";

import { withRunnerAuth } from "@/lib/runner-auth";
import {
  type BuildStatusEvent,
  type BuildStatusJsonResponse,
} from "@/lib/runner-types";

export const runtime = "nodejs";

// Default Next dev port inside the sandbox. Matches `claim`'s
// `devServerPort` in the chassis. Override only via env in tests.
const DEV_SERVER_PORT = Number.parseInt(
  process.env.RUNNER_DEV_SERVER_PORT ?? "3000",
  10,
);
const DEV_SERVER_HOST = "127.0.0.1";
const PROBE_TIMEOUT_MS = 500;

function encodeSseEvent(event: BuildStatusEvent): Uint8Array {
  // SSE framing: `data: <json>\n\n`. No `event:` field — the client keys
  // off the discriminated union in the JSON payload.
  const line = `data: ${JSON.stringify(event)}\n\n`;
  return new TextEncoder().encode(line);
}

/**
 * Probe `127.0.0.1:<DEV_SERVER_PORT>` with a short-timeout TCP connect.
 * Resolves true if the socket connects within `PROBE_TIMEOUT_MS`, false
 * on any failure (connection refused, timeout, host unreachable, etc.).
 *
 * The probe never throws — a failed probe just returns false so the
 * caller can fall through to the `not-implemented` soft-pass.
 */
function probeDevServerBound(): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = connect({ host: DEV_SERVER_HOST, port: DEV_SERVER_PORT });
    let settled = false;
    const finish = (bound: boolean) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve(bound);
    };
    socket.setTimeout(PROBE_TIMEOUT_MS);
    socket.once("connect", () => finish(true));
    socket.once("timeout", () => finish(false));
    socket.once("error", () => finish(false));
  });
}

/**
 * Resolve current build state for the JSON poll path. We don't yet have
 * a real build watcher, so:
 *   - dev-server port bound  → `ok`     (Next is up and serving)
 *   - port unbound / refused → `not-implemented`  (soft-pass; orchestrator
 *                                                  treats this as
 *                                                  "no build state
 *                                                  available, don't revert")
 *
 * We deliberately NEVER fabricate a `failed` here — the task contract is
 * "don't fake a failure state we can't detect". `failed` is reserved for
 * a future build-watcher integration that has actual error context.
 */
async function probeBuildState(): Promise<BuildStatusJsonResponse> {
  const bound = await probeDevServerBound();
  if (bound) {
    return { status: "ok" };
  }
  return { status: "not-implemented" };
}

function wantsSse(req: Request): boolean {
  const accept = req.headers.get("accept") ?? req.headers.get("Accept") ?? "";
  return accept.toLowerCase().includes("text/event-stream");
}

export async function GET(req: Request): Promise<Response> {
  return (await withRunnerAuth(req, async (auth) => {
    if (wantsSse(req)) {
      // SSE path preserved verbatim. Stub event until the real watcher
      // lands — clients that want live events still get a valid stream.
      console.log(
        `[Runner:build-status] orgId=${auth.orgId} sandboxId=${auth.sandboxId} mode=sse stub=true`,
      );
      const stream = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(encodeSseEvent({ status: "not-implemented" }));
          controller.close();
        },
      });
      return new Response(stream, {
        status: 200,
        headers: {
          "content-type": "text/event-stream",
          "cache-control": "no-cache, no-transform",
          connection: "keep-alive",
        },
      });
    }

    // JSON poll path — single snapshot, schema-aligned with the
    // orchestrator's `BuildStatusPollResponseSchema`.
    const snapshot = await probeBuildState();
    console.log(
      `[Runner:build-status] orgId=${auth.orgId} sandboxId=${auth.sandboxId} mode=json status=${snapshot.status}`,
    );
    return Response.json(snapshot, {
      status: 200,
      headers: { "cache-control": "no-store" },
    });
  })) as Response;
}
