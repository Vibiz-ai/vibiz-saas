import { NextResponse } from "next/server";
import { guardAiRequest } from "@/lib/api-guard";
import { sapiomFetch, sapiomUrl } from "@/lib/sapiom";

export const runtime = "nodejs";

const DEFAULT_MODEL = "fal-ai/flux/schnell";

export async function POST(request: Request) {
  const guard = await guardAiRequest();
  if (!guard.ok) return guard.response;

  let payload: Record<string, unknown>;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const model = typeof payload.model === "string" ? payload.model : DEFAULT_MODEL;
  if (typeof payload.prompt !== "string" || payload.prompt.length === 0) {
    return NextResponse.json({ error: "missing_prompt" }, { status: 400 });
  }

  const { model: _drop, ...forward } = payload;
  void _drop;

  const fetcher = sapiomFetch();
  const upstream = await fetcher(sapiomUrl("image", `/run/${model}`), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(forward),
  });

  const text = await upstream.text();
  return new Response(text, {
    status: upstream.status,
    headers: {
      "content-type": upstream.headers.get("content-type") ?? "application/json",
    },
  });
}
