import { NextResponse } from "next/server";
import { guardAiRequest } from "@/lib/api-guard";
import { sapiomFetch, sapiomUrl } from "@/lib/sapiom";

export const runtime = "nodejs";

const DEFAULT_VOICE_ID = "21m00Tcm4TlvDq8ikWAM";
const MAX_TEXT_LENGTH = 5000;

export async function POST(request: Request) {
  const guard = await guardAiRequest();
  if (!guard.ok) return guard.response;

  let payload: Record<string, unknown>;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const text = typeof payload.text === "string" ? payload.text : "";
  if (text.length === 0) {
    return NextResponse.json({ error: "missing_text" }, { status: 400 });
  }
  if (text.length > MAX_TEXT_LENGTH) {
    return NextResponse.json(
      { error: "text_too_long", max: MAX_TEXT_LENGTH },
      { status: 400 },
    );
  }

  const voiceId = typeof payload.voiceId === "string" ? payload.voiceId : DEFAULT_VOICE_ID;
  const modelId =
    typeof payload.model_id === "string" ? payload.model_id : "eleven_multilingual_v2";
  const outputFormat =
    typeof payload.output_format === "string" ? payload.output_format : "mp3_44100_128";

  const fetcher = sapiomFetch();
  const upstream = await fetcher(sapiomUrl("audio", `/text-to-speech/${voiceId}`), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ text, model_id: modelId, output_format: outputFormat }),
  });

  if (!upstream.ok) {
    const errText = await upstream.text();
    return new Response(errText, {
      status: upstream.status,
      headers: {
        "content-type": upstream.headers.get("content-type") ?? "application/json",
      },
    });
  }

  return new Response(upstream.body, {
    status: 200,
    headers: {
      "content-type": upstream.headers.get("content-type") ?? "audio/mpeg",
      "x-character-count": upstream.headers.get("x-character-count") ?? String(text.length),
    },
  });
}
