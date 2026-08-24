# OhMyPos

POS + back-office system for a multi-branch F&B business, built on top of financial/reconciliation primitives ported from Kasync.

**Depends on:** PRD v1.1, System Design v4, ADR-001–012, ERD v3, Engineering Playbook v3, Project Handbook v3

---

## Architecture at a Glance

OhMyPos is a monorepo with two apps and shared packages.

```
ohmypos/
├── apps/
│   ├── api/      NestJS backend — modular monolith, single Postgres DB
│   └── web/       Next.js frontend — shadcn/ui, consumes apps/api via REST only
├── packages/
│   ├── api-contracts/   Zod schemas — single source of truth for request/response
│   │                      shapes and their inferred TypeScript types (ADR-010)
│   ├── ui/               Shared shadcn/ui component wrappers + design tokens
│   │                      from DESIGN.md
│   └── config/           Shared ESLint/Prettier/TS config
```

Core principle to keep in mind while working in this repo: **any operation that touches both financial state (`LedgerEntry`) and inventory state (`StockMovement`, `Payable`) happens in one database transaction.** This single rule is what ADR-004, ADR-006, and ADR-007 all depend on holding true at runtime — see [Engineering Playbook](./docs/04%20-%20Engineering_Playbook.md) Section 7.

## Tech Stack

| Layer              | Choice                                                                                            | Reference                     |
| ------------------ | ------------------------------------------------------------------------------------------------- | ----------------------------- |
| Backend framework  | NestJS (TypeScript)                                                                               | System Design §9              |
| Frontend framework | Next.js (App Router)                                                                              | System Design §5              |
| Component library  | shadcn/ui                                                                                         | DESIGN.md                     |
| Typography         | Plus Jakarta Sans (UI), JetBrains Mono (numeric)                                                  | DESIGN.md                     |
| Database           | PostgreSQL (single instance)                                                                      | System Design §3              |
| ORM                | Prisma                                                                                            | ADR-003                       |
| Validation         | Zod (`packages/api-contracts`)                                                                    | ADR-010                       |
| Monorepo tooling   | pnpm workspaces + Turborepo                                                                       | ADR-002                       |
| Auth               | JWT, HttpOnly cookies, dual-token (access + refresh), role-based access (`KASIR`/`ADMIN`/`OWNER`) | System Design §5, §9, ADR-011 |
| Deployment         | Docker Compose — `web`, `api`, `postgres`                                                         | System Design §10             |

## Setup

1. `pnpm install` at the repo root — installs all workspaces.
2. Copy `.env.example` to `.env` in `apps/api` (database URL, JWT secrets) and `apps/web` (server-only API target).
3. `docker compose up -d postgres` — starts the database (see the port note below).
4. `pnpm --filter api prisma migrate dev` — applies migrations and generates the Prisma client. _(Phase 1 onward — Prisma is not installed yet.)_
5. `pnpm --filter api db:seed` — loads synthetic seed data (see [Synthetic Data Safety](#synthetic-data-safety) below).
6. `pnpm dev` — runs `apps/api` and `apps/web` together via Turborepo.

### Ports

| Service    | Host port | Notes                                                                                        |
| ---------- | --------- | -------------------------------------------------------------------------------------------- |
| `api`      | 4015      | Routes are served under `/api/v1` (PRD §6)                                                    |
| `web`      | 3001      | Next.js dev server                                                                             |
| `postgres` | **5433**  | Mapped off 5432 because a native PostgreSQL commonly already holds that port on the dev machine |

`docker compose up` brings up all three as containers. The faster daily loop is
`docker compose up -d postgres` plus a host-side `pnpm dev`.

### Web/API deployment

Browser requests use the web origin's `/api/v1` path. A Next.js BFF Route
Handler streams those requests to `INTERNAL_API_BASE_URL`, which keeps HttpOnly
authentication cookies first-party and visible to Next.js route gating. On
Vercel, set `INTERNAL_API_BASE_URL` to the Render API URL including `/api/v1`,
for example `https://your-api.onrender.com/api/v1`. Do not set the browser API
base to the Render origin. The BFF is deliberately a Route Handler rather than
an external rewrite because Vercel's rewrite resolver can reject Render targets
with `DNS_HOSTNAME_RESOLVED_PRIVATE`.

## Key Scripts

| Command                                              | Purpose                       |
| ---------------------------------------------------- | ----------------------------- |
| `turbo run dev`                                      | Run both apps in watch mode   |
| `turbo run build`                                    | Build all apps/packages       |
| `turbo run lint typecheck test`                      | Full quality gate, same as CI |
| `pnpm --filter api prisma studio`                    | Inspect the database visually |
| `pnpm --filter api prisma migrate dev --name <name>` | Create a new migration        |
| `pnpm --filter api db:seed`                          | Reset to synthetic seed data  |

## Documentation Index

| Doc                            | Covers                                                                                                                            |
| ------------------------------ | --------------------------------------------------------------------------------------------------------------------------------- |
| `00 - PRD.md`                  | Problem, goals, functional requirements per dashboard, confirmed branch policy                                                    |
| `01 - System Design.md`        | Monorepo structure, module responsibilities, three-role routing, key flows, deployment                                            |
| `02 - ADR.md`                  | The 12 architecturally significant decisions and their rationale                                                                  |
| `03 - ERD.md`                  | Field-level schema, relationships, combined diagram, porting notes                                                                |
| `04 - Engineering Playbook.md` | Day-to-day rules — transactions, branch scoping, role enforcement, testing, CI, Definition of Done                                |
| `DESIGN.md`                    | Design tokens, accessibility rules, component expectations                                                                        |
| `AGENTS.md`                    | Kasync source location, glossary, scope boundaries, contributing workflow, troubleshooting — context for AI agents and future-you |
| `README.md` (this doc)         | Architecture overview, tech stack, setup, scripts                                                                                 |

## Synthetic Data Safety

Seed data (`pnpm --filter api db:seed`) uses entirely fictional branches, suppliers, and product names — never real data from the friend's actual business. If real operational data is ever imported for testing (e.g. a real bank statement CSV for reconciliation testing), it must be anonymized first and never committed to the repo.
