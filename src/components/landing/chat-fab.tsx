"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, MessageCircle, Send, Sparkles, X } from "lucide-react";
import { config } from "@/lib/config";
import { cn } from "@/lib/utils";

type Role = "user" | "assistant";
interface Msg {
  role: Role;
  content: string;
}

const WELCOME: Msg = {
  role: "assistant",
  content: "Hi! Ask me anything about this product — pricing, features, how it works.",
};

export function ChatFab() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Msg[]>([WELCOME]);
  const [draft, setDraft] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-scroll to bottom on every message tick (incl. streaming chunks).
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [messages]);

  // Focus textarea when opening.
  useEffect(() => {
    if (open) textareaRef.current?.focus();
  }, [open]);

  // Cancel any in-flight stream on unmount.
  useEffect(() => {
    return () => abortRef.current?.abort();
  }, []);

  async function send() {
    const text = draft.trim();
    if (!text || streaming) return;

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setError(null);
    setDraft("");

    // Optimistic user message + empty assistant placeholder we'll fill
    // as tokens stream in.
    const userMsg: Msg = { role: "user", content: text };
    const history: Msg[] = [
      // Strip the welcome message before sending — it's UI scaffolding,
      // not a real assistant turn.
      ...messages.filter((m) => m !== WELCOME),
      userMsg,
    ];
    setMessages((m) => [...m, userMsg, { role: "assistant", content: "" }]);
    setStreaming(true);

    try {
      const res = await fetch("/api/ai/ask", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ messages: history }),
        signal: controller.signal,
      });

      if (!res.ok || !res.body) {
        let code: string | undefined;
        try {
          const j = (await res.json()) as { error?: string };
          code = j.error;
        } catch {
          /* fall through */
        }
        const fallback =
          code === "ai_not_configured"
            ? "AI isn't configured for this site yet."
            : code === "upstream_budget_exceeded"
              ? "This site's AI budget is exhausted for the month."
              : code === "upstream_auth"
                ? "AI service rejected our credentials."
                : `Sorry, something went wrong (${res.status}).`;
        setError(fallback);
        setMessages((m) => m.slice(0, -1)); // drop the empty assistant placeholder
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let answer = "";

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        const events = buffer.split("\n\n");
        buffer = events.pop() ?? "";

        for (const event of events) {
          const line = event.split("\n").find((l) => l.startsWith("data:"));
          if (!line) continue;
          const payload = line.slice(5).trim();
          if (!payload || payload === "[DONE]") continue;
          try {
            const json = JSON.parse(payload) as {
              choices?: { delta?: { content?: string } }[];
            };
            const token = json.choices?.[0]?.delta?.content;
            if (typeof token === "string" && token.length > 0) {
              answer += token;
              setMessages((m) => {
                const next = m.slice();
                next[next.length - 1] = { role: "assistant", content: answer };
                return next;
              });
            }
          } catch {
            /* keepalive / non-JSON; ignore */
          }
        }
      }
    } catch (err) {
      if (controller.signal.aborted) return;
      setError(err instanceof Error ? err.message : "Network error.");
      setMessages((m) => m.slice(0, -1));
    } finally {
      setStreaming(false);
    }
  }

  function reset() {
    abortRef.current?.abort();
    setMessages([WELCOME]);
    setDraft("");
    setError(null);
    setStreaming(false);
  }

  return (
    <>
      {/* Floating button — visible when panel is closed */}
      {!open && (
        <button
          type="button"
          aria-label="Open chat"
          onClick={() => setOpen(true)}
          className="fixed bottom-5 right-5 z-50 inline-flex h-14 w-14 items-center justify-center rounded-full bg-gray-900 text-white shadow-lg shadow-black/20 transition-transform hover:scale-105 active:scale-95"
        >
          <MessageCircle className="h-6 w-6" />
        </button>
      )}

      {/* Panel */}
      {open && (
        <div
          className={cn(
            "fixed z-50 flex flex-col rounded-2xl border border-gray-200 bg-white shadow-2xl shadow-black/10",
            "bottom-5 right-5 left-5 sm:left-auto sm:w-[380px]",
            "max-h-[min(640px,calc(100vh-2.5rem))] h-[min(640px,calc(100vh-2.5rem))]",
          )}
        >
          {/* Header */}
          <div className="flex items-center justify-between gap-2 border-b border-gray-100 px-4 py-3">
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-violet-500 to-violet-600 text-white">
                <Sparkles className="h-4 w-4" />
              </div>
              <div className="flex flex-col">
                <span className="text-sm font-semibold text-gray-900">
                  {config.product.name} support
                </span>
                <span className="text-xs text-gray-500">
                  AI-powered · usually replies instantly
                </span>
              </div>
            </div>
            <div className="flex items-center gap-1">
              {messages.length > 1 && (
                <button
                  type="button"
                  onClick={reset}
                  className="rounded-md px-2 py-1 text-xs text-gray-500 hover:bg-gray-100 hover:text-gray-700"
                >
                  Reset
                </button>
              )}
              <button
                type="button"
                aria-label="Close chat"
                onClick={() => setOpen(false)}
                className="rounded-md p-1.5 text-gray-500 hover:bg-gray-100 hover:text-gray-700"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* Messages */}
          <div
            ref={scrollRef}
            className="flex-1 overflow-y-auto px-4 py-4 space-y-3"
          >
            {messages.map((m, i) => (
              <div
                key={i}
                className={cn(
                  "flex",
                  m.role === "user" ? "justify-end" : "justify-start",
                )}
              >
                <div
                  className={cn(
                    "max-w-[85%] rounded-2xl px-3.5 py-2 text-sm leading-relaxed whitespace-pre-wrap",
                    m.role === "user"
                      ? "bg-gray-900 text-white"
                      : "bg-gray-100 text-gray-800",
                  )}
                >
                  {m.content || (
                    <span className="inline-flex items-center gap-1.5 text-gray-500">
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      Thinking…
                    </span>
                  )}
                </div>
              </div>
            ))}

            {error && (
              <div className="rounded-lg border border-red-100 bg-red-50 px-3 py-2 text-xs text-red-700">
                {error}
              </div>
            )}
          </div>

          {/* Input */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void send();
            }}
            className="border-t border-gray-100 p-3"
          >
            <div className="flex items-end gap-2 rounded-xl border border-gray-200 bg-white px-3 py-2 focus-within:border-gray-400">
              <textarea
                ref={textareaRef}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    void send();
                  }
                }}
                placeholder="Type your question…"
                rows={1}
                maxLength={500}
                disabled={streaming}
                className="flex-1 resize-none bg-transparent text-sm text-gray-900 placeholder-gray-400 outline-none disabled:text-gray-500"
              />
              <button
                type="submit"
                aria-label="Send"
                disabled={streaming || draft.trim().length === 0}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gray-900 text-white transition-colors hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {streaming ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Send className="h-3.5 w-3.5" />
                )}
              </button>
            </div>
            <p className="mt-1.5 px-1 text-[10px] text-gray-400">
              Press Enter to send, Shift+Enter for new line.
            </p>
          </form>
        </div>
      )}
    </>
  );
}
