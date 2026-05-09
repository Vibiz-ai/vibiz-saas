// Sandbox v2 runner — POST /api/internal/runner/apply-multi-patch
//
// STUB. The real implementation (apply unified diffs to multiple files
// atomically, then commit) lands in a later step. We validate the body
// shape now so the runner client SDK can be developed against a route
// that already enforces the wire contract.

import { withRunnerAuth } from "@/lib/runner-auth";
import { ApplyMultiPatchRequestSchema } from "@/lib/runner-types";

export const runtime = "nodejs";

export async function POST(req: Request): Promise<Response> {
  return (await withRunnerAuth(req, async (auth) => {
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return Response.json(
        { error: "invalid_json" },
        { status: 400 },
      );
    }

    const parsed = ApplyMultiPatchRequestSchema.safeParse(body);
    if (!parsed.success) {
      console.log(
        `[Runner:apply-multi-patch] orgId=${auth.orgId} sandboxId=${auth.sandboxId} bad_request=${parsed.error.issues.length}`,
      );
      return Response.json(
        { error: "invalid_request" },
        { status: 400 },
      );
    }

    console.log(
      `[Runner:apply-multi-patch] orgId=${auth.orgId} sandboxId=${auth.sandboxId} files=${parsed.data.diffs.length} summary="${parsed.data.summary}"`,
    );

    return Response.json(
      {
        error: "not_implemented",
        step: "pending multi-patch executor",
      },
      { status: 501 },
    );
  })) as Response;
}
