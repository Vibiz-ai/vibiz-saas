import { NextResponse } from "next/server";
import { guardAiRequest } from "@/lib/api-guard";
import { sapiomFetch, sapiomUrl } from "@/lib/sapiom";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const guard = await guardAiRequest();
  if (!guard.ok) return guard.response;

  const body = await request.text();
  const fetcher = sapiomFetch();
  const upstream = await fetcher(sapiomUrl("llm", "/chat/completions"), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body,
  });

  if (!upstream.ok && !upstream.body) {
    return NextResponse.json(
      { error: "upstream_error", status: upstream.status },
      { status: upstream.status },
    );
  }

  return new Response(upstream.body, {
    status: upstream.status,
    headers: {
      "content-type": upstream.headers.get("content-type") ?? "application/json",
    },
  });
}
