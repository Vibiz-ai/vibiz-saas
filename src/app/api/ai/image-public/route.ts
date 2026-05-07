import { NextResponse } from "next/server";
import { isSapiomConfigured, sapiomFetch, sapiomUrl } from "@/lib/sapiom";

export const runtime = "nodejs";

const DEFAULT_MODEL = "fal-ai/flux/schnell";

export async function POST(request: Request) {
  if (!isSapiomConfigured()) {
    return NextResponse.json(
      { error: "ai_not_configured" },
      { status: 503 },
    );
  }

  let payload: Record<string, unknown>;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const model =
    typeof payload.model === "string" ? payload.model : DEFAULT_MODEL;
  if (typeof payload.prompt !== "string" || payload.prompt.length === 0) {
    return NextResponse.json({ error: "missing_prompt" }, { status: 400 });
  }

  const { model: _drop, ...forward } = payload;
  void _drop;

  const url = sapiomUrl("image", `/run/${model}`);

  const fetcher = sapiomFetch();
  try {
    const upstream = await fetcher(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(forward),
    });
    const text = await upstream.text();
    return new Response(text, {
      status: upstream.status,
      headers: {
        "content-type":
          upstream.headers.get("content-type") ?? "application/json",
        "x-debug-sapiom-url": url,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { error: "upstream_error", message, url },
      { status: 502 },
    );
  }
}
