# OhMyPos — System Design

**Status:** Draft v4
**Depends on:** PRD v1.1, ADR-001–012, ERD v3
**Related project:** Kasync (source of the ported financial/reconciliation modules, and precedent for the Next.js + NestJS split)

**Changelog (v3 → v4):** Section 4's module table now lists `Import` and `Reconciliation`, which were missing despite PRD §5.7 requiring CSV bank statement import and Section 6.5 below describing it. The `Auth`/`Users` row is reclassified from "Ported" to "Ported pattern, re-implemented" — ADR-011 designs that module fresh, and Kasync's version carries self-registration and self-deletion paths that contradict it (ERD v3 §7).

**Changelog (v2 → v3):** Sections 4, 5, and 8 updated for the three-role model (`KASIR`, `ADMIN`, `OWNER`) per ADR-011 — previously only described a binary cashier/owner split, with no defined role for `ADMIN`. `ADMIN`'s frontend access is now explicitly scoped to Reconciliation and Master Data only (not full back-office).

---

## 1. Overview

OhMyPos is a **monorepo** containing two deployable applications and shared internal packages:

- `apps/api` — the NestJS backend, structured as a **modular monolith** (one app, one PostgreSQL database, one container). This continues the same architecture style Kasync uses (ADR-001 in Kasync), for the same reasons — single developer, low operational complexity, and low transaction volume for a small multi-branch business.
- `apps/web` — the Next.js frontend, using shadcn/ui components and the design tokens defined in `DESIGN.md`.

The frontend is **decoupled from the backend and consumes it purely via REST** — no Next.js API routes acting as backend logic. This is the same frontend/backend relationship Kasync already established (ADR-007 in Kasync), just now organized as a monorepo instead of requiring two separately-managed repos.

The backend's modules are organized into two groups:

- **Ported modules** — copied and adapted from Kasync, unchanged in responsibility: `Account`, `Category`, `Branch`, `LedgerEntry`, `Allocation`, `MatchingEngine`, `Import`, `Reconciliation`, plus `Auth`/`Users` (pattern reused, module re-implemented per ADR-011).
- **New modules** — built for OhMyPos: `Product`, `Recipe`, `RawMaterial`, `Sale`, `Supplier`, `Payable`, `StockMovement`, `Reporting`.

Note that `BankTransaction` is a *table*, not a module of its own — it is written by `Import` and read by `Reconciliation` and `Allocation`, exactly as in Kasync. A task list naming "the BankTransaction module" means those modules (ERD v3 §7).

Dependency direction within the backend is one-way: new modules depend on ported modules (e.g. `Sale` calls into `LedgerEntry`), but ported modules never depend on new modules. This keeps the ported modules exactly as reusable and self-contained as they are in Kasync itself.

## 2. Monorepo Structure & Tooling

```
ohmypos/
├── apps/
│   ├── api/            NestJS backend (modular monolith)
│   └── web/             Next.js frontend
├── packages/
│   ├── api-contracts/    Zod schemas — single source of truth for request/response
│   │                       shapes and their inferred TypeScript types (ADR-010)
│   ├── ui/               Shared shadcn/ui-based component wrappers + design
│   │                       tokens from DESIGN.md (colors, spacing, typography)
│   └── config/           Shared TS/ESLint/Prettier config
├── docker-compose.yml
└── turbo.json
```

- Package manager / workspaces: pnpm workspaces.
- Task orchestration: Turborepo (build/lint/test caching and task graph across `apps/*` and `packages/*`) — this is the standard pairing for a pnpm + Next.js + NestJS monorepo and keeps CI fast as the codebase grows.
- `packages/api-contracts` exists specifically to prevent type drift between `apps/api` and what `apps/web` expects from API responses — a single source of truth for the request/response shape of `Sale`, `LedgerEntry`, `StockMovement`, etc., imported by both apps rather than duplicated (ADR-010).

## 3. Why a single database, not two backend services

This was decided in the integration discussion (see PRD background): `Sale` creation needs to atomically (a) snapshot HPP, (b) decrement raw material stock, and (c) create an income `LedgerEntry` — all three must succeed or fail together. Splitting this across two backend services (a POS service and a reused Kasync service) would turn this into a distributed transaction problem (partial failure, retries, idempotency) for no real benefit at this scale. One database with one transaction boundary makes the correctness guarantee free. This is unrelated to, and unaffected by, the frontend/backend split — the frontend has no direct database access, only REST calls to `apps/api`.

## 4. Backend Module Responsibilities

| Module              | Ported / New | Responsibility                                                                           |
| ------------------- | ------------ | ---------------------------------------------------------------------------------------- |
| `Account`           | Ported       | Payment methods / cash-holding entities (cash, bank, e-wallet)                           |
| `Category`          | Ported       | Classification for `LedgerEntry` (expense/income categories)                             |
| `Branch`            | Ported       | Branch master data; attribution key on transactional records                             |
| `LedgerEntry`       | Ported       | The financial ledger — income and expense records                                        |
| `BankTransaction`   | Ported (table, not a module) | Imported bank statement rows — written by `Import`, read by `Reconciliation` and `Allocation`; it has no controller/service of its own in Kasync |
| `Allocation`        | Ported       | Split-matching between `BankTransaction` and `LedgerEntry`                               |
| `MatchingEngine`    | Ported       | Suggests matches between bank transactions and ledger entries                            |
| `Import`            | Ported       | Bank statement import via the `BankParser` strategy pattern — CSV, plus the Mandiri Livin PDF e-statement (ADR-022). Owns all `BankTransaction` writes, including import de-duplication (PRD §5.7) |
| `Reconciliation`    | Ported       | Read-side queries backing the reconciliation dashboard                                    |
| `Auth` / `Users`    | Ported pattern, re-implemented | JWT auth (access + refresh, `tokenValidFrom` revocation), with three-role access control — `KASIR` (branch-scoped), `ADMIN` (all-branch, limited modules), `OWNER` (all-branch, unrestricted) — per ADR-011. Kasync's auth *pattern* is reused, but the module is rebuilt: its self-registration and self-deletion endpoints contradict ADR-011 §5 and are deliberately not ported (ERD v3 §7) |
| `Product`           | New          | Menu items — name, sell price, computed HPP                                              |
| `Recipe`            | New          | Bill of materials: which raw materials (and quantities) compose a product                |
| `RawMaterial`       | New          | Raw material master data, unit of measure, unit cost, current stock balance              |
| `Sale` / `SaleItem` | New          | POS transactions; orchestrates HPP snapshot, stock decrement, and `LedgerEntry` creation |
| `Supplier`          | New          | Supplier master data                                                                     |
| `Payable`           | New          | Outstanding debt to a supplier from an unpaid `SupplierPurchase`, and its settlements    |
| `StockMovement`     | New          | Append-only inventory ledger (in/out), source of truth for stock balances                |
| `Reporting`         | New          | Read-only aggregation queries for Dashboard 3 (P&L, top products, etc.)                  |

## 5. Frontend Structure (`apps/web`)

- Next.js App Router, TypeScript.
- shadcn/ui as the component base, customized per `DESIGN.md` tokens (spacing scale, radius, single-layer shadow, Plus Jakarta Sans / JetBrains Mono, brand + accent + status colors).
- Route groups aligned to the PRD's screens: `(pos)/sales`, `(back-office)/master-data`, `(back-office)/expenses`, `(back-office)/inventory`, `(back-office)/reconciliation`, `(back-office)/reports`, `(back-office)/users`, `(back-office)/dashboard`, `(back-office)/devices`, `(back-office)/branches`, `(back-office)/accounts` — plus a `(shared)/*` group (profile, help, leave-requests) reachable by all three roles — with the POS/sales route optimized for the high-density, tablet-first layout, and back-office routes following the standard/relaxed density per screen as defined in `DESIGN.md`. The `(back-office)/devices`, `/branches`, `/accounts`, and `(shared)/*` groups postdate the original PRD screen set (ADR-020, ADR-021) and were added without a corresponding update to this list until now.
- **Role-based routing** (per ADR-011, three roles):
  - **`KASIR`** → lands on `(pos)/sales` only, scoped to their own `branchId`. No back-office access, but reaches `(shared)/*` (profile, help, leave-requests) like every role.
  - **`ADMIN`** → gets `(back-office)/master-data`, `(back-office)/reconciliation`, and `(back-office)/accounts` only — matching the backend restriction that `ADMIN` can perform reconciliation matching (ADR-011) and manage master data, but has no reason to access `(back-office)/users` (Owner-only, per ADR-011) or is not otherwise scoped into reports/inventory/expenses/devices/branches screens in v1. `(back-office)/accounts` (payment methods) is master-data-adjacent, which is why it's included here despite not being named in earlier drafts of this restriction. `ADMIN` does **not** get `(pos)/sales`.
  - **`OWNER`** → gets the full `(back-office)/*` route group (including `(back-office)/users`, `/dashboard`, `/devices`, `/branches`), unscoped by branch, plus the branch filter described in `DESIGN.md`.
  - This is a UX convenience only — the authoritative restriction is enforced backend-side via `RoleGuard`/`BranchScopeGuard` (Section 8), never trusted from routing alone.
- Data fetching: server components / route handlers call `apps/api` over REST using types from `packages/api-contracts`; no direct database access from the frontend at any point.
- Auth: reads the same JWT (HttpOnly cookie) issued by `apps/api`'s `Auth` module — session state is not duplicated or reimplemented on the frontend.

## 6. Key Backend Flows

### 6.1 Sale Creation

Triggered when a cashier completes a sale at a branch (via `apps/web`'s POS screen, calling `apps/api`). Runs inside a single database transaction:

1. For each `SaleItem`, look up the product's `Recipe` and compute HPP from current `RawMaterial.unitCost` — this value is **snapshotted** onto the `SaleItem`, not recalculated later.
2. For each raw material consumed, write a `StockMovement` (direction OUT, reference = this sale) and decrement `RawMaterial.currentStock`, taking a row lock (`SELECT ... FOR UPDATE`) on the raw material row first — this is the same pattern Kasync uses to close the concurrency race in its allocation-sum trigger, applied here because stock is a single shared pool that multiple branches can decrement concurrently.
3. Create one income `LedgerEntry`, tagged with the sale's `branchId` and the `Account` matching the payment method used.
4. Commit. If any step fails, the whole sale is rolled back — no partial stock decrement or orphaned ledger entry.

### 6.2 Raw Material Purchase

Triggered when a purchase from a supplier is logged (centrally or per-branch, per the confirmed branch policy):

The client sends what the supplier's nota says: a quantity in the material's **purchase unit** and the **total price** paid for it (ADR-024). It never sends a normalized quantity or a unit cost — those are derived server-side, for the same reason `totalAmount` is.

1. **Convert each line.** `quantity = purchaseQuantity × conversionFactor` (stock units, 4dp) and `unitCost = lineTotal ÷ quantity` (per stock unit, 6dp), using the material's factor as it is *now*, which the line then snapshots along with `purchaseUnit` and `purchaseQuantity`.
2. Create the `SupplierPurchase` record, tagged `branchId = null` (central) or a specific branch.
3. Write a `StockMovement` (direction IN) and increment `RawMaterial.currentStock` — this always happens immediately, regardless of payment status, because the physical stock has arrived. Locks are taken here, before any line row exists (ADR-016).
4. Create the `SupplierPurchaseItem` rows, carrying both the bought and the received figures.
5. **Write back the latest cost.** Still inside the transaction and under the same `FOR UPDATE` locks, set `RawMaterial.unitCost` to the normalized cost of the latest applicable purchase, found by `ORDER BY purchase_date DESC, created_at DESC, id DESC LIMIT 1` over that material's lines. Recomputing the winner from table state — rather than comparing against the row just inserted — is what makes a **backdated** purchase behave: it inserts, loses the ordering, and rewrites the cost to the value it already had. The result never depends on which concurrent request finished last (ADR-024, closes DEBT-006).
6. **If paid immediately:** create an expense `LedgerEntry` now.
7. **If unpaid (utang):** create/increment a `Payable` record instead. No `LedgerEntry` is created yet — this is the deliberate choice from the PRD so cash reports aren't distorted by money that hasn't left the account. Note that steps 3 and 5 happen either way: payment status gates **money**, not stock or cost.

### 6.3 Payable Settlement

When a supplier debt is paid off (in full or in part): create a `PayableSettlement` record, decrement the `Payable` balance, and create an expense `LedgerEntry` for exactly the amount settled, at that time.

### 6.4 Monthly Opening Stock

A scheduled or manually-triggered action at the start of each month: for each raw material, record an `OpeningStock` entry (quantity **in the stock/recipe unit** — never the purchase unit, ADR-024 — and unit price if no purchase has happened yet that month), and write a corresponding `StockMovement` (direction IN, reference = OPENING) so it flows into the same balance calculation as any other movement.

### 6.5 Reconciliation

Import a bank statement via the existing `BankParser` strategy pattern — Kasync's CSV parsers unchanged, plus a Mandiri Livin PDF e-statement parser added in ADR-022 (`POST /import/pdf/:accountId`, separate from the CSV route so each validates its own file type) — then run the `MatchingEngine` to suggest matches against `LedgerEntry` records (which now include sale-generated entries, not just manual ones), and let the user confirm or split-allocate via `Allocation` on the Reconciliation screen's two-pane layout (`DESIGN.md`). The invariant `sum(Allocation.amountPortion) <= BankTransaction.amount` is enforced the same way (application + database trigger with a row lock), unchanged. Per ADR-011, only `ADMIN` and `OWNER` can perform this matching action — `KASIR` has no access to this screen at all (Section 5).

### 6.6 Reporting (Dashboard 3, Inventory Summary)

Computed at query time from `LedgerEntry`, `SaleItem`, and `StockMovement` — no separate snapshot/materialized tables in v1, consistent with how Kasync's own reconciliation dashboard works. If report queries become a performance problem at higher data volume, that's a v2 optimization (materialized views or a read-model table), not a v1 concern given the expected transaction volume of one multi-branch small business. In v1, `(back-office)/reports` is `OWNER`-only per the routing table in Section 5 — `ADMIN` does not have a reporting screen.

## 7. Data Consistency Rules

- All monetary and quantity values use `Decimal`, never floating point (unchanged from Kasync).
- `RawMaterial.currentStock` is a stored, trigger-or-transaction-synced denormalized field (same pattern as `BankTransaction.status` in Kasync) — the source of truth is the `StockMovement` log, but the balance is kept as a fast-read column rather than summed on every read.
- Every operation that touches both financial state and inventory state (Sale, Purchase) is one database transaction — never two separate calls from the application layer.
- A material's `unit` is the stock/recipe unit and the only unit any stored quantity is in; `purchaseUnit`/`conversionFactor` affect purchase ENTRY only (ADR-024). Per-unit costs are `Decimal(18,6)` because they are rates; every ledger-facing amount stays `Decimal(18,2)`.
- HPP is computed live on `Product` (master data view) but always snapshotted on `SaleItem` (historical accuracy) — this distinction is load-bearing for report correctness and should not be "simplified" later without revisiting Dashboard 3's accuracy guarantee.

## 8. Branch Scoping & Role Enforcement in the Schema (ADR-011)

Per the confirmed branch policy and the three-role model:

- `branchId` is present and required on: `Sale`, `LedgerEntry` (inherited from Sale/Expense), `SupplierPurchase` (nullable — null means central purchase).
- `branchId` is **absent** from: `RawMaterial.currentStock` (single pool), `Account` (single shared account), `OpeningStock` (single pool per raw material).
- `User.branchId` is required when `role = KASIR`, and `null` when `role = ADMIN` or `OWNER` (both have all-branch access at the data level — see Section 5 for how their *frontend module access* still differs).
- Role-based access, enforced in `apps/api` (never trusted from the frontend alone):
  - **`KASIR`** — write operations (creating sales, branch-specific purchases) scoped to their own `branchId` via `BranchScopeGuard`. No access to `Allocation`, `User`, or reporting endpoints.
  - **`ADMIN`** — unscoped (all-branch) read/write on master data and reconciliation (`Allocation` create/revoke) via `RoleGuard`. Cannot create/deactivate `User` records.
  - **`OWNER`** — unscoped read/write across all modules, including `User` creation/deactivation — the only role permitted to do so.

## 9. Tech Stack

- **Backend (`apps/api`)**: NestJS (TypeScript), modular monolith, PostgreSQL (single instance), Prisma ORM (ADR-003). No message queue or cache in v1 — synchronous request flow, same rationale as Kasync (low transaction volume). Auth: JWT via HttpOnly cookies, dual-token (access + refresh) pattern from Kasync, extended with a role (`KASIR`/`ADMIN`/`OWNER`) and branch claim (ADR-011). Validation via Zod schemas from `packages/api-contracts` (ADR-010).
- **Frontend (`apps/web`)**: Next.js, shadcn/ui, Plus Jakarta Sans + JetBrains Mono, design tokens per `DESIGN.md`.
- **Shared**: `packages/api-contracts` for Zod-derived request/response types, `packages/ui` for shared component wrappers and tokens.
- **Monorepo tooling**: pnpm workspaces + Turborepo.

## 10. Deployment Topology

Three containers via `docker-compose`: `web` (Next.js), `api` (NestJS), and `postgres` — still deliberately simple, no orchestration platform, no separate services beyond what the frontend/backend split itself requires. `web` and `api` are independently deployable from the same monorepo (Turborepo builds each app's own image), but there is no separate deployment split for the POS/cashier-facing routes vs. the back-office routes — those are both part of the one `web` app, gated by role (Section 5).

In split-host production deployments (for example Vercel for `web` and Render
for `api`), browser REST calls remain same-origin at `/api/v1`. The Next.js
deployment handles that path with a Node.js BFF Route Handler which streams the
request to the server-only `INTERNAL_API_BASE_URL`. This is required for the
HttpOnly access and refresh cookies to belong to the web host, where Next.js
route gating and Server Components can read and forward them; the browser must
not call the unrelated backend host directly. The BFF also rejects unsafe
methods carrying a foreign `Origin` header and forwards backend `Set-Cookie`
headers individually. An external Vercel rewrite is not used because Vercel's
rewrite resolver rejected Render's hostname with
`DNS_HOSTNAME_RESOLVED_PRIVATE` in production (ERR-032).

## 11. Risks / Things to Revisit

- **Stock concurrency at scale**: the row-lock approach on `RawMaterial` during sale creation is fine at small transaction volume, but if multiple branches ring up sales for the same raw material at high frequency, lock contention could become a bottleneck. Not a v1 concern given the business's actual scale, but worth flagging for the ADR record.
- **Report query performance**: query-time aggregation is simplest for v1 (ADR-008) and every Dashboard 3 filter lands on an index that already exists — `ledger_entries(branch_id, entry_date)` and `sales(branch_id, sold_at)` were both added for this purpose. Phase 7 established the measured trigger this risk previously lacked: **reopen ADR-008 when any report exceeds 1 s at a one-year range on realistic volume, or when a plan shows a sequential scan on `sale_items` or `ledger_entries` for a one-month range.** The escalation ladder is, cheapest first: an additive index on `sale_items(sale_id, product_id)`; denormalising `branch_id`/`sold_at` onto `sale_items`; only then materialized views or a read-model table. Phase 14 Workstream C measured this trigger against two disposable volume tiers (T1: 12 months / ~131K sales; T2: 36 months / ~395K sales, ~986K `sale_items`, ~1.8M `stock_movements`, roughly 3x the business's current actual scale) — **the trigger did not fire**: worst case across all five Dashboard-3 endpoints was 720ms p95 (`daily-income` at a one-year range), and every one-month query resolved via an index, no sequential scan. `GET /inventory/summary` was measured separately against the same T2 volume and **did** cross its own (stricter, inventory-specific) p95 budget — 768ms p95 driven by an unbounded `Seq Scan on stock_movements` for the opening-balance calculation; this is a distinct, already-tracked risk (see below and `DEBT-013`), not a change to the report-query verdict. Full table and per-endpoint detail: ADR-008's 2026-08-22 re-affirmation note, `DEBT-001`.
- **Inventory summary opening-balance scan**: `GET /inventory/summary`'s opening-balance sub-query has no lower date bound by design (ADR-008) — it sums every `StockMovement` before the requested period, so its cost grows linearly with total historical row count with no ceiling, unlike the date-range-bounded Dashboard 3 reports above. Measured at Phase 14 Workstream C's T2 volume (36 months, ~1.8M `stock_movements`): 768ms p95, `EXPLAIN` confirms a `Parallel Seq Scan on stock_movements`. This already exceeds `DEBT-013`'s own 250ms p95 trigger and will keep growing release over release even if nothing else changes — re-measure whenever real production volume approaches T2, not just once. Tracked in `DEBT-013`.
- **`packages/api-contracts` maintenance**: Zod schemas remove the type-drift risk by construction (ADR-010), but the NestJS-side integration approach (custom pipe vs. `nestjs-zod`) is still an open implementation detail to settle when `apps/api` scaffolding begins.
- **`ADMIN`'s module scope**: currently limited to Master Data + Reconciliation only (Section 5). If the business later needs `ADMIN` to also see reports or inventory screens, that's a routing/`RoleGuard` change, not a schema change — but should still get a quick ADR note if it happens, since it was a deliberate v1 restriction, not an oversight.
