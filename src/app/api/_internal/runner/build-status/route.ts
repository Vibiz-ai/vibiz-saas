// Sandbox v2 runner — GET /api/_internal/runner/build-status
//
// STUB. Emits a single SSE event `{ "status": "not-implemented" }` and
// closes the stream. The real implementation (live next-dev /
// type-check / build status events streamed to the orchestrator) lands
// in a later step.
//
// Shape rationale: returning a *valid* SSE stream now lets the runner
// client SDK in vibiz develop its `for await (const event of ...)`
// consumer code today. When the real status emitter ships, only the
// payload widens — the transport stays the same.

import { withRunnerAuth } from "@/lib/runner-auth";
import type { BuildStatusEvent } from "@/lib/runner-types";

export const runtime = "nodejs";

function encodeSseEvent(event: BuildStatusEvent): Uint8Array {
  // SSE framing: `data: <json>\n\n`. No `event:` field — the client keys
  // off the discriminated union in the JSON payload.
  const line = `data: ${JSON.stringify(event)}\n\n`;
  return new TextEncoder().encode(line);
}

export async function GET(req: Request): Promise<Response> {
  return (await withRunnerAuth(req, async (auth) => {
    console.log(
      `[Runner:build-status] orgId=${auth.orgId} sandboxId=${auth.sandboxId} stub=true`,
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
  })) as Response;
}
