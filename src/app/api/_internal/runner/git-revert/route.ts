// Sandbox v2 runner — POST /api/_internal/runner/git-revert
//
// STUB. The real implementation (`git revert <sha> --no-edit` inside
// `/home/user/app`) lands in a later step. We validate the body shape
// now so the runner client SDK can be developed against a route that
// already enforces the wire contract.

import { withRunnerAuth } from "@/lib/runner-auth";
import { GitRevertRequestSchema } from "@/lib/runner-types";

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

    const parsed = GitRevertRequestSchema.safeParse(body);
    if (!parsed.success) {
      console.log(
        `[Runner:git-revert] orgId=${auth.orgId} sandboxId=${auth.sandboxId} bad_request=${parsed.error.issues.length}`,
      );
      return Response.json(
        { error: "invalid_request" },
        { status: 400 },
      );
    }

    console.log(
      `[Runner:git-revert] orgId=${auth.orgId} sandboxId=${auth.sandboxId} sha=${parsed.data.sha}`,
    );

    return Response.json(
      {
        error: "not_implemented",
        step: "pending git-revert executor",
      },
      { status: 501 },
    );
  })) as Response;
}
