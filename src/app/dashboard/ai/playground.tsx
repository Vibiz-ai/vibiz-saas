"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Status = "idle" | "loading" | "ok" | "error";

function StatusPill({ status }: { status: Status }) {
  if (status === "idle") return null;
  const map: Record<Exclude<Status, "idle">, { label: string; color: string }> = {
    loading: { label: "Running…", color: "bg-gray-100 text-gray-700" },
    ok: { label: "OK", color: "bg-green-100 text-green-700" },
    error: { label: "Error", color: "bg-red-100 text-red-700" },
  };
  const v = map[status];
  return <span className={`text-xs px-2 py-1 rounded ${v.color}`}>{v.label}</span>;
}

export function Playground() {
  return (
    <div className="grid gap-6 md:grid-cols-2">
      <ChatCard />
      <SearchCard />
      <ImageCard />
      <TtsCard />
    </div>
  );
}

function ChatCard() {
  const [prompt, setPrompt] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [reply, setReply] = useState("");

  async function send() {
    setStatus("loading");
    setReply("");
    try {
      const res = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          model: "openai/gpt-4o-mini",
          messages: [{ role: "user", content: prompt }],
          max_tokens: 300,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      setReply(data.choices?.[0]?.message?.content ?? JSON.stringify(data));
      setStatus("ok");
    } catch (err) {
      setReply(err instanceof Error ? err.message : String(err));
      setStatus("error");
    }
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">Chat (LLM)</h2>
          <StatusPill status={status} />
        </div>
        <p className="text-xs text-gray-500 mt-1">openrouter → gpt-4o-mini</p>
      </CardHeader>
      <CardContent className="space-y-3">
        <Input
          placeholder="Ask something…"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
        />
        <Button onClick={send} disabled={!prompt || status === "loading"} size="sm">
          Send
        </Button>
        {reply && (
          <pre className="text-xs bg-gray-50 p-3 rounded border whitespace-pre-wrap">{reply}</pre>
        )}
      </CardContent>
    </Card>
  );
}

function SearchCard() {
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [out, setOut] = useState("");

  async function send() {
    setStatus("loading");
    setOut("");
    try {
      const res = await fetch("/api/ai/search", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ q, depth: "standard", outputType: "sourcedAnswer" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      setOut(JSON.stringify(data, null, 2));
      setStatus("ok");
    } catch (err) {
      setOut(err instanceof Error ? err.message : String(err));
      setStatus("error");
    }
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">Search</h2>
          <StatusPill status={status} />
        </div>
        <p className="text-xs text-gray-500 mt-1">linkup → sourced answer</p>
      </CardHeader>
      <CardContent className="space-y-3">
        <Input
          placeholder="What do you want to look up?"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <Button onClick={send} disabled={!q || status === "loading"} size="sm">
          Search
        </Button>
        {out && (
          <pre className="text-xs bg-gray-50 p-3 rounded border whitespace-pre-wrap max-h-60 overflow-auto">
            {out}
          </pre>
        )}
      </CardContent>
    </Card>
  );
}

function ImageCard() {
  const [prompt, setPrompt] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [imageUrl, setImageUrl] = useState("");
  const [error, setError] = useState("");

  async function send() {
    setStatus("loading");
    setImageUrl("");
    setError("");
    try {
      const res = await fetch("/api/ai/image", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ prompt, model: "fal-ai/flux/schnell" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      const url = data.images?.[0]?.url;
      if (!url) throw new Error("no image url in response");
      setImageUrl(url);
      setStatus("ok");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setStatus("error");
    }
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">Image</h2>
          <StatusPill status={status} />
        </div>
        <p className="text-xs text-gray-500 mt-1">fal → flux/schnell ($0.004/MP)</p>
      </CardHeader>
      <CardContent className="space-y-3">
        <Input
          placeholder="A cat astronaut on Mars"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
        />
        <Button onClick={send} disabled={!prompt || status === "loading"} size="sm">
          Generate
        </Button>
        {error && <p className="text-xs text-red-600">{error}</p>}
        {imageUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={imageUrl} alt="generated" className="rounded border max-h-72" />
        )}
      </CardContent>
    </Card>
  );
}

function TtsCard() {
  const [text, setText] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [audioUrl, setAudioUrl] = useState("");
  const [error, setError] = useState("");

  async function send() {
    setStatus("loading");
    setAudioUrl("");
    setError("");
    try {
      const res = await fetch("/api/ai/audio/tts", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? `HTTP ${res.status}`);
      }
      const blob = await res.blob();
      setAudioUrl(URL.createObjectURL(blob));
      setStatus("ok");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setStatus("error");
    }
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">Text-to-Speech</h2>
          <StatusPill status={status} />
        </div>
        <p className="text-xs text-gray-500 mt-1">elevenlabs → multilingual v2</p>
      </CardHeader>
      <CardContent className="space-y-3">
        <Input
          placeholder="Say something…"
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
        <Button onClick={send} disabled={!text || status === "loading"} size="sm">
          Speak
        </Button>
        {error && <p className="text-xs text-red-600">{error}</p>}
        {audioUrl && <audio controls src={audioUrl} className="w-full" />}
      </CardContent>
    </Card>
  );
}
