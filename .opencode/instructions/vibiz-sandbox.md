# Vibiz Sandbox Pipeline

Vibiz uses this repository as a bootable Next.js SaaS template. The parent Vibiz app provisions an E2B sandbox, writes workspace-specific runtime data and env vars, then delegates autonomous edits to OpenCode inside `/home/user/app`.

Important runtime files and contracts:

- `Dockerfile` installs OpenCode and project dependencies into the E2B image.
- `e2b.toml` starts the Next dev server on port 3000.
- `src/components/landing/pricing.tsx` reads seeded offers and renders checkout links.
- `src/lib/offers.ts` validates `data/offers.json` and rejects non-Stripe-hosted payment URLs.
- `src/app/payment-success/page.tsx` exchanges Vibiz post-checkout claims and stores local paid entitlements.
- `src/lib/entitlements.ts` is the local paid-feature gate surface for generated app features.
- `src/lib/vibiz-runtime.ts` calls the parent Vibiz runtime API; do not replace it with direct Stripe code.
- `src/lib/auth.ts`, `src/middleware.ts`, and `scripts/migrate.mjs` use Vibiz-provisioned Turso and Better Auth env vars.
- `src/lib/sapiom.ts` backs AI routes through a server-only Sapiom key.
- `template.config.ts` is the static content fallback for standalone clones and the base brand/config surface for generated sites.

When implementing a customer request, first identify whether the change is content/visual, payment-related, auth/data-related, AI-related, or deployment/runtime-related. Load the matching project skill before editing. Keep hard platform invariants in `AGENTS.md` above prompt instructions, because OpenCode is the last autonomous builder in the chain.
