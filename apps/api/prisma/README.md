# apps/api/prisma

**Related:** [`docs/03 - ERD.md`](../../../docs/03%20-%20ERD.md) (entities, relationships, porting notes) · ADR-004, ADR-005, ADR-006, ADR-007, ADR-011, ADR-012, ADR-013, ADR-014, ADR-015, ADR-018, ADR-024, ADR-025 · AGENTS.md (approval gate)

**Any change to `schema.prisma` or a migration needs approval first** (AGENTS.md). Migrate with `pnpm --filter api prisma migrate dev --name <name>`, then reseed with `pnpm --filter api db:seed`. Prisma-generated migrations in this repo try to drop the composite tenant FKs and uniques and must be hand-edited (DEBT-063).

## Schema conventions

- **Ported tables keep Kasync's literal schema** as their baseline (ADR-012), including enum names: `TransactionType` is `INFLOW`/`OUTFLOW` and `TransactionStatus` has four values, because the SQL triggers write those literals and `AllocationService`/`MatchingEngine` compare types across tables. Do not rename them.
- **The generator emits TypeScript into `src/generated/prisma`** (Prisma 7). `moduleFormat = "cjs"` and `importFileExtension = ""` are required, because otherwise the generated imports carry `.ts` extensions that `moduleResolution: node` rejects.
- Decimal scales: money `Decimal(18,2)`, quantity `Decimal(18,4)`, **per-unit cost `Decimal(18,6)`** (a rate: Rp10.000 / 3.000 g does not land on 2dp, ADR-024), waste percent `Decimal(5,2)`.
- **Calendar facts use `@db.Date`** (`OpeningStock.periodMonth`, leave `startDate`/`endDate`). A month or a leave day is not an instant, and a date column cannot be defeated by a differing time of day in a unique key.
- **Append-only tables have no `updatedAt`**: `Allocation`, `SaleItem`, `SupplierPurchaseItem`, `PayableSettlement`, `StockMovement`. Corrections are new rows, never edits. Revoking an allocation is a status change (`revokedAt`), not a delete.

### `tenantId` and `@default("")` (ADR-025)

Every tenant-owned model has `tenantId String @default("")`. The value is **set at runtime by the Prisma tenant extension**, never by callers (see `src/common/README.md`). The `@default("")` exists **only** to make the field optional in Prisma's create input types, so existing modules did not have to thread a tenant argument through every write. The empty string is not a valid tenant id and no row ever holds it: an insert that somehow escaped the extension fails loudly on `<table>_tenant_id_fkey` instead of landing anywhere. Child tables carry `tenantId` too, however redundant that looks, because it lets the extension apply one rule to every model.

Platform models have no `tenantId`: `Tenant`, `PlatformAdmin` (not a `User`, so `User.tenantId` can be NOT NULL with no exception), and `ImpersonationSession` (append-only apart from `endedAt`).

### Denormalized balances and their single writers

| Column | Source of truth | Only writer |
|---|---|---|
| `RawMaterial.currentStock` | `StockMovement` log | `StockMovementsService`, under `FOR UPDATE` (ADR-007) |
| `RawMaterial.unitCost` | latest purchase line | `SupplierPurchasesService` write-back (ADR-024), or master-data edit |
| `Payable.remainingBalance`, `status` | `PayableSettlement` rows | `PayablesService.settle`, under `FOR UPDATE` |
| `BankTransaction.status` | `Allocation` rows | `trg_sync_transaction_status` trigger |

Seeds go through the same services for these columns rather than writing them by hand (see below).

### Model notes

| Model | Notes |
|---|---|
| `Branch` | `isSystem` marks the per-tenant system branch (ADR-014), created only by `ensureSystemRefs` and looked up by flag, not name. `isMainStore` is the Owner's first store. Each is limited to one row per tenant by a partial unique index (`branches_single_system`, `branches_single_main_store`, defined in migrations) |
| `LedgerEntry` | `accountId` is required (Kasync had no account link). `categoryId` is required, so system categories must exist. `sourceType` + `sourceId` trace the generating event; `sourceId` is polymorphic, with no FK. At most one of the three 1-1 back-relations (`sale`, `supplierPurchase`, `payableSettlement`) is set. `Account` is `Restrict`, so deleting an account never deletes financial history |
| `BankTransaction` | Unique `(accountId, externalRef)` and `(accountId, dedupHash)` make re-imports no-ops |
| `User` | `branchId` is required for `KASIR` and null for `ADMIN`/`OWNER` (Prisma cannot express this; enforced in Zod and the service). Users are deactivated, never deleted, because `Sale.userId` is an audit trail. `tokenValidFrom` drives session revocation. `photoUrl` is a Cloudinary `secure_url` (ADR-020) |
| `RawMaterial` | `unit` is the stock/recipe base unit for **every** quantity (`currentStock`, `lowStockThreshold`, recipe, movements, opening stock), and is **immutable once movements exist** (enforced in the service). `purchaseUnit` + `conversionFactor` describe the supplier's pack and stay editable; purchase lines keep a snapshot. `conversionFactor` default 1 means "bought in the stock unit", which is what the ADR-024 backfill set |
| `Product` | No stored HPP (computed live, ADR-005) and no stock (makeable quantity is derived, ADR-013). `wastePercent` affects HPP only, never stock deduction; default 0 keeps pre-ADR-024 HPP unchanged |
| `RecipeItem` | The recipe is this set of rows, with no separate Recipe table. Cascades with its product; `Restrict` on raw material, so a material in use cannot be deleted |
| `Sale` | Always a real branch (no central sale) and **always** a required, unique `ledgerEntryId`: unlike a purchase, money always moves at a sale. `totalAmount = Σ lineTotal`, with no tax or discount (ADR-015). Nullable `idempotencyKey` with a unique index per tenant (no backfill needed, since Postgres allows repeated NULLs). `status` defaults to `COMPLETED`; a void flips it and writes reversal rows (DEBT-010). `Restrict` on every parent: a sale is financial history |
| `SaleItem` | **Not** unique per product: one product may appear at two prices. `hppAtSale` is the **per-unit** HPP frozen at sale time, never recomputed. `isPriceOverridden` is true only when the price differs from `sellPrice` |
| `SupplierPurchase` | `branchId = null` is the only marker of a central purchase. `ledgerEntryId` is set at creation iff `PAID`, otherwise null forever (settlements carry their own entries). Unpaid means one `Payable` (ADR-006) |
| `SupplierPurchaseItem` | Snapshot of what was bought (`purchaseQuantity`, `purchaseUnit`, `conversionFactor`) and what stock received (`quantity`, `unitCost` at 6dp). `lineTotal` is the user's input. One line per material per purchase |
| `Payable` / `PayableSettlement` | One payable per unpaid purchase. Each settlement has exactly one, required, expense `LedgerEntry` |
| `StockMovement` | `branchId` is attribution only (null for central events). `referenceId` is polymorphic, with no FK. `ADJUSTMENT` has no writer yet, deliberately. Index `(rawMaterialId, movementDate, direction)` covers the inventory summary's unbounded carry-forward `groupBy` (DEBT-013) |
| `OpeningStock` | A stock-take **declaration** of the physical count at the period start (not a delta); the correction is an `OPENING` movement. `unitPrice` is required iff the material has no purchase that period (nullable, deviating from ERD v3 §3). Unique `(rawMaterialId, periodMonth)` makes the PUT idempotent |
| `Device` / `AttendanceRecord` | A terminal belongs to a branch, not a user (a branch shares a few tablets). `activationCode` is single-use and expiring, and only exists until activation. Attendance is one row per `KASIR` login, **informational only**; IP and user agent are never used to decide validity |
| `LeaveRequest` | Approved or rejected by an `OWNER`. Requester and reviewer are two named relations to `User` |

## Migrations

`migrations/` is immutable history, so its SQL comments stay. Notable hand-written SQL: the allocation-sum triggers (`trg_check_allocation_sum` in `init`, `trg_check_ledger_allocation_sum` in `20260823120100_…`), `trg_sync_transaction_status`, and the partial unique indexes on `branches`.

## Seeds

| Script | Command | Use |
|---|---|---|
| `seed.ts` | `pnpm --filter api db:seed` | Development and e2e fixtures. **Never against production** |
| `seed-demo.ts` | `pnpm --filter api db:seed:demo -- --yes` | One self-contained showcase tenant, **safe for production** |
| `seed-volume.ts` | `ts-node prisma/seed-volume.ts` (see the file) | Bulk data for timing report queries only, in a database whose name ends in `_volume` |

### Shared rule: derived figures go through the services

`hppAtSale`, `totalAmount`, `currentStock`, `unitCost`, `remainingBalance` and `paymentStatus` each have exactly one legitimate writer. A seed that computed them by hand would be a second writer, outside `src/`, invisible to the single-writer checks, and wrong the moment a recipe or cost changed. Seeds therefore call `SupplierPurchasesService`, `PayablesService` and `SalesService`, constructed directly (they are plain classes, and the Prisma service builds its own adapter from `DATABASE_URL`) without booting Nest. Only the inputs are literals. Seeds call services without a `role`, because the 3-day backdate limit and the price-override ban are `KASIR` rules (TASK-087, DEBT-009) and seeds write history on the Owner's behalf.

### `seed.ts` (development fixtures)

Synthetic data only (Handbook §6). Load-bearing content: the initial `OWNER`; system refs through `ensureSystemRefs` (the same function production uses, so the two cannot drift); purchasing, sale, opening-stock and reconciliation fixtures that the e2e suites assert on.

- **Do not move asserted figures.** The e2e suites assert exact balances, for example Es Kopi Susu's HPP of `0,25 kg × 12.000 + 0,018 kg × 85.000 = 4.530,00`. The same figure is used to catch the `toJSON()` scale trap in two suites at once. New fixtures must not shift existing numbers: the ADR-024 "ekor → pcs" material has no recipe and no movements, and the opening-stock fixture is declared equal to current stock, so its delta is 0. A seed that moved those balances would be ERR-004 a third time.
- **Reconciliation fixtures** are written directly (there are no derived balances there). Statuses come from the real triggers when `Allocation` rows are inserted. They cover every `TransactionStatus` and one candidate per `MatchType`: EXACT (same amount and day), AGGREGATION (two transactions summing to one entry), FUZZY (2 days apart), PARTIALLY_ALLOCATED, MATCHED, one already PENDING_REVIEW with no candidate (showing that candidates are not persisted), and one UNRESOLVED with nothing nearby.
- It also seeds a `PlatformAdmin` and staff on the hardcoded password `ChangeMe123!`, upserts the tenant with slug `default`, and pins four `Account` ids to `00000000-…-0001..0004`. These are all reasons it must never run against production.

### `seed-demo.ts` (production-safe showcase tenant)

The opposite of `seed.ts` on every production risk:

1. The tenant comes from `DEMO_TENANT_SLUG`, and **`default` is rejected**, so the real business's tenant is unreachable.
2. **No `PlatformAdmin`** is ever written (that is `scripts/create-platform-admin.ts`'s job).
3. **Every password comes from env**, never from a literal; the script exits rather than invent one.
4. **Every id is a deterministic UUIDv5 from the slug** (`uuidFrom`), so demo tenants can coexist (including the globally unique `Device.activationCode`) and a re-run is an upsert, not a duplicate.
5. It aborts if the target tenant already has a user outside the derived demo accounts, so a slug typo cannot inject a fictional coffee shop into a real customer's books.
6. Without `--yes` it prints its plan and exits.

All writes run inside `runWithTenant`, so a cross-tenant write cannot be expressed. Required env: `DEMO_TENANT_SLUG`, `DEMO_TENANT_NAME`, `DEMO_OWNER_NAME`, `DEMO_OWNER_EMAIL`, `DEMO_OWNER_PASSWORD`. Optional: `DEMO_STAFF_PASSWORD` (defaults to the owner password), `DEMO_VOLUME` (default 1).

Data rules learned the hard way (each one was a visible defect on the dashboard):

- **Idempotent sales.** The sale mix comes from a slug-seeded PRNG (mulberry32), and the plan is simulated against the **literal purchase quantities**, not live `currentStock`. Reading live stock would produce a different, already depleted plan on the second run, create sales under fresh keys, and make revenue climb on every re-run.
- **`DEMO_VOLUME`** scales restock quantities and daily sales **together**, and is folded into the idempotency keys. Every literal is a whole number of purchase units, so integer multiples stay exact.
- **Costs reproduce exactly.** Purchase line prices are chosen so the latest-cost write-back (`lineTotal / (purchaseQuantity × conversionFactor)`) lands exactly on each material's `unitCost` (5 kg for Rp900.000 = Rp180/g). Change one side and the demo's HPP moves.
- **Perishables are restocked weekly**, not once. With one opening restock, stock only falls, sales decay toward the end, and the dashboard's default "hari ini" view lands on the thinnest day. The simulator's safety stock is an **absolute** 60% of `lowStockThreshold`: a share of cumulative purchases rose with every delivery and starved later weeks.
- **Every product has a recipe**, because `SalesService` rejects a recipeless product (ADR-013).
- **Trading hours are WIB wall-clock times** converted to instants (ADR-018). `setUTCHours(8..20)` showed 15:00–03:00 on screen and split each day across two report days.
- **A cash deposit is not income.** Booking "Setoran tunai ke bank" as an INFLOW double-counted revenue the sales had already recorded, giving a 9× spike. This product has no transfer concept, so the entry must not exist. **Rent and payroll land on different days** (start of month; two fortnightly runs). The chart plots income and net profit on one Y axis, so a single outlier flattens every other day.
- **Opening stock is written directly**, not through `OpeningStockService.upsert`: that method would apply the declaration as a delta movement and double-count a figure derived from the movements just created. It uses the WIB month.
- **Reconciliation fixtures** mirror `seed.ts` (every status, one candidate per match type), at amounts near daily trading scale so they cannot distort the income chart.

### `seed-volume.ts` (query timing only)

Bulk-inserts sales, items, ledger entries and stock movements with `createMany`, **bypassing every service**. This is correct only because the timed endpoints (`/reports/*`, `/inventory/summary`) read nothing else. `currentStock` will **not** reconcile with the movement log in this database, so never use it for anything but timing. **Hard guard:** it refuses to run unless the `DATABASE_URL` database name ends in `_volume`; `--months=36` inserts about 1.2M rows. It writes through the tenant-filtered client, so tenant scoping is defined in one place. The volume users share a fixed bcrypt hash of `VolumeTest123!`, for logging into that disposable instance over HTTP.
