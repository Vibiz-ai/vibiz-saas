"use client";

import { useRef, useState } from "react";
import { Sparkles, Loader2, RefreshCw } from "lucide-react";

type ImageState =
  | { kind: "idle" }
  | { kind: "loading" }
  | {
      kind: "ready";
      url: string;
      width: number;
      height: number;
      seed: number;
      inferenceMs: number;
    }
  | { kind: "error"; message: string };

interface ImageResponse {
  images?: Array<{
    url: string;
    width: number;
    height: number;
    content_type?: string;
  }>;
  timings?: { inference?: number };
  seed?: number;
}

const PRESETS: string[] = [
  "minimalist isometric illustration of a cozy desk with a laptop and a small plant, soft pastel colors",
  "watercolor painting of a mountain range at sunrise, hand-painted style",
  "flat vector logo of a friendly fox, geometric, modern",
  "3D render of a glass orb floating above a marble pedestal, studio lighting",
];

export function ImagePlayground() {
  const [prompt, setPrompt] = useState("");
  const [state, setState] = useState<ImageState>({ kind: "idle" });
  const abortRef = useRef<AbortController | null>(null);

  const isLoading = state.kind === "loading";

  async function handleGenerate(e?: React.FormEvent) {
    e?.preventDefault();
    const trimmed = prompt.trim();
    if (!trimmed || isLoading) return;

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setState({ kind: "loading" });

    try {
      const res = await fetch("/api/ai/image-public", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          prompt: trimmed,
          image_size: "square_hd",
          num_images: 1,
        }),
        signal: controller.signal,
      });

      if (!res.ok) {
        let code: string | undefined;
        try {
          const j = (await res.json()) as { error?: string };
          code = j.error;
        } catch {
          // ignore
        }
        const message =
          code === "ai_not_configured"
            ? "AI is not configured for this site yet."
            : code === "missing_prompt"
              ? "Please enter a prompt."
              : code === "upstream_error"
                ? "The image service rejected the request."
                : `Sorry, something went wrong (${res.status}).`;
        setState({ kind: "error", message });
        return;
      }

      const json = (await res.json()) as ImageResponse;
      const first = json.images?.[0];
      if (!first?.url) {
        setState({ kind: "error", message: "No image returned." });
        return;
      }

      setState({
        kind: "ready",
        url: first.url,
        width: first.width,
        height: first.height,
        seed: json.seed ?? 0,
        inferenceMs: Math.round((json.timings?.inference ?? 0) * 1000),
      });
    } catch (err) {
      if (controller.signal.aborted) return;
      setState({
        kind: "error",
        message: err instanceof Error ? err.message : "Network error.",
      });
    }
  }

  return (
    <section className="py-24 bg-gray-50" id="ai-playground">
      <div className="max-w-4xl mx-auto px-6">
        <div className="text-center">
          <div className="inline-flex items-center gap-1.5 rounded-full border border-violet-200 bg-violet-50 px-3 py-1 text-xs font-medium text-violet-700">
            <Sparkles className="w-3 h-3" />
            Powered by AI
          </div>
          <h2 className="mt-4 text-3xl md:text-4xl font-heading font-bold text-gray-900">
            Generate a custom image, live.
          </h2>
          <p className="mt-3 text-gray-600 max-w-2xl mx-auto">
            This site has AI built in. Type any prompt, and your scoped AI
            agent will generate a 1024×1024 image in roughly a second.
          </p>
        </div>

        <form
          onSubmit={handleGenerate}
          className="mt-10 rounded-2xl border border-gray-200 bg-white p-6 shadow-sm"
        >
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="e.g. minimalist illustration of a coffee cup on a wooden table, soft morning light"
            rows={3}
            maxLength={500}
            disabled={isLoading}
            className="w-full resize-none rounded-lg border border-gray-200 px-4 py-3 text-sm text-gray-900 placeholder-gray-400 focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-500/20 disabled:bg-gray-50 disabled:text-gray-500"
          />

          <div className="mt-3 flex flex-wrap gap-2">
            {PRESETS.map((preset) => (
              <button
                key={preset}
                type="button"
                onClick={() => setPrompt(preset)}
                disabled={isLoading}
                className="rounded-full border border-gray-200 bg-white px-3 py-1 text-xs text-gray-600 transition-colors hover:border-violet-300 hover:bg-violet-50 hover:text-violet-700 disabled:opacity-50"
              >
                {preset.slice(0, 48)}
                {preset.length > 48 ? "…" : ""}
              </button>
            ))}
          </div>

          <div className="mt-4 flex items-center justify-between">
            <span className="text-xs text-gray-400">
              {prompt.length}/500
            </span>
            <button
              type="submit"
              disabled={isLoading || prompt.trim().length === 0}
              className="inline-flex items-center gap-2 rounded-lg bg-gray-900 px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Generating…
                </>
              ) : state.kind === "ready" ? (
                <>
                  <RefreshCw className="w-4 h-4" />
                  Generate again
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4" />
                  Generate
                </>
              )}
            </button>
          </div>
        </form>

        {state.kind === "loading" && (
          <div className="mt-6 aspect-square max-w-xl mx-auto rounded-2xl bg-gradient-to-br from-violet-100 to-blue-100 animate-pulse flex items-center justify-center">
            <div className="flex flex-col items-center text-violet-700">
              <Loader2 className="w-8 h-8 animate-spin" />
              <p className="mt-3 text-sm">Generating your image…</p>
            </div>
          </div>
        )}

        {state.kind === "ready" && (
          <figure className="mt-6 max-w-xl mx-auto">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={state.url}
              alt={prompt}
              width={state.width}
              height={state.height}
              className="rounded-2xl border border-gray-200 shadow-md"
            />
            <figcaption className="mt-3 flex items-center justify-between text-xs text-gray-500">
              <span>
                {state.width}×{state.height} · {state.inferenceMs}ms · seed{" "}
                {state.seed}
              </span>
              <a
                href={state.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-violet-700 hover:underline"
              >
                Open full size →
              </a>
            </figcaption>
          </figure>
        )}

        {state.kind === "error" && (
          <div className="mt-6 max-w-xl mx-auto rounded-lg border border-red-100 bg-red-50 p-4 text-sm text-red-700">
            {state.message}
          </div>
        )}
      </div>
    </section>
  );
}
