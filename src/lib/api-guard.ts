import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "./auth";
import { isSapiomConfigured } from "./sapiom";

type GuardOk = { ok: true; userId: string };
type GuardFail = { ok: false; response: NextResponse };
export type GuardResult = GuardOk | GuardFail;

export async function guardAiRequest(): Promise<GuardResult> {
  if (!isSapiomConfigured()) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "ai_not_configured", message: "SAPIOM_API_KEY missing on server" },
        { status: 503 },
      ),
    };
  }

  if (!auth) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "auth_disabled", message: "TURSO_DATABASE_URL not set — auth required for AI" },
        { status: 503 },
      ),
    };
  }

  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user?.id) {
    return {
      ok: false,
      response: NextResponse.json({ error: "unauthorized" }, { status: 401 }),
    };
  }

  return { ok: true, userId: session.user.id };
}
