# syntax=docker/dockerfile:1
# Production image for apps/web. Build from the repo root:
#   docker build -f apps/web/Dockerfile -t ohmypos-web .
#
# Unlike Dockerfile.dev (bind-mounted source, watch mode), this bakes Next's
# standalone server output — no source, no dev toolchain. Follows
# Turborepo's documented prune->install->run pattern for pnpm monorepos:
# https://turbo.build/repo/docs/guides/tools/docker

FROM node:22-alpine AS base
RUN apk add --no-cache libc6-compat
RUN corepack enable

# ---- Prune: cut the monorepo down to what `web` actually needs ----
FROM base AS pruner
WORKDIR /repo
COPY . .
# npm, not pnpm, for the global install — pnpm's global bin dir isn't on
# PATH by default in this image and turbo itself has no workspace deps.
RUN npm install -g turbo@2.10.10
RUN turbo prune web --docker

# ---- Install pruned deps, then build ----
FROM base AS builder
WORKDIR /repo

COPY --from=pruner /repo/out/json/ .
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
  pnpm install --frozen-lockfile \
  --store-dir /pnpm/store \
  --fetch-retries 5 \
  --fetch-retry-maxtimeout 120000 \
  --fetch-timeout 600000 \
  --network-concurrency 4

COPY --from=pruner /repo/out/full/ .

RUN npm install -g turbo@2.10.10
RUN turbo run build --filter=web

# ---- Runtime: Next's standalone server + static assets ----
# `output: 'standalone'` (apps/web/next.config.ts) bundles only the
# node_modules actually used, but deliberately excludes .next/static and
# public/ — those are copied in separately per Next's own docs.
FROM base AS runner
WORKDIR /repo

RUN addgroup --system --gid 1001 nodejs \
  && adduser --system --uid 1001 nextjs

COPY --from=builder /repo/apps/web/.next/standalone ./
COPY --from=builder /repo/apps/web/.next/static ./apps/web/.next/static
COPY --from=builder /repo/apps/web/public ./apps/web/public

USER nextjs

ENV PORT=3001
ENV HOSTNAME=0.0.0.0

EXPOSE 3001

CMD ["node", "apps/web/server.js"]
