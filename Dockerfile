# VIDEON v3 – Docker image for Coolify / self-hosted.
# Context: repository root (videon-v3).
# Build:  docker build -t videon-v3 .
# Run:    docker run -p 3010:3010 -e AUTH_SECRET=… -e DATABASE_URL=… videon-v3
#
# Sibling design system: fetches github.com/chbrdk/msqdx-ui at MSQDX_UI_REF next
# to the app so file: deps (`../../../msqdx-ui/…`) resolve.
# Coolify: Dockerfile path `Dockerfile`, domain https://videon.projects-a.plygrnd.tech

ARG NODE_IMAGE=node:22-bookworm-slim

# ---- Base ----
FROM ${NODE_IMAGE} AS base
WORKDIR /workspace
ENV NEXT_TELEMETRY_DISABLED=1
RUN apt-get update && apt-get install -y --no-install-recommends \
    git \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/* \
    && corepack enable

# ---- Design system (msqdx-ui) ----
# Pin a commit (not floating `main`) so Coolify cannot reuse a stale `ds` layer.
# Bump MSQDX_UI_REF whenever videon needs a newer primitive from chbrdk/msqdx-ui.
FROM base AS ds
ARG MSQDX_UI_REPO=https://github.com/chbrdk/msqdx-ui.git
ARG MSQDX_UI_REF=41b5deed7254eabcab0fe8e10c2294ed76e38cad
RUN git init /workspace/msqdx-ui \
    && cd /workspace/msqdx-ui \
    && git remote add origin "${MSQDX_UI_REPO}" \
    && git fetch --depth 1 origin "${MSQDX_UI_REF}" \
    && git checkout --force FETCH_HEAD \
    && test "$(git rev-parse HEAD)" = "${MSQDX_UI_REF}" \
    && printf 'node-linker=hoisted\n' > .npmrc \
    && pnpm install --frozen-lockfile \
    && pnpm build \
    # Drop install trees before COPY — full node_modules OOMs Coolify (exit 255).
    && rm -rf node_modules \
    && find . -type d -name node_modules -prune -exec rm -rf {} +

# ---- Builder ----
FROM base AS builder
ENV NODE_ENV=development
COPY --from=ds /workspace/msqdx-ui /workspace/msqdx-ui
COPY . /workspace/videon-v3
WORKDIR /workspace/videon-v3

# --include=dev: Coolify may inject NODE_ENV=production as a build ARG before this
# stage; without it, typescript/devDeps are omitted and `next build` fails.
RUN --mount=type=cache,target=/root/.npm \
    npm ci --no-audit --no-fund --include=dev

# Sibling layout: …/workspace/videon-v3 + …/workspace/msqdx-ui
RUN test -d /workspace/msqdx-ui/packages/ui/src \
    && test -f /workspace/msqdx-ui/packages/ui-tokens/dist/index.js \
    && rm -rf /workspace/msqdx-ui/node_modules \
    && ln -s /workspace/videon-v3/node_modules /workspace/msqdx-ui/node_modules \
    && test -d /workspace/msqdx-ui/node_modules/@types/react

ENV NODE_ENV=production
ENV NODE_OPTIONS=--max-old-space-size=6144
# Blank secrets only for this RUN so Coolify buildtime injection cannot hit Postgres/LLM at compile.
# AUTH_SECRET needs a non-secret ≥32-char placeholder: Next collects /api/auth at build time.
RUN DATABASE_URL= \
    OPENROUTER_API_KEY= \
    PLEXON_SERVICE_SECRET= \
    PLEXON_AUTH_URL= \
    AUTH_SECRET=videon-docker-build-placeholder-not-for-runtime \
    VIDEON_OBJECT_STORAGE_SECRET_ACCESS_KEY= \
    npm run build \
    && rm -f /workspace/msqdx-ui/node_modules

# ---- Runner ----
FROM ${NODE_IMAGE} AS runner
WORKDIR /workspace/videon-v3

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3010
ENV HOSTNAME=0.0.0.0
ENV PLEXON_FEDERATION_MODE=dummy
EXPOSE 3010

# Coolify Dockerfile healthchecks shell out to curl/wget.
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    ca-certificates \
    ffmpeg \
    && rm -rf /var/lib/apt/lists/*

COPY --from=builder /workspace/videon-v3/package.json ./package.json
COPY --from=builder /workspace/videon-v3/package-lock.json ./package-lock.json
COPY --from=builder /workspace/videon-v3/node_modules ./node_modules
COPY --from=builder /workspace/videon-v3/packages ./packages
COPY --from=builder /workspace/videon-v3/migrations ./migrations
COPY --from=builder /workspace/videon-v3/apps/web/package.json ./apps/web/package.json
COPY --from=builder /workspace/videon-v3/apps/web/.next ./apps/web/.next
COPY --from=builder /workspace/videon-v3/apps/web/next.config.ts ./apps/web/next.config.ts
COPY --from=builder /workspace/videon-v3/apps/web/tsconfig.json ./apps/web/tsconfig.json
COPY --from=builder /workspace/videon-v3/scripts ./scripts
COPY --from=builder /workspace/msqdx-ui /workspace/msqdx-ui

RUN chmod +x ./scripts/docker-entrypoint.sh

WORKDIR /workspace/videon-v3
CMD ["./scripts/docker-entrypoint.sh"]
