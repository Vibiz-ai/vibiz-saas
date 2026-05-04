import { NextResponse } from "next/server";
import { guardAiRequest } from "@/lib/api-guard";
import { sapiomFetch, sapiomUrl } from "@/lib/sapiom";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const guard = await guardAiRequest();
  if (!guard.ok) return guard.response;

  let payload: Record<string, unknown>;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  if (typeof payload.q !== "string" || payload.q.length === 0) {
    return NextResponse.json({ error: "missing_q" }, { status: 400 });
  }

  const fetcher = sapiomFetch();
  const upstream = await fetcher(sapiomUrl("search", "/search"), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      depth: "standard",
      outputType: "sourcedAnswer",
      ...payload,
    }),
  });

  const text = await upstream.text();
  return new Response(text, {
    status: upstream.status,
    headers: {
      "content-type": upstream.headers.get("content-type") ?? "application/json",
    },
  });
}
