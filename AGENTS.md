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
- Do not change post-checkout redirect behavior. Stripe returns buyers to `/payment-success?claim=...`, which exchanges the Vibiz claim, stores a local entitlement, and revalidates that entitlement with Vibiz before unlocking paid features on future visits.
- `NEXT_PUBLIC_VIBIZ_DEPLOY=1` marks Vibiz-managed deployments. Do not remove the guard that prevents placeholder pricing on managed sites.
- Turso, Sapiom, and Better Auth env vars are provisioned by Vibiz. Do not mint keys manually, expose server keys to the browser, or commit real secrets.
- `.env` and `.env.*` files are runtime-only. Only create or modify them when the user or parent Vibiz agent explicitly provides a non-Vibiz third-party key needed for the app to run. Never add Stripe keys.

## Hard rules — DO NOT EDIT these files

- `src/middleware.ts` — auth gating
- `src/lib/auth.ts`, `src/lib/auth-client.ts` — better-auth wiring (unless explicitly asked to change auth)
- `src/lib/api-guard.ts` — API protection
- `src/lib/sapiom.ts` — AI provider gateway helper (extend by adding new routes that USE it; never modify it)
- `src/components/VibizSelectBridge.tsx` — Vibiz dashboard select-element bridge
- `src/app/api/auth/[...all]/route.ts` — better-auth route handler
- `scripts/migrate.mjs` — DB migration runner
- `next.config.ts`, `tsconfig.json`, `package.json`, `tailwind.config.ts`, `postcss.config.mjs` — only edit if the user explicitly asks for build / dep changes

If a request seems to require touching one of the DO NOT EDIT items, prefer asking for clarification by writing the answer in plain language; do not edit silently.

## Single source of truth: `template.config.ts`

90% of edits go here, NOT into components. The landing page reads brand, copy, hero, features, testimonials, pricing, FAQ, and dashboard sidebar items from a single typed object. Change the object → site updates.

Touch component files **only** when the user asks for new structure (new section, removed section, layout change). For copy/colors/fonts/features/items, edit `template.config.ts` and stop.

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
│   │   └── app-url.ts         ← URL helpers
│   └── middleware.ts          ← DO NOT EDIT — handles auth gating
├── data/
│   └── offers.json            ← live pricing seeded by Vibiz at deploy
└── scripts/
    └── migrate.mjs            ← DB migration runner — DO NOT EDIT
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
