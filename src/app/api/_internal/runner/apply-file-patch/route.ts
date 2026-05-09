// Sandbox v2 runner — POST /api/_internal/runner/apply-file-patch
//
// STUB. The real implementation (apply a unified diff to a single file
// within `/home/user/app`, then commit) lands in a later step. We validate
// the body shape now so the runner client SDK can be developed against a
// route that already enforces the wire contract.

import { withRunnerAuth } from "@/lib/runner-auth";
import { ApplyFilePatchRequestSchema } from "@/lib/runner-types";

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

    const parsed = ApplyFilePatchRequestSchema.safeParse(body);
    if (!parsed.success) {
      console.log(
        `[Runner:apply-file-patch] orgId=${auth.orgId} sandboxId=${auth.sandboxId} bad_request=${parsed.error.issues.length}`,
      );
      return Response.json(
        { error: "invalid_request" },
        { status: 400 },
      );
    }

    console.log(
      `[Runner:apply-file-patch] orgId=${auth.orgId} sandboxId=${auth.sandboxId} filePath=${parsed.data.filePath} summary="${parsed.data.summary}"`,
    );

    return Response.json(
      {
        error: "not_implemented",
        step: "pending file-patch executor",
      },
      { status: 501 },
    );
  })) as Response;
}
