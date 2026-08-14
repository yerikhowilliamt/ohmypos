# OhMyPos — Project Handbook

**Status:** Draft v2
**Depends on:** PRD v1, System Design v2, ADR-001–011, ERD v2, Engineering Playbook v2

**Changelog (v1 → v2):** Updated for the three-role model (`KASIR`, `ADMIN`, `OWNER`) per ADR-011. Doc Index now lists 11 ADRs. Glossary and Troubleshooting entries updated to use `KASIR` instead of `CASHIER`, and a new troubleshooting entry added for role-restricted actions.

---

## 1. Architecture at a Glance

OhMyPos is a monorepo with two apps and shared packages, backing a POS + back-office system for a multi-branch F&B business, built on top of financial/reconciliation primitives ported from Kasync.

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

Core principle to keep in mind while working in this repo: **any operation that touches both financial state (`LedgerEntry`) and inventory state (`StockMovement`, `Payable`) happens in one database transaction.** This single rule is what ADR-004, ADR-006, and ADR-007 all depend on holding true at runtime — see Engineering Playbook Section 7.

## 2. Tech Stack

| Layer | Choice | Reference |
|---|---|---|
| Backend framework | NestJS (TypeScript) | System Design §9 |
| Frontend framework | Next.js (App Router) | System Design §5 |
| Component library | shadcn/ui | DESIGN.md |
| Typography | Plus Jakarta Sans (UI), JetBrains Mono (numeric) | DESIGN.md |
| Database | PostgreSQL (single instance) | System Design §3 |
| ORM | Prisma | ADR-003 |
| Validation | Zod (`packages/api-contracts`) | ADR-010 |
| Monorepo tooling | pnpm workspaces + Turborepo | ADR-002 |
| Auth | JWT, HttpOnly cookies, dual-token (access + refresh), role-based access (`KASIR`/`ADMIN`/`OWNER`) | System Design §5, §9, ADR-011 |
| Deployment | Docker Compose — `web`, `api`, `postgres` | System Design §10 |

## 3. Setup

1. `pnpm install` at the repo root — installs all workspaces.
2. Copy `.env.example` to `.env` in `apps/api` (database URL, JWT secrets) and `apps/web` (API base URL).
3. `pnpm --filter api prisma migrate dev` — applies migrations and generates the Prisma client.
4. `pnpm --filter api db:seed` — loads synthetic seed data (Section 6).
5. `turbo run dev` — runs `apps/api` and `apps/web` together.

## 4. Key Scripts

| Command | Purpose |
|---|---|
| `turbo run dev` | Run both apps in watch mode |
| `turbo run build` | Build all apps/packages |
| `turbo run lint typecheck test` | Full quality gate, same as CI |
| `pnpm --filter api prisma studio` | Inspect the database visually |
| `pnpm --filter api prisma migrate dev --name <name>` | Create a new migration |
| `pnpm --filter api db:seed` | Reset to synthetic seed data |

## 5. Documentation Index

| Doc | Covers |
|---|---|
| `00 - PRD.md` | Problem, goals, functional requirements per dashboard, confirmed branch policy |
| `01 - System Design.md` | Monorepo structure, module responsibilities, key flows, deployment |
| `02 - ADR.md` | The 11 architecturally significant decisions and their rationale |
| `03 - ERD.md` | Field-level schema, relationships, combined diagram |
| `04 - Engineering Playbook.md` | Day-to-day rules — transactions, branch scoping, role enforcement, testing, CI, Definition of Done |
| `DESIGN.md` | Design tokens, accessibility rules, component expectations |
| `05 - Project Handbook.md` (this doc) | Setup, glossary, constraints, contributing, troubleshooting |

## 6. Synthetic Data Safety

Seed data (`pnpm --filter api db:seed`) uses entirely fictional branches, suppliers, and product names — never real data from the friend's actual business. If real operational data is ever imported for testing (e.g. a real bank statement CSV for reconciliation testing), it must be anonymized first and never committed to the repo.

## 7. Glossary

| Term | Meaning |
|---|---|
| HPP | Harga Pokok Penjualan — cost of goods sold, computed from a product's recipe |
| Utang | Debt owed to a supplier for an unpaid purchase, tracked as a `Payable` |
| Kas Awal | Opening cash — the starting cash balance, centralized (not per-branch) |
| Reconciliation | Matching bank statement transactions against `LedgerEntry` records via `Allocation` — restricted to `ADMIN`/`OWNER` (ADR-011) |
| Central Purchase | A `SupplierPurchase` with `branchId = null` — bought centrally, not by one branch |
| Flow Indicator | The signature UI motif for any inflow/outflow number (DESIGN.md) |
| Ported module | A module copied and adapted from Kasync, unchanged in responsibility |
| Kasir | Cashier role — branch-scoped access only (`User.branchId` required), cannot create users or perform reconciliation matching (ADR-011) |
| Admin | Staff role with all-branch access and reconciliation-matching permission, but cannot create users (ADR-011) |
| Owner | Business owner role — all-branch access, the only role that can create/deactivate `User` records (ADR-011) |

## 8. Known Constraints & Scope Boundaries

- Single business, single currency (IDR), no multi-tenancy in v1 (PRD §3 Non-goals).
- Stock and cash are centralized pools; there is no per-branch balance anywhere in the schema (ADR-004) — do not build features that assume otherwise without a new ADR revisiting this.
- No message queue or background job runner in v1 — everything is synchronous request/response (System Design §9).
- Reports are computed at query time, not from materialized views (ADR-008) — expect this to need revisiting once real transaction volume is known.
- PDF bank statement parsing is out of scope, same as Kasync (PRD §10).
- User creation is `OWNER`-only with no approval workflow or self-registration — do not build an `ADMIN`-initiates/`OWNER`-approves flow without a new ADR revisiting ADR-011.

## 9. Contributing & Workflow

1. Every change that touches money or stock must satisfy the transaction-boundary rule (Engineering Playbook §7) — this is checked in self-review (Playbook §16), not just trusted.
2. Every change to a Zod schema in `packages/api-contracts` must update both `apps/api` and `apps/web` in the same PR — the whole point of ADR-010 is that these can't drift, so don't introduce drift by splitting the change across PRs.
3. Any change to an endpoint's role or branch access must apply `RoleGuard` and/or `BranchScopeGuard` explicitly (Playbook §8) — never rely on frontend routing alone.
4. New ADRs follow the trigger criteria in Playbook §17 — when superseding an existing ADR, mark it "Superseded," don't delete it (see ADR-009 → ADR-010 → ADR-011 for the pattern already in this repo).
5. Run `turbo run lint typecheck test` locally before pushing — CI runs the same command, so a local pass should mean a CI pass.

## 10. Troubleshooting

| Symptom | Likely cause | Where to look |
|---|---|---|
| Stock and ledger numbers disagree after a sale | A step in the `Sale` flow ran outside the transaction | System Design §6.1, Playbook §7 |
| Duplicate/incorrect stock balance under concurrent sales | Missing `FOR UPDATE` lock on `RawMaterial` | ADR-007 |
| Frontend form accepts something the backend then rejects | A Zod schema was updated on one side but not the other | ADR-010, Playbook §4 |
| An expense shows up before money actually left the account | A `SupplierPurchase` incorrectly created a `LedgerEntry` while `paymentStatus = UNPAID` | ADR-006 |
| A `KASIR` can see or write data for another branch | `BranchScopeGuard` missing on that endpoint | Playbook §8 |
| A `KASIR` or `ADMIN` can create a user, or a non-`OWNER` can perform reconciliation matching | `RoleGuard` missing or misconfigured on that endpoint | ADR-011, Playbook §8 |
| Historical P&L changed after a raw material price update | `SaleItem.hppAtSale` wasn't snapshotted correctly at sale time | ADR-005 |