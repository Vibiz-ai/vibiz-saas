# E2B custom template — vibiz-saas pre-baked with deps + opencode CLI.
#
# Built from the in-repo source via `e2b template build` (run from
# the repo root). Replaces the previous setup that lived in the
# `vibiz` repo and `git clone`'d this repo at build time.
#
# Result: every sandbox boot starts on a fully-installed Next.js
# project at /home/user/app with `opencode` on PATH for autonomous
# multi-file edits. No runtime npm install (~60-120s saved per boot).
#
# Build:
#   e2b template build --name vibiz-saas-opencode-fab-test
#
# CI: .github/workflows/e2b-rebuild.yml rebuilds automatically on
# every push to main.

FROM e2bdev/code-interpreter:latest

# E2B base image runs as `user` by default; keep that so file
# ownership stays consistent when our `sandbox.files.write` calls
# (from the deploy task) land at runtime.
USER user
WORKDIR /home/user

# --- 1. opencode CLI (https://opencode.ai) ----------------------
# `sandbox_run_opencode(prompt)` shells out to this for autonomous
# multi-file tasks; the chat-v2 agent uses `sandbox_write_file` for
# single-file surgical edits.
RUN curl -fsSL https://opencode.ai/install | bash \
    && echo 'export PATH="$HOME/.opencode/bin:$PATH"' >> ~/.bashrc \
    && /home/user/.opencode/bin/opencode --version || true

ENV PATH="/home/user/.opencode/bin:${PATH}"

# --- 2. project source at /home/user/app ------------------------
# COPY the build context (this repo) into the image. Build context
# is filtered by .dockerignore so node_modules / .next / .git don't
# bloat the upload. Whatever is on the branch being built becomes
# the snapshot — CI runs on push-to-main, so prod images always
# track main.
COPY --chown=user:user . /home/user/app
WORKDIR /home/user/app

# --- 3. pre-install node_modules --------------------------------
# The expensive layer. Doing this at template-build time means every
# sandbox starts with deps already installed (boot time dominated by
# Sandbox.create ≈3s instead of npm install 60-120s). Honor lockfile
# via `npm ci` when present, else fall back to `npm install`.
RUN if [ -f package-lock.json ]; then \
        npm ci --silent; \
    else \
        npm install --silent; \
    fi

# --- 4. warm the Next build cache -------------------------------
# Optional; some projects can't build without runtime env vars so
# failure is non-fatal. When it works, first HMR is faster.
RUN npm run build --silent || echo "[template] build skipped (likely needs runtime env)"

WORKDIR /home/user

# Healthcheck-ish breadcrumb for debugging templates
RUN echo "vibiz-saas-opencode template built $(date)" > /home/user/.template-info
