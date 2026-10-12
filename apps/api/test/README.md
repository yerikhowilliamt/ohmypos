# apps/api/test (e2e)

Jest e2e suites against **real Postgres**, run with `pnpm --filter api test:e2e` (`--runInBand`). Unit tests live next to the code in `src/**/*.spec.ts`.

## Setup

- `setup-e2e.ts` loads `.env.test`, which points at a **dedicated `ohmypos_e2e` database** (DEBT-020), never the `ohmypos_db` that `pnpm dev` uses. `resetDatabase()` truncates everything. `.env.test` also raises `THROTTLE_LIMIT` so the concurrency suite measures locks, not the throttler.
- `tenant-fixture.ts` builds tenant-scoped fixtures with `tenantBoundExtension`, because Jest runs `beforeAll` and each `it` in sibling async contexts where a request scope would be invisible.
- **Every suite authenticates for real**: guards are global, so there is no unguarded path.
- **Cleanup order matters on a seeded database.** Financial foreign keys are `Restrict` (`Sale`, `SupplierPurchase`, `PayableSettlement` → `LedgerEntry`; `SaleItem` → `Product`; purchase items and movements → `RawMaterial`), so child and financial rows are deleted before their parents (ERR-004).

## Conventions

- **Isolate by data, not by order.** Suites share one database, so each uses its own branches, materials, products or date windows (for example `stock-movements` uses March 2024 only, and `reports` filters every assertion to its own branches), and gives each scenario its own material/product pair so absolute stock assertions do not depend on test order.
- **Assert ids, not names,** wherever a leak could return a lookalike row.
- **Prefer `Promise.allSettled` for concurrent requests.** `Promise.all` abandons in-flight requests on the first rejection; their late writes then land after cleanup and orphan rows. Network-level rejections are asserted to be zero, like 5xx.
- **Decimal assertions use literal scale strings** (`"4530.00"`), which catches `Prisma.Decimal.toJSON()` dropping the scale.

## Suites worth knowing before editing

| Suite | What it guards | Rules |
|---|---|---|
| `monthly-cycle` | PRD §9's success criterion: one full monthly cycle (opening stock → sales → purchases → closing) with no manual correction | **Every cycle action goes through HTTP**; Prisma appears only in `beforeAll` fixtures and in read-back assertions. **Every expected figure is a hand-computed literal** from the PRD and ADR definitions, never from the code under test (hand-computed during Phase 14 verification hardening). The month is 2026-07 because a future `soldAt` is rejected; do not "modernise" the dates. The 31 July 23:30 WIB sale (S6) is the ADR-023 boundary case. An action counter (20) is a tripwire against "fixing" a stage with Prisma |
| `tenant-isolation` | All three isolation layers from the outside: the Prisma extension, the composite FKs, and the hand-written `tenant_id` in raw SQL (`reports.service.ts`, DEBT-064), which only this suite covers | Fixtures are **named identically in both tenants** on purpose: a leak returning a same-named row would pass a name assertion, so every assertion uses ids. If any global unique had stayed global, the second tenant's fixtures would fail in `beforeAll`. Only the owner email differs, because `users.email` is globally unique (ADR-025 Decision 6) |
| `inventory` | Case R builds a full month through the real endpoints, then reconciles it three ways: the report identity, an **independent raw-SQL oracle** sharing no code with production, and `currentStock` | Two implementations that must agree beat one tested against itself |
| `stock-movements` | The read endpoint | Fixtures via Prisma for exact control. `movementDate` (March) and `createdAt` (April) are set in opposite orders, so a service filtering or sorting the wrong column returns nothing instead of something plausible |
| `concurrency` | Oversubscribed sales (ADR-007), double settlement, import dedup, B1 lock-order deadlock probe (ADR-016), B2 two branches sharing one pool, B3 sale-vs-purchase race, B4 30-way partial settlements, B5 per-request timing | B5 interleaves branches (`i % 2`), so both compete in every request window. B3 is deliberately non-deterministic; any interleaving must still reconcile |
| `allocation-sum` | The allocation caps, enforced by both the service and the trigger | Must hit real Postgres: the trigger is the point |
| `auth-rbac` | Guards and the JWT lifecycle through real HTTP and cookies | A unit test of guard classes would pass even if they were never wired to a controller |
| `platform` | Platform console; the first block enumerates every route from `PlatformModule`'s controllers and requires 401 without a session (DEBT-066) | The enumeration comes from module metadata, so a new route cannot be missed |
| `sales`, `purchasing-payables`, `reports`, `master-data` | Each module's full flow, RBAC, rollback and decimal scale | — |
| `idempotency` | Replays and concurrent duplicate keys on sales and purchases | — |
| `volume-smoke` | Report timing against the `_volume` database (`prisma/seed-volume.ts`) | — |
