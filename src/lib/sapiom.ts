import { createFetch } from "@sapiom/fetch";

export const SAPIOM_SERVICES = {
  llm: "https://openrouter.services.sapiom.ai/v1",
  search: "https://linkup.services.sapiom.ai/v1",
  // fal: native API has no /v1 prefix; gateway forwards `/run/<model>` directly.
  image: "https://fal.services.sapiom.ai",
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
  // EP-1434: vibiz provisioning sets SAPIOM_AGENT_ID (UUID, primary key
  // for spending rules) and SAPIOM_AGENT_NAME (human label). Sapiom's
  // payment service rejects requests that carry BOTH simultaneously
  // (verified in local: `agentName` + `agentId` together → upstream 500;
  // either alone → 200). Prefer the id when present, fall back to the
  // name. Without either, every deployed site falls onto the master
  // agent and the per-workspace $5 rolling cap does NOT apply — any
  // one site could drain the master budget for everyone.
  const agentMeta = process.env.SAPIOM_AGENT_ID
    ? { agentId: process.env.SAPIOM_AGENT_ID }
    : { agentName: process.env.SAPIOM_AGENT_NAME ?? "vibiz-saas" };

  cached = createFetch({
    apiKey,
    ...agentMeta,
    failureMode: "closed",
  });
  return cached;
}

export function sapiomUrl(service: SapiomService, path: string): string {
  const base = SAPIOM_SERVICES[service];
  return path.startsWith("/") ? `${base}${path}` : `${base}/${path}`;
}
