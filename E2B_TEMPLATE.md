# E2B template — `vibiz-saas-opencode-fab-test`

This repo is the source of truth for the E2B sandbox template every Vibiz workspace boots from. The Dockerfile + `e2b.toml` at the repo root are wired to the existing template (id `pxyqvs4r02cch8qbshvw`). CI rebuilds the template image automatically on every push to `main`.

## How it works

```
  push to main
       │
       ▼
.github/workflows/e2b-rebuild.yml
       │ 1. checks out this repo
       │ 2. installs @e2b/cli
       │ 3. e2b template build --name vibiz-saas-opencode-fab-test
       ▼
E2B template `pxyqvs4r02cch8qbshvw` ← new version
       │
       ▼
Next sandbox-deploy in vibiz/ uses the fresh image
```

**Important:** in-flight sandboxes keep running on the old image until E2B's idle reaper kills them. New `Sandbox.create()` calls get the rebuilt image immediately.

## What's baked into the image

| Layer | Purpose |
|---|---|
| `e2bdev/code-interpreter:latest` base | Node 22, git, curl, build tools, `user` non-root account |
| `opencode` CLI on PATH | Autonomous multi-file edits via `sandbox_run_opencode` from the agent |
| Repo source at `/home/user/app` | Result of `COPY . /home/user/app` filtered by `.dockerignore` |
| `AGENTS.md` + `.opencode/` | Project rules, config, and skills loaded by OpenCode inside the sandbox |
| Pre-installed `node_modules` | Saves 60–120s per boot |
| Warm Next build cache | Faster first HMR (skipped if `npm run build` needs runtime env) |

## Required repo secret

CI needs `E2B_ACCESS_TOKEN` (a **personal access token**, distinct from the runtime SDK's `E2B_API_KEY`) to authenticate with E2B for template management operations. One-time setup:

1. Open <https://e2b.dev/dashboard?tab=personal> → **Personal access tokens** → create one.
2. In this repo, go to **Settings → Secrets and variables → Actions → New repository secret**.
3. Name: `E2B_ACCESS_TOKEN`. Value: the token from step 1.
4. Push any change to `main` (or use **Actions → e2b template rebuild → Run workflow**) to verify.

> **Don't confuse the two tokens.** `E2B_API_KEY` (set in `vibiz` runtime envs) is for `Sandbox.create()` SDK calls. `E2B_ACCESS_TOKEN` (this one) is for `e2b template build` CLI calls. Different scope, different dashboard tab.

## Manual rebuild

CI handles every push to main, but if you need to rebuild from a feature branch or test locally:

```bash
# One-time install
npm install -g @e2b/cli

# Auth (interactive — opens a browser)
e2b auth login

# Build (run from the repo root — Dockerfile + e2b.toml live here)
e2b template build --name vibiz-saas-opencode-fab-test
```

The CLI prints the resulting template id and version. Existing sandboxes booted from the old image are unaffected.

## Where this template is consumed

The `vibiz` repo (`Vibiz-ai/vibiz`) reads the template id at runtime via `process.env.E2B_SANDBOX_TEMPLATE_ID`:

- `src/trigger-worflows/sandbox-bootstrap.ts:147` — reads it when a workspace's first sandbox boots.
- Set in **Trigger.dev** project env vars + **Vercel** env vars to `pxyqvs4r02cch8qbshvw`.

Switching templates is a env-var change in Trigger + Vercel — no code change in `vibiz` needed.

## Why this lives here, not in `vibiz`

Template source belongs next to template content. Previously the Dockerfile lived at `vibiz/e2b/vibiz-saas-opencode/Dockerfile` and `git clone`'d this repo at build time — every change here required someone to remember to rebuild over there. Moving the config into this repo collapses that into one CI run on push to main.
