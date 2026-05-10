# Vibiz SaaS Sandbox Builder Rules

This repo is the source template for Vibiz-built customer sites. The Vibiz platform creates an E2B sandbox from this image, seeds workspace data, and then asks OpenCode to edit `/home/user/app`. Your job is to turn the seeded template into a working, polished site while preserving the platform contracts below.

## Load Project Skills

Use the project-local OpenCode skills when the task touches their area:

- `vibiz-payments` for pricing, offers, checkout, redirects, or payments.
- `vibiz-site-quality` for landing pages, marketing sites, dashboards, visual polish, and brand adaptation.
- `vibiz-runtime-repair` when the app fails to build, boot, render, authenticate, call AI routes, or deploy.

## Hard Platform Contracts

- `data/offers.json` is written by Vibiz during sandbox bootstrap and deploy. Do not edit, overwrite, reseed, or fabricate it.
- Pricing must read offers through `src/lib/offers.ts` and render links using `offer.paymentLinkUrl`.
- Paid app features must use the entitlement helpers in `src/lib/entitlements.ts` and the seeded `offer.entitlementKey`; do not invent a separate paid-user table, bypass Vibiz runtime revalidation, or call Stripe directly.
- Customer sites are Stripe-free. Do not install the `stripe` package, create `lib/stripe.ts`, add `/api/stripe/*` routes, add checkout session code, or add `STRIPE_SECRET_KEY` anywhere.
- Stripe checkout is handled by platform-minted Payment Links. Attribution and webhooks stay in the parent Vibiz app.
- Do not change post-checkout redirect behavior. Stripe returns buyers to `/?payment=success&claim=...` for legacy-safe landing; the root page forwards the claim to `/payment-success`, which exchanges the Vibiz claim, stores a local entitlement, and revalidates that entitlement with Vibiz before unlocking paid features on future visits.
- `NEXT_PUBLIC_VIBIZ_DEPLOY=1` marks Vibiz-managed deployments. Do not remove the guard that prevents placeholder pricing on managed sites.
- Turso, Sapiom, and Better Auth env vars are provisioned by Vibiz. Do not mint keys manually, expose server keys to the browser, or commit real secrets.
- `.env` and `.env.*` files are runtime-only. Only create or modify them when the user or parent Vibiz agent explicitly provides a non-Vibiz third-party key needed for the app to run. Never add Stripe keys.

## Hard rules — DO NOT EDIT these files

- `src/middleware.ts` — auth gating
- `src/lib/auth.ts`, `src/lib/auth-client.ts` — better-auth wiring (unless explicitly asked to change auth)
- `src/lib/api-guard.ts` — API protection
- `src/lib/runner-auth.ts` — Sandbox v2 runner JWT verifier; wire contract with the vibiz orchestrator (coordinate any change with vibiz)
- `src/lib/runner-types.ts` — Sandbox v2 zod request/response schemas for `/api/internal/runner/*`; shared wire contract with the vibiz runner client
- `src/app/api/internal/runner/**` — Sandbox v2 runner route tree; called by the parent vibiz orchestrator over JWT-authed HTTPS. NOT for end-user use. Do not expose them publicly, do not add auth bypasses, do not add CORS for browser origins.
- `src/lib/sapiom.ts` — AI provider gateway helper (extend by adding new routes that USE it; never modify it)
- `src/components/VibizSelectBridge.tsx` — Vibiz dashboard select-element bridge
- `src/app/api/auth/[...all]/route.ts` — better-auth route handler
- `scripts/migrate.mjs` — DB migration runner
- `next.config.ts`, `tsconfig.json`, `package.json`, `tailwind.config.ts`, `postcss.config.mjs` — only edit if the user explicitly asks for build / dep changes

If a request seems to require touching one of the DO NOT EDIT items, prefer asking for clarification by writing the answer in plain language; do not edit silently.

## Sandbox v2 contracts (DO NOT EDIT silently — coordinate with vibiz)

These files are the wire contract between the vibiz platform and the in-sandbox runner API. Editing them changes a cross-repo schema; the vibiz repo commits a generated copy of the artifacts and runs a parity check in CI. See `vibiz/docs/sandbox-v2-types-sharing.md` (decision C) for the full flow.

- `src/lib/template-config.schema.ts` — zod schema for the `TemplateConfig` payload accepted by the runner. Source of truth. Mirror of the runtime shape in `template.config.ts`. Adding/renaming fields is a breaking change; bump `schemaVersion` and ping the vibiz side.
- `scripts/export-schema.ts` — codegen entry point. Run via `npm run schema:export`. Emits `dist-schema/template-config.schema.json` (JSON Schema 7) and `dist-schema/template-config.types.d.ts`.
- `src/lib/template-config.schema.test.ts` — smoke test (run via `npm run schema:test`): asserts the runtime config parses, that required fields are required, and that `.strict()` rejects unknown root keys.
- `src/lib/runner-auth.ts` — ES256 JWT verifier for `/api/internal/runner/*`. Signer is `vibiz/lib/services/sandbox/runner-jwt.ts`; payload shape (`sub`, `sandboxId`, `scope: 'runner'`, `iat`, `exp`) is the wire contract. Public key read lazily from `VIBIZ_RUNNER_PUBLIC_KEY` (PEM SPKI). Algorithm is whitelisted to `['ES256']` — do not loosen.
- `src/lib/runner-auth.test.ts` — smoke test (run via `npm run runner-auth:test`): generates a fresh ES256 keypair per run and mints tokens inline mirroring the upstream signer, then exercises the verifier across happy + 5 failure paths.
- `src/lib/runner-types.ts` — zod request/response schemas for every `/api/internal/runner/*` endpoint (claim, current-config, apply-config-patch, apply-file-patch, apply-multi-patch, git-revert, snapshot, restore, build-status). Shared with the vibiz-side runner client SDK; both sides parse against these so the contract is enforced symmetrically. Add new endpoints by appending request/response schemas here (with `.strict()`) before wiring the route handler.
- `src/lib/runner-types.test.ts` — smoke test (run via `npm run runner-types:test`): exercises every request schema with a happy + invalid payload to fail loud if a schema is loosened or a discriminator drops.
- `src/app/api/internal/runner/**` — runner route tree. Each handler:
  - Sets `export const runtime = 'nodejs'` (the route uses `child_process`, `fs/promises`, and ES256 verification — Edge runtime won't work).
  - Wraps the handler in `withRunnerAuth` from `src/lib/runner-auth.ts`.
  - Validates the body against the matching zod schema in `src/lib/runner-types.ts`; returns 400 on shape mismatch.
  - Logs with bracket-prefix `[Runner:<endpointName>]` carrying `orgId` and `sandboxId` for cross-repo traceability.
  These routes are called by the parent vibiz orchestrator. They are NOT for end-user use. Do not expose them publicly, do not add auth bypasses, do not add CORS for browser origins.
  Endpoints under this tree:
  - `/claim` — boot/initialize the workspace repo on session start.
  - `/current-config` — read + parse the live `template.config.ts`.
  - `/apply-config-patch`, `/apply-file-patch`, `/apply-multi-patch`, `/git-revert` — mutating ops.
  - `/snapshot` — tar the working tree (excluding `node_modules`, `.next`, `.next-cache`) and PUT to a Supabase Storage signed upload URL minted by the orchestrator. The runner holds zero Supabase credentials. Pre-flight requires a clean working tree.
  - `/restore` — fetch a previously-uploaded snapshot from a signed download URL and extract on top of `RUNNER_APP_DIR`. Replaces the template's pristine commit with the workspace's git history. `node_modules/` is preserved across restore (it is not in the tarball).
  - `/build-status` — SSE stream of dev-server build state.
- `dist-schema/` — auto-generated; do not hand-edit. Regenerate via `npm run schema:export` after every schema change. Contents are committed (not gitignored) so the vibiz parity check can diff against `main`.

Workflow when changing a field: edit `template-config.schema.ts` → run `npm run schema:test` → run `npm run schema:export` → commit `src/lib/template-config.schema.ts` + `dist-schema/*` together. The vibiz PR that consumes the new shape comes second (it copies the regenerated artifacts in via `pnpm sandbox:sync-types`).

## Single source of truth: `template.config.ts`

90% of edits go here, NOT into components. The landing page reads brand, copy, hero, features, testimonials, pricing, FAQ, and dashboard sidebar items from a single typed object. Change the object → site updates.

Touch component files **only** when the user asks for new structure (new section, removed section, layout change). For copy/colors/fonts/features/items, edit `template.config.ts` and stop.

> Sandbox v2 exception: `template.config.ts` is also edited programmatically by `src/lib/config-patch-executor.ts` (a ts-morph AST executor) via the `/api/internal/runner/apply-config-patch` route. That is the platform's automated path for `set` / `append` / `remove` ops on this file. Do not edit `template.config.ts` by hand from agent runs that originate inside the runner — let the executor do it so the commit is consistent and the post-patch zod validation runs.

## File map (memorize this)

| If the user asks to change… | Edit | Notes |
|---|---|---|
| Product name / tagline / description | `template.config.ts` → `product` | Also drives `<title>` via `app/layout.tsx` |
| Brand colors (primary, secondary, accent, bg, fg) | `template.config.ts` → `brand.colors` | Wired into CSS vars `--brand-*` in `app/layout.tsx` |
| Heading / body fonts | `template.config.ts` → `brand.fonts` | Loaded via Google Fonts in `app/layout.tsx` |
| Hero headline / subhead / CTAs / social proof | `template.config.ts` → `hero` | Component: `src/components/landing/hero.tsx` |
| Features list (icons + titles + descriptions) | `template.config.ts` → `features` | Icons are `lucide-react` names. Component: `landing/features.tsx` |
| Testimonials (quote, name, role) | `template.config.ts` → `testimonials` | Component: `landing/testimonials.tsx` |
| Pricing tiers (name, price, features) | `template.config.ts` → `pricing.fallbackTiers` | Note: live pricing is seeded into `data/offers.json` at deploy by Vibiz. Edit `fallbackTiers` only for the standalone case. |
| FAQ Q&A | `template.config.ts` → `faq` | Component: `landing/faq.tsx` |
| Footer links / copyright | `template.config.ts` → `footer` | Component: `layout/footer.tsx` |
| Sidebar items (dashboard nav) | `template.config.ts` → `dashboard.sidebarItems` | Icons = `lucide-react` names. Component: `layout/sidebar.tsx` |
| Add or remove an entire section | `src/app/page.tsx` | Composition root for the landing page |
| Add a new dashboard route | `src/app/dashboard/<route>/page.tsx` | Layout wraps with sidebar automatically. Add a matching entry to `template.config.ts → dashboard.sidebarItems` so it appears in the nav. |
| Auth providers | `template.config.ts` → `auth.providers` | Wired in `src/lib/auth.ts` |
| Add an AI feature (chatbot, image gen, voice, search) | New `src/app/api/ai/<feature>/route.ts` + a UI component | See "AI capabilities (via Sapiom)" below — DO NOT call OpenAI/Anthropic/fal directly, always proxy through `sapiomFetch()` |

## Project structure

```
vibiz-saas/
├── template.config.ts         ← brand + copy (edit FIRST for most asks)
├── src/
│   ├── app/
│   │   ├── layout.tsx         ← global CSS vars, fonts, metadata
│   │   ├── page.tsx           ← landing composition (Hero+Features+...)
│   │   ├── (marketing)/       ← marketing routes (pricing, etc.)
│   │   ├── (auth)/            ← login, signup
│   │   ├── payment-success/   ← Vibiz claim exchange after Stripe checkout
│   │   ├── dashboard/         ← authed app: layout, settings, billing
│   │   └── api/auth/          ← better-auth handler — DO NOT EDIT
│   ├── components/
│   │   ├── landing/           ← hero, features, pricing, testimonials, faq, cta
│   │   ├── layout/            ← navbar, footer, sidebar, topbar
│   │   ├── ui/                ← button, badge, card, input (shadcn-style primitives)
│   │   ├── EntitlementGate.tsx ← server component for paid-feature gates
│   │   └── VibizSelectBridge.tsx ← INTERNAL — do not edit
│   ├── lib/
│   │   ├── config.ts          ← re-exports template.config (don't break this contract)
│   │   ├── utils.ts           ← cn() helper
│   │   ├── auth.ts            ← better-auth setup — modify only if changing auth
│   │   ├── auth-client.ts     ← client-side auth — likewise
│   │   ├── entitlements.ts    ← local paid-feature entitlement helpers
│   │   ├── vibiz-runtime.ts   ← server-side Vibiz runtime claim client
│   │   ├── api-guard.ts       ← API protection — DO NOT EDIT
│   │   ├── sapiom.ts          ← AI provider integration — DO NOT EDIT
│   │   ├── offers.ts          ← live pricing loader from data/offers.json
│   │   ├── app-url.ts         ← URL helpers
│   │   ├── template-config.schema.ts       ← Sandbox v2 zod contract (coordinate w/ vibiz)
│   │   └── template-config.schema.test.ts  ← schema smoke test (npm run schema:test)
│   └── middleware.ts          ← DO NOT EDIT — handles auth gating
├── data/
│   └── offers.json            ← live pricing seeded by Vibiz at deploy
├── dist-schema/                ← AUTO-GENERATED via `npm run schema:export`. Committed for vibiz CI parity check. Do not hand-edit.
└── scripts/
    ├── migrate.mjs            ← DB migration runner — DO NOT EDIT
    └── export-schema.ts       ← Sandbox v2 codegen — emits dist-schema/ artifacts
```

## AI capabilities (via Sapiom) — build, don't import third-party SDKs

The chassis already speaks to AI providers through a single secure gateway called **Sapiom**. Every AI call you add MUST go through `sapiomFetch()` + `sapiomUrl()` from `@/lib/sapiom`. NEVER `import OpenAI from "openai"`, fal SDK, or any direct provider SDK — the chassis won't have those keys; only `SAPIOM_API_KEY` is provisioned at deploy time. Direct provider SDKs will fail at runtime with "missing API key".

### The 4 services available

| Service key | Upstream | What you call it for | Example body |
|---|---|---|---|
| `llm` | OpenRouter (OpenAI / Anthropic / Google / etc.) | text chat, completions, structured output, streaming | `{ model: "openai/gpt-4o-mini", messages: [{role,content}], stream: true }` |
| `search` | Linkup web search | grounded answers with sources | `{ q: "...", depth?: "standard"\|"deep", outputType?: "sourcedAnswer" }` |
| `image` | fal.ai | image generation (flux, nano-banana, etc.) | `{ prompt: "...", model: "fal-ai/flux/schnell", aspect_ratio?, num_images?, resolution? }` (model goes in URL path, not body) |
| `audio` | ElevenLabs TTS | text-to-speech | `{ text: "...", model_id: "eleven_multilingual_v2", output_format: "mp3_44100_128" }` (voiceId goes in URL path) |

### Two helpers, one auth gate (use these in EVERY new AI route)

- `sapiomFetch()` — returns a fetch with `SAPIOM_API_KEY` + agent metadata baked in. Lazy-init (throws if `SAPIOM_API_KEY` missing).
- `sapiomUrl(service, path)` — builds the upstream URL. `service` is one of `"llm" | "search" | "image" | "audio"`.
- `guardAiRequest()` from `@/lib/api-guard` — returns 503 if `SAPIOM_API_KEY` missing, 401 if no logged-in session. **Use it on authed routes**; skip it for public landing widgets but keep an `isSapiomConfigured()` check.

### Recipe 1 — Chatbot (LLM streaming, OpenAI-compatible)

**When**: user asks for a chat widget, AI assistant, copilot.

**Route** (`src/app/api/ai/chat/route.ts`, auth-gated):
```ts
import { NextResponse } from "next/server";
import { guardAiRequest } from "@/lib/api-guard";
import { sapiomFetch, sapiomUrl } from "@/lib/sapiom";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const guard = await guardAiRequest();
  if (!guard.ok) return guard.response;
  const body = await request.text(); // pass-through; client sends OpenAI-compat JSON
  const upstream = await sapiomFetch()(
    sapiomUrl("llm", "/chat/completions"),
    { method: "POST", headers: { "content-type": "application/json" }, body },
  );
  return new Response(upstream.body, {
    status: upstream.status,
    headers: { "content-type": upstream.headers.get("content-type") ?? "application/json" },
  });
}
```

**Client body**: `{ model: "openai/gpt-4o-mini", messages: [{ role: "user", content: "..." }], stream: true }`. Streaming returns SSE; parse with EventSource or read `response.body` chunks.

**Public variant**: drop `guardAiRequest`, replace with `if (!isSapiomConfigured()) return NextResponse.json({error:"ai_not_configured"},{status:503})`. Useful for landing chat FABs grounded in the FAQ — build the system prompt from `config.faq` and prepend to messages on the server.

### Recipe 2 — Web search (grounded answers)

**When**: user asks for a research feature, "ask the web", live fact lookup.

**Route** (`src/app/api/ai/search/route.ts`, auth-gated):
```ts
import { NextResponse } from "next/server";
import { guardAiRequest } from "@/lib/api-guard";
import { sapiomFetch, sapiomUrl } from "@/lib/sapiom";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const guard = await guardAiRequest();
  if (!guard.ok) return guard.response;
  const payload = (await request.json()) as { q?: string; depth?: string };
  if (!payload.q) return NextResponse.json({ error: "missing_q" }, { status: 400 });
  const upstream = await sapiomFetch()(sapiomUrl("search", "/search"), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ depth: "standard", outputType: "sourcedAnswer", ...payload }),
  });
  const text = await upstream.text();
  return new Response(text, {
    status: upstream.status,
    headers: { "content-type": upstream.headers.get("content-type") ?? "application/json" },
  });
}
```

**Client body**: `{ q: "what's the best coffee in Rome", depth?: "standard"|"deep" }`. Response is JSON with `answer` + `sources[]`.

### Recipe 3 — Image generation (fal.ai)

**When**: user asks for an image generator, AI thumbnail, brand asset on demand.

**Route** (`src/app/api/ai/image/route.ts`, auth-gated):
```ts
import { NextResponse } from "next/server";
import { guardAiRequest } from "@/lib/api-guard";
import { sapiomFetch, sapiomUrl } from "@/lib/sapiom";

export const runtime = "nodejs";
const DEFAULT_MODEL = "fal-ai/flux/schnell"; // fast + cheap; use "fal-ai/nano-banana-2" for quality

export async function POST(request: Request) {
  const guard = await guardAiRequest();
  if (!guard.ok) return guard.response;
  const payload = (await request.json()) as Record<string, unknown>;
  const model = typeof payload.model === "string" ? payload.model : DEFAULT_MODEL;
  if (!payload.prompt) return NextResponse.json({ error: "missing_prompt" }, { status: 400 });
  const { model: _, ...forward } = payload;
  const upstream = await sapiomFetch()(sapiomUrl("image", `/run/${model}`), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(forward),
  });
  const text = await upstream.text();
  return new Response(text, {
    status: upstream.status,
    headers: { "content-type": upstream.headers.get("content-type") ?? "application/json" },
  });
}
```

**Client body**: `{ prompt: "a violet octopus, watercolor", model?: "fal-ai/flux/schnell", aspect_ratio?: "1:1", num_images?: 1, resolution?: "2K" }`. Note: model goes in **URL path**, not body. Response is fal's JSON shape — typically `{ images: [{ url, width, height }] }`.

**Public variant**: same recipe, drop `guardAiRequest`, add `isSapiomConfigured()` check. Useful for an interactive landing-page widget.

### Recipe 4 — Text-to-speech (ElevenLabs)

**When**: user asks for voiceover, podcast generator, audio narration.

**Route** (`src/app/api/ai/tts/route.ts`, auth-gated):
```ts
import { NextResponse } from "next/server";
import { guardAiRequest } from "@/lib/api-guard";
import { sapiomFetch, sapiomUrl } from "@/lib/sapiom";

export const runtime = "nodejs";
const DEFAULT_VOICE = "21m00Tcm4TlvDq8ikWAM"; // ElevenLabs Rachel
const MAX_CHARS = 5000;

export async function POST(request: Request) {
  const guard = await guardAiRequest();
  if (!guard.ok) return guard.response;
  const payload = (await request.json()) as { text?: string; voiceId?: string; model_id?: string; output_format?: string };
  const text = payload.text ?? "";
  if (!text) return NextResponse.json({ error: "missing_text" }, { status: 400 });
  if (text.length > MAX_CHARS) return NextResponse.json({ error: "text_too_long", max: MAX_CHARS }, { status: 400 });
  const voiceId = payload.voiceId ?? DEFAULT_VOICE;
  const upstream = await sapiomFetch()(sapiomUrl("audio", `/text-to-speech/${voiceId}`), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      text,
      model_id: payload.model_id ?? "eleven_multilingual_v2",
      output_format: payload.output_format ?? "mp3_44100_128",
    }),
  });
  return new Response(upstream.body, {
    status: upstream.status,
    headers: { "content-type": upstream.headers.get("content-type") ?? "audio/mpeg" },
  });
}
```

**Client body**: `{ text: "Hello world", voiceId?: "<elevenlabs-id>", model_id?: "eleven_multilingual_v2", output_format?: "mp3_44100_128" }`. Response is **binary audio**; in the client, do `const blob = await res.blob()` then `URL.createObjectURL(blob)` to play.

### Pattern recap (apply to every new AI feature)

1. **Pick the service** from the table above.
2. **Create the route** using the matching recipe — drop it under `src/app/api/ai/<feature>/route.ts`.
3. **Build the UI component** under `src/components/landing/<feature>.tsx` (public) or `src/components/dashboard/<feature>.tsx` (authed) and mount it in the relevant page (or add a sidebar entry in `template.config.ts → dashboard.sidebarItems` for an authed feature).
4. **Match the brand** — use `bg-[var(--brand-primary)]`, `font-heading`, etc. — never hardcoded hex.
5. **NEVER** import `openai`, `@anthropic-ai/sdk`, `fal-client`, or any provider SDK. The runtime only has `SAPIOM_API_KEY` — direct provider SDKs WILL fail at runtime.

## Stack

- **Framework:** Next.js 15 (App Router), React 19, TypeScript 5.7
- **Styling:** Tailwind v4 + CSS custom properties (`--brand-primary`, `--brand-secondary`, `--brand-accent`, `--brand-bg`, `--brand-text`, `--font-heading`, `--font-body`) — set in `app/layout.tsx` from `template.config.ts`
- **UI primitives:** local shadcn-style at `src/components/ui/` — Button, Badge, Card, Input
- **Icons:** `lucide-react` — config uses kebab-case names (`zap`, `shield`, `bar-chart-3`, etc.)
- **Auth:** `better-auth` with libsql/turso backend
- **DB:** Turso (libSQL) via `@libsql/client`
- **Package manager:** **npm** — `package-lock.json` present. DO NOT run `pnpm install` or `yarn`. Run `npm install` only if you genuinely added a dep.
- **Dev server:** `npm run dev` (started automatically when the sandbox boots)

## Working rules & editing conventions

- Before broad edits, read the files that define the current route/component/data flow. Do not assume this template matches a previous starter.
- Keep changes focused on the user's requested outcome. Avoid unrelated rewrites, new frameworks, or decorative abstractions.
- Prefer existing components and utilities in `src/components`, `src/lib`, and `template.config.ts`.
- After code changes, run the narrowest useful verification first, then broaden if the touched surface is shared. At minimum use `npm run build` for app-shape changes.
- If runtime is broken, inspect logs and patch the actual cause. Do not mask failures by deleting sections, disabling auth, bypassing redirects, or hardcoding fake data.
- Use Tailwind classes; reference brand colors via `bg-[var(--brand-primary)]`, `text-[var(--brand-text)]`, etc. — never hardcode hex values in components.
- Use `font-heading` / `font-body` Tailwind classes (mapped to brand fonts) instead of hardcoded `font-family`.
- Prefer importing `config` from `@/lib/config` (re-export) over `../../template.config`.
- Match existing icon convention: kebab-case `lucide-react` names in config; the component renders them.
- Existing UI primitives are intentionally minimal. Don't introduce a UI lib (Radix, MUI, etc.) — extend the local primitives if you need new variants.

## Frontend quality bar

- Build the real customer-facing experience, not a generic template wrapper or instructions page.
- Adapt copy, hierarchy, and visuals to the user's business and brand data. Avoid placeholder SaaS language when the prompt provides specifics.
- Keep pages responsive and working on mobile and desktop. Text must fit its container and interactive elements must remain reachable.
- Use the existing Tailwind v4 setup in `src/app/globals.css`. Do not add top-level `@apply` rules unless you have loaded the correct Tailwind reference context.
- Use real links, working buttons, forms with honest behavior, and clear empty/error states. A polished but broken site is not done.

## Common pitfalls (avoid)

- **Don't move `template.config.ts`.** Many components and `lib/config.ts` import it relative to project root.
- **Don't change pricing in components** when the user wants to change pricing — it's data-driven from `template.config.ts` (or `data/offers.json` at deploy).
- **Don't add new providers** to auth without updating both `template.config.ts` AND `src/lib/auth.ts`.
- **Don't run `npm run build`** as part of an edit — it's only used at deploy. The dev server picks up changes via HMR.
- **Don't introduce a new state management lib** (Zustand, Redux). For this template, server components + client components with `useState` is enough.

## When given vague asks

If the user says "make it look professional / bolder / more SaaS-y", that typically means:
- pick brand colors with stronger contrast (move `primary` to a confident hue, `accent` to its complement)
- pick a more distinctive `heading` font from Google Fonts (e.g. `Geist`, `Manrope`, `Plus Jakarta Sans`)
- tighten the hero headline to ≤8 words, action-led, outcome-focused
- replace placeholder testimonials with industry-specific names + roles

Do all of that in `template.config.ts` first, then check if any component-level adjustment is genuinely needed.

## E2B context

The template image copies this repo to `/home/user/app`, installs dependencies, and starts `npm run dev -- -p 3000` from `e2b.toml`. New sandboxes receive the latest image after the E2B template rebuild workflow runs on `main`; already-running sandboxes keep the old image until they restart.

## Sandbox v2 runtime env vars (set by parent vibiz when creating the sandbox)

The chassis itself does NOT read these from a `.env.example`; they are injected by the parent vibiz orchestrator at sandbox-create time and surfaced as process env to the dev server. If you are running the chassis standalone (no parent vibiz), only the auth + Sapiom vars below matter; the runner-specific vars are unused.

Runner-specific (required for `/api/internal/runner/*` to work):

- `VIBIZ_RUNNER_PUBLIC_KEY` — ES256 PEM SPKI of the orchestrator's signing key. Required by `src/lib/runner-auth.ts`; without it every runner request fails 500 `config_missing`. Format must be a full PEM block (`-----BEGIN PUBLIC KEY-----` … `-----END PUBLIC KEY-----`).
- `RUNNER_APP_DIR` — absolute path on disk where the chassis source lives inside the sandbox. Defaults to `/home/user/app` (matching the Dockerfile's `COPY . /home/user/app`). Override only for local smoke tests (`scripts/smoke-runner-config-patch.mjs` does this with a temp dir).
- `ORG_ID` — workspace identifier passed by the orchestrator for telemetry / log correlation. Not enforced by the chassis today (the JWT's `sub` claim is the source of truth) but reserved for future structured logging.

Existing chassis vars (already documented elsewhere; included here for the full sandbox env contract):

- `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN` — Turso connection for better-auth. Provisioned by Vibiz at deploy. Without them, `src/middleware.ts` short-circuits dashboard/login/signup routes to `/`.
- `BETTER_AUTH_SECRET` — better-auth session signing key. Required when auth is enabled.
- `SAPIOM_API_KEY` — gateway key for the AI provider. Required by `src/lib/sapiom.ts` (and any route gated by `guardAiRequest`).
- `VIBIZ_RUNTIME_BASE_URL` — chassis-side public URL for outbound callbacks (used by `src/lib/vibiz-runtime.ts`). Set by Vibiz at sandbox boot.
- `STRIPE_*` — only set when the parent vibiz wires Stripe; never check these in.
