# Vibiz Sandbox Pipeline

Vibiz uses this repository as a bootable Next.js SaaS template. The parent Vibiz app provisions an E2B sandbox, writes workspace-specific runtime data and env vars, then delegates autonomous edits to OpenCode inside `/home/user/app`.

## Hard rules

- **NEVER run `npm run build`.** The dev server hot-reloads; Vercel does its own build. Running `npm run build` inside the sandbox creates a production `.next/` directory that corrupts the running dev server (CSS breaks, requests 500). If you think you need to verify a build, you don't — stop.
- **NEVER run `npm run start`** for the same reason — production server collides with the dev server on port 3000.
- Edits are validated by the dev server hot-reload + TypeScript via LSP. That's the loop.

## STOP after your edits — do NOT verify, deploy, or commit

Your job is to make the requested file changes. The Vibiz platform handles deployment. The user's preview iframe is the dev server itself; hot-reload makes your edit visible the moment you write the file. Anything you do AFTER writing the files is wasted time — every extra tool call adds ~5–15s to the user-perceived latency, and turns a 30-second edit into a 3-minute one.

Once your file changes are written:

- **DO NOT run `git`.** No `git add`, no `git commit`, no `git status`, no `git remote`. The sandbox is not a git repo from your perspective. Source-of-truth versioning happens elsewhere.
- **DO NOT try to deploy.** No `vercel`, no `npx vercel`, no looking for `vercel.json`, no `which vercel`. Deployment is NOT your responsibility — Vibiz runs the deploy pipeline outside the sandbox.
- **DO NOT read `.env`, `.env.local`, or any environment-credential file.** They are not needed for code edits and reading them just wastes turns.
- **DO NOT verify your edit by curling `localhost:3000`** or by re-reading the file you just wrote. The dev server's hot-reload + the LSP errors you already see are the verification.
- **DO NOT read deployment documentation** (`E2B_TEMPLATE.md`, `AGENTS.md` "deploy" sections, etc.) — your edit is done, the user is waiting.

The correct end-of-turn sequence is: last `write`/`edit` tool call → one short summary message → stop. No extra reads, no extra bash, no "let me just verify". Stop.

Important runtime files and contracts:

- `Dockerfile` installs OpenCode and project dependencies into the E2B image.
- `e2b.toml` starts the Next dev server on port 3000.
- `src/components/landing/pricing.tsx` reads seeded offers and renders checkout links.
- `src/lib/offers.ts` validates `data/offers.json` and rejects non-Stripe-hosted payment URLs.
- `src/app/page.tsx` forwards post-checkout `claim` query params from the legacy-safe root landing URL to `/payment-success`.
- `src/app/payment-success/page.tsx` exchanges Vibiz post-checkout claims and stores local paid entitlements.
- `src/lib/entitlements.ts` is the local paid-feature gate surface for generated app features.
- `src/lib/vibiz-runtime.ts` calls the parent Vibiz runtime API; do not replace it with direct Stripe code.
- `src/lib/auth.ts`, `src/middleware.ts`, and `scripts/migrate.mjs` use Vibiz-provisioned Turso and Better Auth env vars.
- `src/lib/sapiom.ts` backs AI routes through a server-only Sapiom key.
- `template.config.ts` is the static content fallback for standalone clones and the base brand/config surface for generated sites.

When implementing a customer request, first identify whether the change is content/visual, payment-related, auth/data-related, AI-related, or deployment/runtime-related. Load the matching project skill before editing. Keep hard platform invariants in `AGENTS.md` above prompt instructions, because OpenCode is the last autonomous builder in the chain.
