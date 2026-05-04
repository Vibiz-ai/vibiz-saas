import { createFetch } from "@sapiom/fetch";

export const SAPIOM_SERVICES = {
  llm: "https://openrouter.services.sapiom.ai/v1",
  search: "https://linkup.services.sapiom.ai/v1",
  image: "https://fal.services.sapiom.ai/v1",
  audio: "https://elevenlabs.services.sapiom.ai/v1",
} as const;

export type SapiomService = keyof typeof SAPIOM_SERVICES;

export function isSapiomConfigured(): boolean {
  return Boolean(process.env.SAPIOM_API_KEY);
}

let cached: ReturnType<typeof createFetch> | null = null;

export function sapiomFetch(): ReturnType<typeof createFetch> {
  if (cached) return cached;
  const apiKey = process.env.SAPIOM_API_KEY;
  if (!apiKey) {
    throw new Error("SAPIOM_API_KEY is not set");
  }
  cached = createFetch({
    apiKey,
    agentName: process.env.SAPIOM_AGENT_NAME ?? "vibiz-saas",
    failureMode: "closed",
  });
  return cached;
}

export function sapiomUrl(service: SapiomService, path: string): string {
  const base = SAPIOM_SERVICES[service];
  return path.startsWith("/") ? `${base}${path}` : `${base}/${path}`;
}
