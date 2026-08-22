# syntax=docker/dockerfile:1
# Production image for apps/api. Build from the repo root:
#   docker build -f apps/api/Dockerfile -t ohmypos-api .
#
# Unlike Dockerfile.dev (bind-mounted source, watch mode), this bakes a
# compiled, dependency-pruned image — no source, no dev toolchain, no
# workspace packages this app doesn't actually use. Follows Turborepo's
# documented prune->install->run pattern for pnpm monorepos:
# https://turbo.build/repo/docs/guides/tools/docker

FROM node:22-alpine AS base
RUN apk add --no-cache libc6-compat
# Prisma needs openssl at runtime to load its query engine (ADR-003).
RUN apk add --no-cache openssl
RUN corepack enable

# ---- Prune: cut the monorepo down to what `api` actually needs ----
FROM base AS pruner
WORKDIR /repo
COPY . .
# npm, not pnpm, for the global install — pnpm's global bin dir isn't on
# PATH by default in this image and turbo itself has no workspace deps.
RUN npm install -g turbo@2.10.10
RUN turbo prune api --docker

# ---- Install pruned deps, then build ----
FROM base AS builder
WORKDIR /repo

COPY --from=pruner /repo/out/json/ .
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
  pnpm install --frozen-lockfile \
  --store-dir /pnpm/store \
  --fetch-retries 5 \
  --fetch-retry-maxtimeout 120000 \
  --network-concurrency 4

COPY --from=pruner /repo/out/full/ .

# Needed before build/typecheck touch apps/api — src/generated is gitignored.
RUN pnpm --filter api exec prisma generate

RUN npm install -g turbo@2.10.10
RUN turbo run build --filter=api

# ---- Runtime: only the compiled output + its production deps ----
FROM base AS runner
WORKDIR /repo

RUN addgroup --system --gid 1001 nodejs \
  && adduser --system --uid 1001 nestjs

COPY --from=builder /repo/apps/api/dist ./apps/api/dist
COPY --from=builder /repo/apps/api/prisma ./apps/api/prisma
COPY --from=builder /repo/apps/api/src/generated ./apps/api/src/generated
COPY --from=builder /repo/apps/api/package.json ./apps/api/package.json
COPY --from=builder /repo/node_modules ./node_modules
COPY --from=builder /repo/apps/api/node_modules ./apps/api/node_modules
# node_modules/@ohmypos/api-contracts is a symlink to ../../packages/api-contracts
# (pnpm workspace linking) — the link target has to exist too, not just the link.
COPY --from=builder /repo/packages ./packages

USER nestjs
WORKDIR /repo/apps/api

EXPOSE 4015

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||4015)+'/api/v1/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

# Deliberately does not run `prisma migrate deploy` on start — applying
# migrations is a separate, explicit step, not something a container boot
# should do silently to a production database.
CMD ["node", "dist/main"]
