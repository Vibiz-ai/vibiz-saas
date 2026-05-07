import { NextResponse } from "next/server";
import { config } from "@/lib/config";
import { isSapiomConfigured, sapiomFetch, sapiomUrl } from "@/lib/sapiom";

export const runtime = "nodejs";

const MAX_QUESTION_CHARS = 500;
const MAX_HISTORY_MESSAGES = 12;
const MAX_TOTAL_CHARS = 6000;

type ChatRole = "user" | "assistant";
interface ChatMessage {
  role: ChatRole;
  content: string;
}

function parseHistory(input: unknown): ChatMessage[] | null {
  if (!Array.isArray(input)) return null;
  const out: ChatMessage[] = [];
  for (const m of input) {
    if (!m || typeof m !== "object") return null;
    const role = (m as { role?: unknown }).role;
    const content = (m as { content?: unknown }).content;
    if (role !== "user" && role !== "assistant") return null;
    if (typeof content !== "string" || content.length === 0) return null;
    out.push({ role, content });
  }
  return out;
}

function buildSystemPrompt(): string {
  const faqLines = config.faq
    .map((item, i) => `${i + 1}. Q: ${item.question}\n   A: ${item.answer}`)
    .join("\n");

  return [
    `You are the AI assistant embedded on the public website for ${config.product.name}.`,
    `Tagline: ${config.product.tagline}`,
    `Description: ${config.product.description}`,
    "",
    "Existing FAQ for this product:",
    faqLines,
    "",
    "Rules:",
    "- Answer in 2-4 sentences, plain language, no markdown headers.",
    "- Stay strictly on-topic to this product. If the user asks about something unrelated, politely redirect to the product.",
    "- If the existing FAQ already covers the question, paraphrase that answer rather than inventing new policy.",
    "- Never invent prices, dates, contractual terms, or refund windows that aren't in the FAQ above. If unsure, say to contact support.",
  ].join("\n");
}

export async function POST(request: Request) {
  if (!isSapiomConfigured()) {
    return NextResponse.json(
      { error: "ai_not_configured", message: "SAPIOM_API_KEY missing on server" },
      { status: 503 },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  // Two accepted shapes:
  //   { question: "..." }                    — single-turn, kept for the
  //                                            simple "ask AI" public form
  //   { messages: [{role, content}, ...] }   — multi-turn, used by the
  //                                            chat FAB; last entry must
  //                                            be user-role.
  const obj =
    typeof body === "object" && body !== null
      ? (body as Record<string, unknown>)
      : {};

  const historyInput = parseHistory(obj.messages);
  let messages: ChatMessage[];

  if (historyInput) {
    if (historyInput.length === 0) {
      return NextResponse.json({ error: "empty_messages" }, { status: 400 });
    }
    if (historyInput[historyInput.length - 1].role !== "user") {
      return NextResponse.json(
        { error: "last_message_must_be_user" },
        { status: 400 },
      );
    }
    const trimmed = historyInput.slice(-MAX_HISTORY_MESSAGES);
    const total = trimmed.reduce((n, m) => n + m.content.length, 0);
    if (total > MAX_TOTAL_CHARS) {
      return NextResponse.json(
        { error: "history_too_long", limit: MAX_TOTAL_CHARS },
        { status: 400 },
      );
    }
    if (trimmed[trimmed.length - 1].content.length > MAX_QUESTION_CHARS) {
      return NextResponse.json(
        { error: "question_too_long", limit: MAX_QUESTION_CHARS },
        { status: 400 },
      );
    }
    messages = trimmed;
  } else {
    const question = obj.question;
    if (typeof question !== "string" || question.trim().length === 0) {
      return NextResponse.json({ error: "missing_question" }, { status: 400 });
    }
    if (question.length > MAX_QUESTION_CHARS) {
      return NextResponse.json(
        { error: "question_too_long", limit: MAX_QUESTION_CHARS },
        { status: 400 },
      );
    }
    messages = [{ role: "user", content: question.trim() }];
  }

  const fetcher = sapiomFetch();
  let upstream: Response;
  try {
    upstream = await fetcher(sapiomUrl("llm", "/chat/completions"), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        model: "openai/gpt-4o-mini",
        stream: true,
        messages: [{ role: "system", content: buildSystemPrompt() }, ...messages],
      }),
    });
  } catch (err) {
    // @sapiom/fetch throws on non-2xx upstream (e.g. invalid key, budget
    // exceeded). Surface a stable shape so the FAQ widget can render a
    // friendly message instead of a generic 500.
    const message = err instanceof Error ? err.message : String(err);
    const isAuth = /401|403|authentication/i.test(message);
    const isBudget = /402|spending|budget|limit/i.test(message);
    console.error("[AskAI] sapiom upstream failed:", message);
    return NextResponse.json(
      {
        error: isAuth
          ? "upstream_auth"
          : isBudget
            ? "upstream_budget_exceeded"
            : "upstream_error",
        message,
      },
      { status: isAuth ? 502 : isBudget ? 402 : 502 },
    );
  }

  if (!upstream.ok && !upstream.body) {
    return NextResponse.json(
      { error: "upstream_error", status: upstream.status },
      { status: upstream.status },
    );
  }

  return new Response(upstream.body, {
    status: upstream.status,
    headers: {
      "content-type":
        upstream.headers.get("content-type") ?? "text/event-stream",
      "cache-control": "no-cache, no-transform",
    },
  });
}
