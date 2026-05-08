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
- Customer sites are Stripe-free. Do not install the `stripe` package, create `lib/stripe.ts`, add `/api/stripe/*` routes, add checkout session code, or add `STRIPE_SECRET_KEY` anywhere.
- Stripe checkout is handled by platform-minted Payment Links. Attribution and webhooks stay in the parent Vibiz app.
- Do not change post-checkout redirect behavior. If a redirect looks wrong, call it out instead of patching around it in this template.
- `NEXT_PUBLIC_VIBIZ_DEPLOY=1` marks Vibiz-managed deployments. Do not remove the guard that prevents placeholder pricing on managed sites.
- Turso, Sapiom, and Better Auth env vars are provisioned by Vibiz. Do not mint keys manually, expose server keys to the browser, or commit real secrets.
- `.env` and `.env.*` files are runtime-only. Only create or modify them when the user or parent Vibiz agent explicitly provides a non-Vibiz third-party key needed for the app to run. Never add Stripe keys.

## Working Rules

- Before broad edits, read the files that define the current route/component/data flow. Do not assume this template matches a previous starter.
- Keep changes focused on the user's requested outcome. Avoid unrelated rewrites, new frameworks, or decorative abstractions.
- Prefer existing components and utilities in `src/components`, `src/lib`, and `template.config.ts`.
- After code changes, run the narrowest useful verification first, then broaden if the touched surface is shared. At minimum use `npm run build` for app-shape changes.
- If runtime is broken, inspect logs and patch the actual cause. Do not mask failures by deleting sections, disabling auth, bypassing redirects, or hardcoding fake data.

## Frontend Quality Bar

- Build the real customer-facing experience, not a generic template wrapper or instructions page.
- Adapt copy, hierarchy, and visuals to the user's business and brand data. Avoid placeholder SaaS language when the prompt provides specifics.
- Keep pages responsive and working on mobile and desktop. Text must fit its container and interactive elements must remain reachable.
- Use the existing Tailwind v4 setup in `src/app/globals.css`. Do not add top-level `@apply` rules unless you have loaded the correct Tailwind reference context.
- Use real links, working buttons, forms with honest behavior, and clear empty/error states. A polished but broken site is not done.

## E2B Context

The template image copies this repo to `/home/user/app`, installs dependencies, and starts `npm run dev -- -p 3000` from `e2b.toml`. New sandboxes receive the latest image after the E2B template rebuild workflow runs on `main`; already-running sandboxes keep the old image until they restart.
