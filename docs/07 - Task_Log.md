# OhMyPos — Task Log

**Purpose:** Give the next AI coding session (or the next you) the context of what was actually done, decided, and left unfinished — without needing to re-read the entire PRD/System Design/ADR/ERD/Playbook every time. Every completed (or abandoned) task gets an entry here.

**Depends on:** PRD v1.1, System Design v4, ADR-001–012, ERD v3, Engineering Playbook v3

---

## How to use this log

- Add one entry per task, in reverse-chronological order (newest at the top).
- A "task" is whatever unit of work was actually handed to an AI agent or worked on in one sitting — a phase, a module, a single bugfix, a schema change. Don't force artificial task boundaries; log at the granularity work actually happened.
- Fill every field. If a field genuinely doesn't apply, write "N/A" rather than omitting it — an omitted field is ambiguous (forgotten vs. not applicable) to whoever reads this next.
- The "Handoff Notes" field is the most important one — write it for a reader who has *not* seen this conversation, only this log entry plus the standing docs (PRD/System Design/ADR/ERD/Playbook).
- Reference ADRs/System Design sections by number/section, don't restate their content here — this log is for what happened in a specific task, not a second copy of the architecture docs.

---

## Entry Template

```
### TASK-XXX — <short title>

- **Date:** YYYY-MM-DD
- **Module / Phase:** <e.g. Sale module, ERD implementation, apps/web scaffolding>
- **Objective:** <what this task was asked to do, one or two sentences>
- **Relevant docs:** <ADR/System Design/ERD sections this task implements or depends on>
- **What was done:** <concrete summary — files created/changed, endpoints added, schema
  migrations run>
- **Decisions made during this task:** <any small implementation decision that came up
  and wasn't already covered by an ADR — e.g. exact Zod refinement used for Decimal
  strings, exact NestJS-Zod integration library chosen (see ADR-010's note). If a
  decision was significant enough to need its own ADR, write it there instead and just
  link it here.>
- **Status:** Done | Blocked | In Progress
- **Handoff notes:** <what the next task needs to know — unfinished edges, follow-up
  work, anything that looked risky but was out of scope for this task>
```

---

## Log

### TASK-006 — Phase 4: Purchasing & Payables

- **Date:** 2026-08-16
- **Module / Phase:** Phase 4 — Purchasing & Payables (`Supplier`, `SupplierPurchase`, `SupplierPurchaseItem`, `Payable`, `PayableSettlement`, `StockMovement`)
- **Objective:** Implement full inventory inbound purchasing, supplier management, payables ledger settlement, and stock movements with pessimistic row locking per `docs/plannings/phase-4-purchasing-payables.md`.
- **Relevant docs:** PRD §5.3, ADR-004, ADR-006, ADR-007, ADR-010, ADR-011, ADR-012, ADR-014, ERD v3 §3, §6, §7, Playbook §3–§10.
- **What was done:**
  1. Authored **ADR-014** (Central kitchen branch for central-purchase ledger entry attribution) and logged **DEBT-006** (`RawMaterial.unitCost` not updated by purchases) & **DEBT-007** (No DB-level trigger for payable settlement sum).
  2. Extended `schema.prisma` with 4 enums (`PaymentStatus`, `PayableStatus`, `StockDirection`, `StockReferenceType`) and 6 models (`Supplier`, `SupplierPurchase`, `SupplierPurchaseItem`, `Payable`, `PayableSettlement`, `StockMovement`), generated Prisma client, and executed migration `20260815185935_add_purchasing_payables_stock_movements`.
  3. Created Zod schemas in `packages/api-contracts` (`supplier.schema.ts`, `supplier-purchase.schema.ts`, `payable.schema.ts`, `stock-movement.schema.ts`) with mutual exclusion (`PAID` requires `accountId`, `UNPAID` rejects `accountId`), unique raw material validation, and decimal scale formatting.
  4. Created pure calculators & rule validators with unit tests: `calculateLineTotal` and `calculatePurchaseTotal` in `purchase-totals.ts` (`purchase-totals.spec.ts`) and `assertSettlable` in `payables.rules.ts` (`payables.rules.spec.ts`).
  5. Implemented `SuppliersModule` (CRUD, delete restriction if referenced), `StockMovementsModule` (`SELECT ... FOR UPDATE` row locks sorted ascending to prevent deadlocks + atomic increment on `RawMaterial.currentStock`), `SupplierPurchasesModule` (atomic `$transaction` enforcing ADR-006 binary branch and ADR-014 central branch attribution), and `PayablesModule` (pessimistic lock on `Payable` + live `remainingBalance` & `status` update + `LedgerEntry` creation on settlement).
  6. Updated `seed.ts` with `Pusat (Dapur Sentral)` system branch, 2 suppliers (`Toko Sumber Rejeki`, `CV Kopi Nusantara`), Purchase A (Central, PAID, 290,000.00), and Purchase B (Melati, UNPAID, 60,000.00 with 20,000.00 partial settlement).
  7. Built auth-aware e2e test suite `purchasing-payables.e2e-spec.ts` testing all 27 cases from §9.10: ADR-006 binary branch, stock movements, central purchase attribution, partial/full settlements, over-settlement rejection, concurrency lock under `Promise.allSettled`, rollback guarantees, RBAC/BranchScopeGuard enforcement, decimal scale preservation, and balance re-derivation.
- **Decisions made during this task:**
  (1) Option 1 / Option B chosen for `Payable`: stored `remainingBalance` + `status` written strictly inside the settlement transaction under `SELECT id FROM payables WHERE id = ${id} FOR UPDATE`.
  (2) Option L3 chosen for central purchase ledger entries: `Pusat (Dapur Sentral)` branch seeded and resolved via `resolveLedgerBranchId` (formalized in ADR-014).
  (3) Option P2 chosen for `SupplierPurchase.paymentStatus`: updated live upon partial/full settlement so purchase status reflects true settlement state.
  (4) Settlement creation restricted to `OWNER` only (money leaving central account).
  (5) Stock movements acquire pessimistic locks on raw materials in ascending order (`localeCompare`) to prevent deadlocks across concurrent bulk operations.
- **Post-review corrections (2026-08-16):** the phase was reviewed against its plan and six items were fixed; nothing in the ADR-006 branch, the transaction boundaries, or the schema changed.
  1. **ERR-004 (High, CI-breaking)** — `db:seed` → `test:e2e` failed 35 tests in `auth-rbac` and `master-data`, while `test:e2e` alone passed. Phase 4's `Restrict` FKs blocked those suites' unconditional `ledgerEntry.deleteMany({})` / `rawMaterial.deleteMany({})`. Both cleanups now delete the purchasing children first. See ERR-004 for why a green e2e run on an unseeded database proved nothing here.
  2. **Seed no longer hand-writes derived values.** It calls `SupplierPurchasesService.create` and `PayablesService.settle` (services constructed directly; `PrismaService` builds its own adapter, so no Nest container is needed). Previously it wrote `totalAmount`, `lineTotal`, `remainingBalance: '40000.00'`, `paymentStatus: 'PARTIALLY_PAID'` and the `currentStock` increments as literals — a second writer to three denormalized balances, living outside `apps/api/src` where the single-writer greps could not see it.
  3. **ADR-014's rejection is now real.** The ADR claimed the API rejects `Pusat (Dapur Sentral)` as a purchase `branchId`; nothing did. Added `CentralBranchNotAssignableException` (400) plus e2e Case 28. Exception inventory is now six, not five.
  4. **e2e Case 15 was vacuous** — it asserted `.every()` over a result set that contained no other-branch rows at all. It now creates a branch-2 purchase and a central purchase first, asserts the result is non-empty, and names both ids as exclusions.
  5. **e2e Case 3 was order-dependent** — it read the two most recent `StockMovement` rows globally. It now creates its own purchase and queries by `referenceId`, asserting one movement per line with exact quantity, unit cost and branch.
  6. **House-style cleanups:** `this.name` added to all six domain exceptions (Phase 2/3 set it, Phase 4 did not), and the two unit-spec files gained the `ADR-`/`§` doc comment the plan's §9.1a requires. The plan's §8.5 `migrate diff` command was also corrected — it used Prisma 5/6 flag names that Prisma 7 rejects with a usage dump, which reads deceptively like a clean check.
- **Status:** Done
- **Handoff notes:** `pnpm turbo run lint typecheck test build` green (15/15 tasks); 71 e2e tests (allocation, auth/RBAC, master-data, purchasing-payables) and 31 unit tests pass — verified in both `db:seed` → `test:e2e` and `test:e2e` → `test:e2e` order. Seed output re-checked in SQL after the rewrite: purchase A `290000.00` PAID central with 1 ledger entry and 0 payables, purchase B `60000.00` with 0 purchase ledger entries and 1 payable, stored `remainingBalance` `40000.00` equal to the re-derived figure, Gula `25.0000` / Kopi `7.0000`, central entry on `Pusat (Dapur Sentral)` and the settlement entry on `Cabang Melati`. **What Phase 5 (POS & Sales) must know:**
  - Inbound stock from purchases writes `StockMovement` with `direction: 'IN'` and increment on `RawMaterial.currentStock`.
  - Phase 5 `Sale` flow will record `StockMovement` with `direction: 'OUT'`, `referenceType: 'SALE'`, and decrement `RawMaterial.currentStock` inside the sale transaction under `FOR UPDATE` lock.
  - Money movements for sales create `LedgerEntry` with `type: 'INFLOW'`, `sourceType: 'SALE'`.
  - Reuse `StockMovementsService` rather than writing `RawMaterial.currentStock` from the sale flow: it is the single writer of that column, and its `applyInbound` already establishes the `tx`-parameter shape and the ascending-id lock order that the `OUT` counterpart must copy to stay deadlock-free against concurrent purchases.
  - `Sale` and `SaleItem` will add more `Restrict` children to `raw_materials`, `ledger_entries` and `branches`. Extend the cleanup in **every** existing e2e suite that wipes those tables in the same change, and verify with `db:seed` → `test:e2e` — ERR-004 is exactly this mistake, and it passes locally while failing CI.

### TASK-005 — Phase 3: Master Data (Product / Recipe / RawMaterial)

- **Date:** 2026-08-15
- **Module / Phase:** Phase 3 — Master Data (`RawMaterial`, `Product`, `RecipeItem`, HPP calculator)
- **Objective:** Implement Master Data domain models, live HPP calculator, derived makeable quantity, and atomic recipe replace API shape per `docs/plannings/phase-3-master-data.md`.
- **Relevant docs:** PRD §5.1, ADR-004, ADR-005, ADR-007, ADR-010, ADR-011, ADR-012, ADR-013, ERD v3 §3, §6, §7, Playbook §3–§10.
- **What was done:**
  1. Resolved DEBT-005 and recorded **ADR-013** confirming `Product` has no stored stock or `hpp` column; POS displays derived advisory makeable quantity; HPP stays recipe-based computed live from `RecipeItem.quantityUsed × RawMaterial.unitCost`. Updated `docs/DESIGN.md` mockup copy notes and marked DEBT-005 as Resolved in `docs/08 - Tech_Debt_Log.md`.
  2. Updated `schema.prisma` with `RawMaterial`, `Product`, and `RecipeItem` models and ran migration `20260815165820_add_master_data_products_recipes_raw_materials`.
  3. Created Zod schemas in `packages/api-contracts` (`raw-material.schema.ts`, `product.schema.ts`, `recipe.schema.ts`) with scale enforcement, positive quantity check, and duplicate raw material ID superRefine validation.
  4. Implemented pure `calculateHpp` function in `hpp.calculator.ts` with exhaustive unit tests (`hpp.calculator.spec.ts`) asserting single/multi-item arithmetic, single rounding `HALF_UP` to 2dp, zero-cost, and null on empty recipe.
  5. Implemented NestJS modules: `RawMaterialsModule` (CRUD, RBAC `OWNER`/`ADMIN` write, any authenticated read), `RecipesModule` (atomic `$transaction` replace using `tx`, `getRecipe`), and `ProductsModule` (Product CRUD, recipe sub-routes, eager loading + `products.mapper.ts` formatting).
  6. Updated `seed.ts` with synthetic raw materials (`Gula`, `Kopi`), products (`Es Kopi Susu`, `Air Mineral`), and recipes for hand verification and e2e assertions.
  7. Created auth-aware e2e test suite `master-data.e2e-spec.ts` covering RBAC, decimal scale preservation (`"4530.00"` string), atomic recipe updates, constraint checks, and live HPP recalculation when material costs update.
- **Decisions made during this task:**
  (1) Option A chosen for HPP: computed live at query time via `hpp.calculator.ts` to prevent staleness and guarantee identical implementation for Phase 5 `SaleItem.hppAtSale`.
  (2) Option R1 chosen for Recipe API: `PUT /products/:id/recipe` full replace inside a single `$transaction` using `tx` to guarantee atomic recipe state and satisfy `unique(productId, rawMaterialId)`.
  (3) Explicit scale formatting `.toFixed(scale)` on all response mappers to prevent Prisma.Decimal implicit `.toJSON()` scale truncation.
  (4) Exception inventory kept strictly to four domain exception classes (`RawMaterialNameTakenException`, `RawMaterialInUseException`, `ProductNameTakenException`, `UnknownRawMaterialException`).
- **Status:** Done
- **Handoff notes:** `pnpm turbo run lint typecheck test build` green (15/15 tasks); all 43 e2e tests (allocation, auth/RBAC, master-data) and 20 unit tests pass. **What Phase 4 (Purchases & Inventory) and Phase 5 (POS & Sales) must know:**
  - `RawMaterial` is the single centralized stock pool (ADR-004); Phase 4 `OpeningStock` and `SupplierPurchase` alter `RawMaterial.currentStock` via `StockMovement` under `FOR UPDATE` (ADR-007).
  - Phase 5 `Sale` flow reuses `calculateHpp` from `apps/api/src/modules/products/hpp.calculator.ts` to snapshot `SaleItem.hppAtSale` at sale time (ADR-005).
  - Recipe items cascade when a product is deleted (`onDelete: Cascade`), while raw material deletion is restricted if referenced by any recipe (`onDelete: Restrict`).

### TASK-004 — Phase 2: Auth & three-role access control

- **Date:** 2026-08-15
- **Module / Phase:** Phase 2 — `Auth`, `Users`, `RoleGuard`, `BranchScopeGuard`, frontend route gating
- **Objective:** Build the access-control layer every future endpoint depends on (ADR-011), and close the two guard gaps Phase 1 left open on `Allocation` and `LedgerEntry`.
- **Relevant docs:** ADR-011 (all sections), ERD v3 §2 (`User`), System Design v4 §5 and §8, Playbook §6, §8, §10.
- **What was done:** `User` model + `UserRole` enum + `add_user_and_roles` migration, approved before being written. `Auth` module with the Kasync dual-token pattern (HttpOnly cookies, refresh rotation, `tokenValidFrom` revocation, bcrypt cost 10, timing-attack mitigation on login) — deliberately without `register`, `DELETE /users/me` or `photoUrl` (ERD §7). `Users` module with OWNER-only create/deactivate and its own domain exceptions. Three guards: `JwtAuthGuard` registered globally with `@Public()` opt-out, plus `RoleGuard`/`@Roles()` and `BranchScopeGuard`/`@BranchScoped()` applied per endpoint. **Retrofitted the Phase 1 gaps:** `Allocation` is now `ADMIN`/`OWNER` only and `LedgerEntry` is branch-scoped. Seed creates the initial OWNER (without which nobody could ever log in, since there is no self-registration), an ADMIN, a KASIR, and the system categories ADR-012 requires. Frontend: `middleware.ts`, session helpers, login form using the shared `LoginSchema`, and all seven route groups with per-route role gates.
- **Decisions made during this task:** (1) `JwtAuthGuard` is global while the other two are per-endpoint — an endpoint added later without a guard fails closed. (2) `@BranchScoped('body.branchId')` names where the branch id lives rather than letting the guard scan for it, so "no branch on this endpoint" and "branch field forgotten" cannot be confused. (3) `BranchScopeGuard` **fails closed** instead of injecting a scope — see ERR-002 for why the injecting version was unsafe. (4) The guard trusts the database over the token for `role` and `branchId`, so a role change or deactivation takes effect without waiting for the access token to expire. (5) `tokenValidFrom` is written from the application clock rather than the column default, which removes the clock-drift problem Kasync's 2-second tolerance existed for (ERR-003). (6) Deactivation is soft and also bumps `tokenValidFrom`, ending the session mid-flight.
- **Status:** Done
- **Handoff notes:** `turbo run lint typecheck test build` green (15/15); 31 e2e tests pass (8 allocation, 23 auth/RBAC) plus 14 unit. Every DoD line was also exercised over real HTTP against the running API, not only through the test harness: OWNER logs in and creates an ADMIN and a KASIR (201); KASIR gets 403 on both `POST /users` and `POST /allocations`; ADMIN gets 403 on `POST /users` but passes the guard on `POST /allocations` (404 from the service, which is the point). **Two things Phase 3 must know:** the Phase 1 allocation suite had to be retrofitted with a real login once auth went global — any new e2e suite must authenticate, there is no unguarded path left; and `@BranchScoped` must be applied to every new branch-attributable endpoint (`Sale`, `SupplierPurchase`, `StockMovement`), because the guard is opt-in per endpoint by design and will not cover them automatically. Known gap: the frontend has route gating and a login form only — no logout control, no token-refresh-on-401 interceptor, and the placeholder pages have no navigation between them.

### TASK-003 — Phase 1: port Kasync's modules

- **Date:** 2026-08-15
- **Module / Phase:** Phase 1 — ported modules (`Account`, `Category`, `Branch`, `LedgerEntry`, `Allocation`, `MatchingEngine`, `Import`, `Reconciliation`)
- **Objective:** Adapt Kasync's financial/reconciliation modules into `apps/api`, extended per ERD v3, with the allocation-sum trigger intact and its constraint under test.
- **Relevant docs:** ADR-001 (port, don't call), ADR-003, ADR-010 (Zod), ADR-012 (Kasync schema as baseline), ERD v3 §2 and §7 (porting notes), Playbook §5, §7, §10.
- **What was done:** `schema.prisma` with six tables and six enums, approved before any migration was written; one `init` migration carrying both Kasync triggers copied verbatim from `20260809180000_multi_tenancy_and_triggers`. Ported `common/` infrastructure (Prisma service, correlation-id middleware, domain error, exception filter), the eight modules above, and `MatchingEngine` verbatim. Wrote 11 Zod schema files in `packages/api-contracts` replacing Kasync's class-validator DTOs entirely. Wired the global `ZodValidationPipe`, pino logging, throttler, CORS, cookie-parser, Swagger and graceful shutdown into `app.module.ts`/`main.ts`.
- **Decisions made during this task:** The user chose Prisma 7 over my recommendation of 5.22 (matching Kasync), and the porting friction I flagged materialised concretely — all of it resolved, none of it hidden. (1) Prisma 7's `prisma-client` generator emits **TypeScript into the source tree**, so `src/generated/` is gitignored and excluded from ESLint and Prettier. (2) `importFileExtension = ""` is required: the default `.ts` extensions break `moduleResolution: node`, and `.js` compiles but breaks ts-node and jest at runtime. (3) Prisma 7 mandates a driver adapter, adding `@prisma/adapter-pg`, `pg`, `@types/pg` and `dotenv` — approved separately. (4) Trigger errors changed shape; see **ERR-001**, the one finding that would have silently broken money correctness. (5) `nestjs-zod` v5 replaced `patchNestJsSwagger` with `cleanupOpenApiDoc`. (6) `zod` was moved to v4 while `api-contracts` held only primitives, so the migration cost was near zero. (7) `LedgerEntry.update` now refuses to edit an entry whose `sourceType` is not `MANUAL` — system-generated entries belong to the flow that created them (ADR-006).
- **Status:** Done
- **Handoff notes:** `turbo run lint typecheck test build` is green (15/15). The migration was verified against a genuinely empty database — schema dropped and re-deployed from zero — with both triggers confirmed present afterwards. Tests: 14 unit (`MatchingEngine`, ported unchanged) and 8 e2e covering the allocation-sum constraint against real Postgres, including cumulative overflow, revoke-then-reallocate, direction mismatch, idempotency replay, and over-precise Decimal rejection. **Three things Phase 2 must handle:** the `Allocation` create/revoke endpoints are currently **unguarded** — ADR-011 restricts them to `ADMIN`/`OWNER`, and `RoleGuard` lands in Phase 2, so this is an open hole until then; `LedgerEntry` reads/writes are likewise unscoped and need `BranchScopeGuard`; and `Branch` already exists, so `User.branchId`'s foreign key has something to point at. One bug of my own worth remembering: the `FOR UPDATE` raw query must **not** cast `id` to `::uuid` — the column is TEXT, and the cast made every allocation request a 500 until fixed.

### TASK-002 — Phase 0: monorepo scaffolding

- **Date:** 2026-08-14
- **Module / Phase:** Phase 0 — monorepo scaffolding (no domain code)
- **Objective:** Stand up the pnpm + Turborepo workspace exactly as System Design §2 specifies, with both apps booting, the shared quality gate green, and the three-container dev topology from §10 running.
- **Relevant docs:** System Design §2 (workspace layout), §9 (stack), §10 (deployment topology); Playbook §2 (turbo task graph), §5 (Decimal), §13 (pre-commit rules); ADR-002, ADR-010; DESIGN.md (tokens).
- **What was done:** Root workspace (`pnpm-workspace.yaml`, `turbo.json` with the `lint`/`typecheck`/`test`/`build`/`dev` graph, `.gitignore`, shared `prettier.config.mjs`). `packages/config` built first, exporting ESLint presets (base/nest/next/package), the Prettier config, and TypeScript presets (base/nest/next/library) — base carries Kasync's rules including `no-explicit-any: error` per AGENTS.md. `apps/api` scaffolded with the NestJS CLI, `apps/web` with `create-next-app` (Next 16, App Router, Tailwind v4), both rewired onto the shared presets and stripped of the CLIs' single-repo cruft. `packages/api-contracts` created with Zod plus the decimal-string primitives from Playbook §5 (money `Decimal(18,2)`, quantity `Decimal(18,4)` per ADR-012). `packages/ui` created with DESIGN.md's tokens as Tailwind v4 theme variables, the `cn` helper, shadcn/ui wired in monorepo mode, and one `Button` added to prove the path. `docker-compose.yml` with `web`/`api`/`postgres` plus per-app dev Dockerfiles. `.env.example` for both apps.
- **Decisions made during this task:** (1) TypeScript presets deliberately omit `outDir`/`rootDir` — relative paths in an extended tsconfig resolve against the *preset's* directory, not the consumer's, so each package declares its own; this cost one failed build before being understood. (2) `apps/web`'s ESLint composes Next's own flat configs first and then only shared *overrides* from `packages/config`, rather than the full base — Next's config already registers typescript-eslint and registering it twice collides; it is also version-locked to the Next release, so it stays a dependency of the app. (3) Postgres is published on host port **5433**, because a native PostgreSQL already holds 5432 on this machine; the compose-internal port is unchanged, so only host tools are affected. (4) `web` runs on port 3001 to leave 3000 to `api`, matching the port Kasync's CORS defaults already expect. (5) The root `format` script excludes `docs/**` — running Prettier across markdown reformatted every standing doc (335 lines of pure churn) and buried the real diff. (6) Dev Dockerfiles install dependencies at **build** time rather than on container start; the first version installed on start, which re-downloaded the whole tree on every `up`. (7) Each image installs only its own subtree (`--filter api...` / `--filter web...`) and mounts a BuildKit cache for the pnpm store, so a dropped download resumes rather than restarting — the container's link to the npm registry on this machine is materially slower and flakier than the host's, and three build attempts died on it before `--fetch-timeout 600000` fixed it — pnpm's 60s default cannot pull the `next` tarball over this link. (8) Every `node_modules` directory is a named volume and the volumes are **per service**, not shared. A shared `/repo/node_modules` volume is seeded from whichever container is created first, so `web` inherited `api`'s filtered install and crashed on a missing `next`. Named volumes only seed on first creation, so changing an image's dependencies means removing its volumes, not just rebuilding.
- **Status:** Done
- **Handoff notes:** `turbo run lint typecheck test build` is green across all 5 packages (15/15 tasks). `docker compose up -d` brings up all three containers with `api` answering 200 on `/api/v1`, `web` answering 200 and rendering the shared component, and `postgres` 16.14 healthy on host port 5433. Both apps also boot together under `pnpm dev` — `api` answers 200 at `http://localhost:3000/api/v1`, `web` serves 200 at `http://localhost:3001` rendering the shared `Button`. Cross-workspace imports are proven, not assumed: `@ohmypos/api-contracts` resolves and typechecks from `apps/api`, and its scale enforcement was exercised (2dp money accepted, 3dp rejected, 4dp quantity accepted, negatives rejected). Three things Phase 1 needs to know: **Prisma is deliberately not installed yet** — it arrives with the ported schema, and `apps/api/Dockerfile.dev` already installs `openssl` so no image rebuild is needed for it; the **`radix-ui` package was pulled in automatically** by `shadcn add button`, so it entered `packages/ui` without passing the dependency-approval gate explicitly — worth a look; and `apps/api/src/main.ts` currently sets only the `/api/v1` global prefix — CORS, cookie-parser, the global Zod pipe, Swagger, pino logging and graceful shutdown all still need porting from Kasync's `main.ts` in Phase 1.

### TASK-001 — Documentation correction pass against Kasync's literal schema

- **Date:** 2026-08-14
- **Module / Phase:** Pre-implementation (before Phase 0 scaffolding)
- **Objective:** Before writing any code for Phase 0–2, read all six standing docs plus Kasync's actual source, and resolve the open item ERD v2 §7 raised — that its ported-entity definitions were written from Kasync's documentation rather than its literal `schema.prisma`.
- **Relevant docs:** ERD v2 §7 (the open item), ADR-011, ADR-012 (written by this task), System Design §4, Playbook §17 (ADR trigger criteria).
- **What was done:** Read `../kasync/prisma/schema.prisma`, all five files under `../kasync/prisma/migrations/`, and the `allocation`, `matching`, `ledger-entries`, `accounts`, `categories`, `branches`, `auth`, `users` modules plus `common/` infrastructure. Compared field-by-field against ERD v2. Then: added **ADR-012** (ported tables take Kasync's literal schema as baseline); rewrote **ERD §2** ported entities and enums, added `User.isActive`, added Decimal precision + inherited constraints to §6, and replaced §7's open item with seven concrete porting notes; added `Import` and `Reconciliation` to **System Design §4** and reclassified `Auth`/`Users` as "Ported pattern, re-implemented"; added precision rules and `InvalidRoleBranchAssignmentException` to **Playbook §5/§6**; fixed the **Handbook §10** row that wrongly flagged `ADMIN` reconciliation as a bug, plus §5/§7/§8; added `Import` to **PRD §7**; bumped stale `Depends on` headers across all docs, `AGENTS.md`, and `README.md`. No code was written.
- **Decisions made during this task:** Three, all confirmed with the user before editing and recorded in ADR-012 — (1) keep Kasync's shared `TransactionType {INFLOW, OUTFLOW}` rather than renaming to `INCOME`/`EXPENSE`, because `AllocationService` and `MatchingEngine` compare the two types directly; (2) when ERD v2 and Kasync's schema conflict on a ported table, Kasync wins and the ERD is corrected; (3) apply corrections in-place with version bumps rather than as a separate addendum. `User.isActive` was chosen over a `deactivatedAt` timestamp to match the existing `Product.isActive` convention in ERD §3.
- **Status:** Done
- **Handoff notes:** Phase 0 (monorepo scaffolding) has a plan awaiting approval and has **not** started — no files exist under `apps/` or `packages/` yet. The three biggest things Phase 1 now needs to know are all in ERD §7: stripping Kasync's multi-tenant `userId` makes porting an adaptation rather than a copy (it touches every method of every ported service, and Kasync's own tests assert on that scoping, so they need rewriting); Kasync's self-registration and self-delete endpoints must not be ported; and the SQL triggers should be copied from the `20260809180000_multi_tenancy_and_triggers` migration, not the `init` one, because the later version has a corrected enum cast. One consequence worth planning for early: `LedgerEntry.categoryId` stays required, so the seed must create system categories before any `Sale` or `PayableSettlement` can generate its ledger entry.

_(Add the next entry above this line, following the template.)_