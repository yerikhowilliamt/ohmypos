# OhMyPos — Tech Debt Log

**Purpose:** Track every deliberate shortcut or simplification taken to ship v1 faster — things that are correct and acceptable for now, but that we already know will need revisiting once the product is production-ready and stable. This log is the worklist for the post-launch cleanup pass; nothing here is urgent by definition, but nothing here should be forgotten either.

**Depends on:** ADR-001–012, System Design v4 §11 (Risks / Things to Revisit)

---

## How to use this log

- Log debt the moment it's *knowingly* taken — a deliberate "this is the simple version for now" decision, not a bug (that's the Error Log) and not a TODO comment left in passing.
- A debt entry needs a **trigger condition** — the concrete signal that means it's time to pay it off (e.g. "when report queries exceed 500ms at real data volume," not "eventually"). Vague triggers make debt invisible until it's already hurting.
- Debt already identified during planning (from ADR "Alternatives considered" / "Consequences" sections and System Design §11) is seeded below — these aren't hypothetical, they're decisions we already made knowing the cost.
- When debt is paid off, don't delete the entry — mark it **Resolved**, note the date and what was done, and move it to the bottom under "Resolved." This keeps a record of what v1 actually cut corners on, for anyone auditing the project later.
- Review this log as a whole once the product is feature-complete and production-ready, per the plan — that's the trigger to schedule a dedicated cleanup pass rather than paying off debt piecemeal mid-feature-work.

---

## Entry Template

```
### DEBT-XXX — <short title>

- **Date logged:** YYYY-MM-DD
- **Found during:** <task/phase, or "Planning" if identified before implementation —
  link to Task Log entry if one exists>
- **Description:** <what was simplified/deferred, and what the "full" version would
  look like>
- **Why deferred:** <the actual reason it was acceptable to defer — not enough data
  volume yet, not enough time, waiting on a decision elsewhere, etc.>
- **Impact if unaddressed:** <what breaks or degrades if this is never paid off>
- **Trigger condition:** <the concrete signal that means it's time to fix this>
- **Proposed resolution:** <what paying this off would actually involve>
- **Priority:** Low | Medium | High
- **Status:** Open | Resolved
```

---

## Log

### DEBT-010 — Physical Device Cookie Extraction / DevTools Cloning

- **Date logged:** 2026-08-19
- **Found during:** Phase 11 (TASK-035: Attendance & Device Tracking, ADR-021)
- **Description:** Device identification relies on a long-lived HttpOnly signed cookie (`ohmypos_device`). An employee with physical access and technical familiarity could inspect browser storage / network requests on the store tablet and copy the signed cookie onto a personal device to pass the attendance check.
- **Why deferred:** Acceptable residual risk for v1 in typical retail operations. Browser fingerprinting is unreliable and brittle across browser updates; hardware-bound WebAuthn / client certificate enrollment adds massive operational complexity for store tablet setup.
- **Impact if unaddressed:** A tech-savvy employee could bypass attendance violation logging from their personal phone.
- **Trigger condition:** Evidence of employee spoofing attendance via copied device cookies or request for hardware-level device attestation.
- **Proposed resolution:** Implement WebAuthn / hardware-backed device keys (FIDO2 / passkey enrollment) or a dedicated installed wrapper app with secure enclave binding.
- **Priority:** Low
- **Status:** Open

---

### DEBT-009 — Cloudinary direct upload vs server-side proxy

- **Date logged:** 2026-08-19
- **Found during:** Phase 10b (TASK-034: Profile Photo Upload)
- **Description:** File foto profil diupload ke backend API (`POST /auth/me/photo`) menggunakan multipart parser NestJS/Multer lalu diproxy streaming ke Cloudinary. Belum menggunakan signed direct upload URL dari browser langsung ke Cloudinary.
- **Why deferred:** Volume upload avatar profil internal staff rendah, alur streaming server-side sederhana dan memvalidasi ukuran serta sesi otentikasi secara sentral tanpa memaparkan credential signature endpoint tambahan.
- **Impact if unaddressed:** Sedikit konsumsi bandwidth & memory upload stream pada server backend saat user upload foto.
- **Trigger condition:** Volume user bertambah drastis atau ada upload gambar/aset berskala besar di masa mendatang.
- **Proposed resolution:** Implementasi signed upload URL endpoint (`/auth/me/photo/sign`) dan upload langsung dari browser ke Cloudinary.
- **Priority:** Low
- **Status:** Open

---

### DEBT-008 — Thermal printer ESC/POS command integration for receipts

- **Date logged:** 2026-08-19
- **Found during:** TASK-027 (Sales History & Receipt Printing)
- **Description:** Struk penjualan saat ini dicetak menggunakan dialog browser standar (`window.print()`). Integrasi direct printing ke Bluetooth/USB thermal printer via ESC/POS protocol / WebUSB / WebBluetooth belum diimplementasikan.
- **Why deferred:** Browser print dialog sudah mencukupi untuk MVP desktop/tablet, format CSS `@media print` sudah rapi, dan menghindari dependensi hardware khusus di tahap awal.
- **Impact if unaddressed:** Pengguna POS fisik perlu konfirmasi manual di dialog cetak browser setiap kali print struk ke thermal printer.
- **Trigger condition:** Merchant membutuhkan print cepat otomatis 58mm/80mm tanpa popup print browser.
- **Proposed resolution:** Implementasi driver client WebBluetooth / WebUSB atau websocket print service lokal dengan payload ESC/POS.
- **Priority:** Low
- **Status:** Open

---

### DEBT-001 — Reports computed at query time, no materialized views

- **Date logged:** 2026-08-12
- **Found during:** Planning (ADR-008)
- **Description:** Dashboard 3 (P&L, top products, etc.) and Dashboard 5 (inventory summary) are computed by querying `LedgerEntry`, `SaleItem`, and `StockMovement` directly on every request, rather than from a precomputed/materialized read model.
- **Why deferred:** Simplest possible implementation for v1, and correct by construction (no cache-invalidation logic needed). Appropriate at the transaction volume of a single small multi-branch business.
- **Impact if unaddressed:** Report queries slow down as historical data accumulates, especially once several months/years of `LedgerEntry` and `StockMovement` rows exist.
- **Trigger condition:** Any report route consistently exceeds ~500ms at real production data volume, or the business's transaction volume grows meaningfully beyond current expectations.
- **Measured (2026-08-17, Phase 7):** on synthetic volume across 3 branches spanning 12 months — profit-loss 2 ms, product-profit 2 ms, income-by-payment-method 3 ms, top-products 1 ms, daily-income 1 ms at a one-month range; 1 ms at a one-year range. Trigger for reopening ADR-008: >1 s at a one-year range, or a sequential scan on `sale_items`/`ledger_entries` at a one-month range.
- **Proposed resolution:** Introduce materialized views or a dedicated read-model table for the report queries, refreshed on a schedule or on write.
- **Priority:** Medium
- **Status:** Open

### DEBT-002 — Pessimistic row-lock on `RawMaterial` for stock concurrency

- **Date logged:** 2026-08-12
- **Found during:** Planning (ADR-007, System Design §11)
- **Description:** Stock decrement during `Sale` creation uses `SELECT ... FOR UPDATE` on the `RawMaterial` row, serializing concurrent sales that consume the same raw material.
- **Why deferred:** Correct and simple; no retry-handling complexity needed. Fine at the business's actual, low concurrent-transaction volume.
- **Impact if unaddressed:** Lock contention could become a bottleneck if multiple branches sell high-volume, shared-ingredient products at the same moment with meaningfully higher throughput than today.
- **Trigger condition:** Observed lock wait times or timeouts on `RawMaterial` writes under real usage.
- **Proposed resolution:** Move to optimistic concurrency (a version column on `RawMaterial`, retry on conflict) for the stock-decrement step.
- **Priority:** Low
- **Status:** Open

### DEBT-004 — Approved mockup shows features with no data model behind them

- **Date logged:** 2026-08-15
- **Found during:** Review of the Claude Design mockup (`OhMyPos App.dc.html`) — see DESIGN.md, "Approved Mockup"
- **Description:** The mockup renders several things ERD v3 has no field for: SKU and barcode scanning, a discount code (`MEMBER10`) with a discount line, an 11% tax line, an expense approval state ("menunggu persetujuan · perlu ditinjau"), an order type ("Dine-in"), and a cashier shift ("Shift #4192 · dibuka 08:12"). `SaleItem` carries `unitPriceAtSale` and `isPriceOverridden` but nothing for tax or discounts; `SupplierPurchase.paymentStatus` is `PAID`/`UNPAID`/`PARTIALLY_PAID` with no review state. Shift management is an explicit PRD §3 non-goal.
- **Why deferred:** Deliberately not built (decision recorded 2026-08-15). Rendering them as static UI would promise behaviour the system does not have, which is worse than leaving them out.
- **Impact if unaddressed:** Each is a silent expectation gap. Tax and discount in particular affect what `Sale.totalAmount` means and therefore every figure in Dashboard 3 — adding them later is a schema and reporting change, not a UI change.
- **Trigger condition:** The business owner asks for any one of them, or Phase 3's `Sale` flow is specified — whichever comes first.
- **Proposed resolution:** Take them one at a time through the normal schema-approval gate. Tax and discount should be decided together, before `Sale` is built, because both change the total's definition.
- **Priority:** Medium
- **Status:** Partially resolved (2026-08-16) — Tax, discount, and order type decided per ADR-015 (Phase 5 planning): none get schema support in v1. `Sale.totalAmount = Σ SaleItem.lineTotal`; discounts are expressed through the existing per-line price override (`unitPriceAtSale` + `isPriceOverridden`). SKU/barcode scanning, the expense approval state, and the cashier shift remain **Open** — none of the three is touched by Phase 5 and each still needs its own approval pass.

### DEBT-006 — RawMaterial.unitCost not updated by purchases

- **Date logged:** 2026-08-16
- **Found during:** Phase 4 (Purchasing & Payables planning §5)
- **Description:** A purchase records `unitCost` per item and `StockMovement.unitCostAtMovement` snapshots it, but does not write back to `RawMaterial.unitCost`. `unitCost` remains master data updated only via `PATCH /raw-materials/:id`.
- **Why deferred:** Writing to `RawMaterial.unitCost` on purchase silently changes live HPP for all products (ADR-005) and is a costing-method decision (last-cost vs moving-average) with no approved ADR.
- **Impact if unaddressed:** Live HPP may diverge from actual recent purchase prices if master data unit costs are not kept up to date by staff.
- **Trigger condition:** The business owner reports that live HPP is stale relative to actual purchase prices.
- **Proposed resolution:** Decide the costing method explicitly in an ADR superseding or extending ADR-005 (e.g. weighted moving average or last purchase cost).
- **Priority:** Low
- **Status:** Open

### DEBT-007 — No DB-level trigger enforcing payable settlement sum constraint

- **Date logged:** 2026-08-16
- **Found during:** Phase 4 (Purchasing & Payables planning §2 Option D)
- **Description:** `Payable.remainingBalance` and settlement bounds are enforced in the service layer under `SELECT ... FOR UPDATE` row lock, rather than via a PostgreSQL trigger (`trg_check_payable_settlement_sum`).
- **Why deferred:** In v1, there is exactly one writer to `PayableSettlement` (inside `PayablesService.settle`). Adding a trigger introduces P2039 driver error unwrapping fragility (ERR-001) for a single-writer flow.
- **Impact if unaddressed:** If a future second write path (e.g. bulk data import or raw SQL migration) is introduced and omits locking, over-settlement could theoretically occur.
- **Trigger condition:** A second write path or bulk import for `PayableSettlement` is added.
- **Proposed resolution:** Add `trg_check_payable_settlement_sum` trigger in a migration, modeled on `trg_check_allocation_sum`.
- **Priority:** Low
- **Status:** Open

### DEBT-008 — Raw-material locks acquired one statement per row, not one batched `ANY($1) ORDER BY id`

- **Date logged:** 2026-08-16
- **Found during:** Phase 5 (Sales planning §2.4) — ADR-016
- **Description:** `StockMovementsService.lockRawMaterialsInIdOrder` issues one `SELECT ... FOR UPDATE` per raw material, in a loop, rather than a single `SELECT id FROM raw_materials WHERE id = ANY($1) ORDER BY id FOR UPDATE`. The batched form would cut the lock phase from M round trips to one.
- **Why deferred:** The batched form's lock ordering depends on `LockRows` sitting above `Sort` in the query plan — true today, but a query-plan dependency that no test in this repo can pin. A future planner/statistics change could reorder it with no code change, surfacing as an intermittent `40P01` in production against a green test suite. The per-statement loop's order is fixed by the calling code, not the planner, and is provable by a unit test with no database (ADR-016).
- **Impact if unaddressed:** At a realistic cart (≤ 8 products → ≤ 15 distinct materials) the extra round trips are single-digit milliseconds inside a transaction that already runs ~10 statements — negligible at current volume.
- **Trigger condition:** The lock-acquisition phase is measured as a meaningful share of sale latency at real transaction volume.
- **Proposed resolution:** Switch to the batched `ANY($1) ORDER BY id` statement, and add an `EXPLAIN`-based test (or a Postgres version pin) that asserts `LockRows` sits above `Sort` in the plan, so a planner change fails CI instead of failing silently in production.
- **Priority:** Low
- **Status:** Open

### DEBT-009 — Per-line sale price override has no role restriction

- **Date logged:** 2026-08-16
- **Found during:** Phase 5 (Sales planning §1 decision 6, §8.2)
- **Description:** `CreateSaleSchema`'s `unitPrice` override is available to `KASIR`, `ADMIN`, and `OWNER` alike — any authenticated cashier can charge below (or above) `Product.sellPrice` on any line, with no approval step and no per-role ceiling. Playbook §6 already names `PriceOverrideNotPermittedException` as an exception to add "if role-based restrictions on manual price override are added later" — v1 deliberately does not add them.
- **Why deferred:** PRD §5.2 specifies the override mechanism ("can be manually overridden for specific cases — e.g. discounts or negotiated prices") without naming who may use it or bounding it, and no ADR restricts it. Building a restriction now would be inventing a policy the business owner hasn't stated, not implementing one.
- **Impact if unaddressed:** A cashier can under-charge without any system-level check, which shows up only as a lower recorded `totalAmount` and `grossMargin` on that sale — nothing flags it as anomalous.
- **Trigger condition:** The business owner reports unauthorized or unusual discounting, or asks for an approval/ceiling policy on manual overrides.
- **Proposed resolution:** Decide the policy (a percentage ceiling, an `ADMIN`/`OWNER`-only override, or a post-hoc report of overridden lines) and encode it as a Zod refinement or a role check, raising `PriceOverrideNotPermittedException`.
- **Priority:** Low
- **Status:** Open

### DEBT-010 — No void/refund path for a `Sale`

- **Date logged:** 2026-08-16
- **Found during:** Phase 5 (Sales planning §11.2)
- **Description:** Once created, a `Sale` cannot be edited, voided, or refunded. A mis-keyed sale (wrong product, wrong quantity, double-entry) has no correction path other than manually recording compensating movements outside the system's guarantees — there is no reverse-stock-in, no reverse-ledger-entry, and no status field marking a sale as voided.
- **Why deferred:** Not in PRD §5.2's scope, and a void/refund flow needs its own transaction-boundary and ledger-reversal analysis (does it reverse the `LedgerEntry` or write an offsetting one? does stock go back to `RawMaterial.currentStock` or to a separate "returned" bucket? does `SaleItem.hppAtSale` still apply to the reversal?) — none of which any existing document answers, and Phase 5's scope is the forward flow only.
- **Impact if unaddressed:** A cashier error is currently uncorrectable within the system's own transactional guarantees. In practice this is a real F&B operational need, not a hypothetical.
- **Trigger condition:** The first mis-keyed sale in production, or the business owner asks for a void/refund flow — whichever comes first.
- **Proposed resolution:** Design a `SaleVoid`/`SaleRefund` flow (or a `Sale.status` state machine) through the normal planning-and-approval gate, once the forward flow (this phase) is stable and its transaction/lock patterns are proven.
- **Priority:** Medium
- **Status:** Open

### DEBT-011 — Topbar branch context is a static label, not a functional selector

- **Date logged:** 2026-08-17
- **Found during:** TASK-009 (Phase 8a — Frontend Auth/Nav Infra)
- **Description:** DESIGN.md §17/§50 call for Owner/Admin to get "All Branches" or a branch selector in the topbar. `apps/web/components/shell/Topbar.tsx` renders a static "Semua Cabang" string for Owner/Admin and a static "Cabang Terkunci" string for Kasir — neither is interactive, and there is no branch-filtering state anywhere in the frontend.
- **Why deferred:** Stock and cash are centralized pools with no per-branch balance anywhere in the schema (ADR-004) — a working selector would have nothing to actually filter yet. Building the control before there's branch-scoped data behind it would be UI theater.
- **Impact if unaddressed:** None currently — the static label is accurate today. Becomes misleading only once branch-scoped views/reports exist and Owner/Admin have no way to narrow to one branch from the topbar.
- **Trigger condition:** Any future phase introduces branch-scoped reporting or data views for Owner/Admin (a schema/architecture change that would need its own ADR revisiting ADR-004 first, per AGENTS.md).
- **Proposed resolution:** Once branch-scoped data exists, wire the topbar label into a real selector that filters the current view's query params/state.
- **Priority:** Low
- **Status:** Open

### DEBT-016 — Report rows are unpaginated

- **Area:** `apps/api/src/modules/reports` (Dashboard 3)
- **What:** `GET /reports/product-profit` returns one row per product sold in the range with no pagination, and `GET /reports/daily-income` one row per day (bounded at 366 by `MAX_REPORT_RANGE_DAYS`).
- **Why it was accepted:** at v1 scale the product catalogue is a café menu — tens of rows. The frontend renders the whole set as one table plus one chart, so paginating it would complicate both sides for no benefit today.
- **Trigger to fix:** the product catalogue exceeding ~500 active products, or a product-profit response exceeding ~1 MB.
- **Fix when triggered:** additive query parameters (`page`, `limit`) on the product-profit endpoint reusing `PaginationQuerySchema` — not a redesign.
- **Status:** Open

### DEBT-013 — No closing-stock snapshots — query-time calculation scale boundary

- **Date logged:** 2026-08-17
- **Found during:** Phase 6 (Inventory planning §13.4)
- **Description:** Inventory Summary (`GET /inventory/summary?period=YYYY-MM`) computes opening, in, out, and closing quantities entirely at query time via `groupBy` over `StockMovement` (ADR-008). There is no stored `closingStock` table or snapshot column.
- **Why deferred:** Query-time computation is correct by construction (no cache invalidation or out-of-sync snapshot anomalies). At v1 transaction volume for a single small multi-branch business (~5,000 movements/month), indexed aggregation runs well under 20ms.
- **Impact if unaddressed:** At higher volume (e.g. multi-year history, >50,000 movements), multi-period report queries will scan larger index ranges.
- **Trigger condition:** `GET /inventory/summary` p95 response time exceeds 250ms under production volume.
- **Proposed resolution:** Introduce a monthly closing snapshot table populated on period close or asynchronously computed read-model.
- **Priority:** Low
- **Status:** Open

### DEBT-014 — OpeningStock unitPrice historical immutability vs master data PATCH

- **Date logged:** 2026-08-17
- **Found during:** Phase 6 (Inventory planning §13.4)
- **Description:** `OpeningStock.unitPrice` is snapshotted into `OpeningStock` and `StockMovement.unitCostAtMovement`. However, live HPP uses `RawMaterial.unitCost`. If a user modifies master data `RawMaterial.unitCost` via `PATCH /raw-materials/:id`, live product HPP shifts for future sales without changing historical opening stock valuation.
- **Why deferred:** Deliberate architecture decision (ADR-005): historical snapshot vs live master data.
- **Impact if unaddressed:** None on accounting accuracy (historical numbers are immutable). Stakeholders may wonder why live HPP changed after a master data edit if not informed of the design.
- **Trigger condition:** Business owner asks for audit history or retrospective valuation reports.
- **Proposed resolution:** Maintain a formal `RawMaterialCostHistory` table if retrospective inventory valuation is ever required.
- **Priority:** Low
- **Status:** Open

### DEBT-015 — OpeningStock has no branchId; multi-branch inventory requires new model

- **Date logged:** 2026-08-17
- **Found during:** Phase 6 (Inventory planning §13.4)
- **Description:** `OpeningStock` is centralized (no `branchId`), matching the centralized raw material stock pool (ADR-004).
- **Why deferred:** PRD §3 explicitly states single business with centralized stock in v1.
- **Impact if unaddressed:** Cannot perform per-branch stock-takes or branch-specific inventory counts without a schema change.
- **Trigger condition:** An ADR revisiting ADR-004 to introduce branch-level stock tracking.
- **Proposed resolution:** Add optional `branchId` to `OpeningStock` and transition `RawMaterial` to per-branch balances.
- **Priority:** Low
- **Status:** Open

### DEBT-017 — `POST /sales` has no idempotency key, so a lost response is unresolvable

- **Date logged:** 2026-08-17
- **Found during:** Phase 8c (TASK-017) — designing the POS submit failure paths
- **Description:** If the sale request reaches the server and commits but the response is lost (network drop, 5xx after commit), neither the cashier nor the client can tell whether money and stock moved. There is no client-supplied idempotency key on `POST /sales` and no way to ask "did my request land". A blind retry writes a second `Sale`, a second income `LedgerEntry`, and a second stock decrement — the exact double-write risk ADR-016 cites when it rejects optimistic retry.
- **Why deferred:** Adding one properly means a request-id column with a unique constraint plus a replay path that returns the original `SaleResponse` rather than a 409 — a schema change and an API contract change, both gated. The POS mitigates the failure honestly in the meantime: a network-level or 5xx failure is marked `uncertain` rather than `error`, no retry button is offered, and the cashier is pointed at "Periksa transaksi terakhir" (`GET /sales?limit=5&sortBy=soldAt`, which `BranchScopeGuard` scopes to their own branch) to see whether the sale landed before deciding.
- **Impact if unaddressed:** Real but bounded — it needs a lost response, and it currently costs the cashier a manual check rather than risking a duplicate. If the mitigation is ever removed and a plain retry button added, it becomes a live double-charge path.
- **Trigger condition:** A duplicated sale is observed in production, or the POS is put on a connection where lost responses are routine.
- **Proposed resolution:** Add a client-generated `idempotencyKey` (UUID) to `CreateSaleSchema` with a unique index on `Sale`. On replay, return the original `SaleResponse` with 200 instead of creating a second sale. Then the POS can offer a plain retry.
- **Priority:** Medium
- **Status:** Open

### DEBT-018 — POS omits mockup elements with no backing data model

- **Date logged:** 2026-08-17
- **Found during:** Phase 8c (TASK-017)
- **Description:** The POS screen deliberately does not render four things DESIGN.md describes. (1) The **category strip** (§22): `Product` has no category column, so the controls would filter nothing — search covers discovery instead. (2) **Tax, discount and order-type lines** in the order panel (§24's "discount where applicable"): none has schema support (ADR-015 decision 1, DEBT-004); a per-line price override with a "Harga khusus" marker is the entire discount mechanism. (3) **Product images** (§21's "where useful"): no image field exists. (4) **Cart persistence across a reload**: the cart is in-memory only, so an accidental refresh mid-order loses it.
- **Why deferred:** Each would either promise behaviour the system does not have — which DEBT-004 already judged worse than omitting it — or, for cart persistence, add scope beyond what this phase was asked for.
- **Impact if unaddressed:** (1)–(3) are expectation gaps against the approved mockup only. (4) is a real operational annoyance: a cashier who refreshes mid-order retypes it.
- **Trigger condition:** The business owner asks for menu categories or product photos; or a cashier reports losing an order to a refresh.
- **Proposed resolution:** Categories and images are additive schema work through the normal approval gate. Cart persistence is frontend-only — persist the reducer state to `sessionStorage`, keyed by branch, and rehydrate on mount.
- **Priority:** Low
- **Status:** Open

### DEBT-019 — `NEXT_PUBLIC_API_BASE_URL` fallback port disagrees with the actual API port

- **Date logged:** 2026-08-17
- **Found during:** Phase 8c (TASK-017), while verifying the POS against the running stack
- **Description:** `apps/web/lib/api.ts` falls back to `http://localhost:4013/api/v1` when `NEXT_PUBLIC_API_BASE_URL` is unset, but `apps/api/.env` sets `PORT=4015`, and `.env.local`, `.env.example` and `.agents/skills/e2e-playwright/SKILL.md` all say 4015. Frontend test mocks also hardcode 4013.
- **Why deferred:** Not touched in this task — `.env.local` is present in a working checkout, so the fallback never fires and fixing it was outside the phase's scope (AGENTS.md: edit only files strictly required).
- **Impact if unaddressed:** A developer who clones without `.env.local` gets connection failures against a port nothing listens on, with no error pointing at the cause.
- **Trigger condition:** Anyone setting up the repo without copying `.env.example`, or CI running the web app without the env var.
- **Proposed resolution:** Change the fallback in `lib/api.ts` to 4015 and update the three test mocks that assert 4013. One-line change plus test fixture updates.
- **Priority:** Low
- **Status:** Open

### DEBT-020 — The e2e suite and `pnpm dev` share one database, and `db:seed` cannot restore it

- **Date logged:** 2026-08-17
- **Found during:** Phase 8c (TASK-017) — the dev database was found empty after running the api e2e suite
- **Description:** `apps/api/test/*.e2e-spec.ts` run their `cleanup()` against the same Postgres database `pnpm dev` uses, so running the e2e suite wipes local development data. AGENTS.md points at `pnpm --filter api db:seed` to "reset synthetic data", but the seed's `rawMaterial.upsert` (and others) use `update: {}` — on an existing row it changes nothing, so it recreates missing rows but cannot restore a `currentStock` that drifted. Only `prisma migrate reset` truly resets.
- **Why deferred:** Out of scope for a frontend phase, and it needs a decision about how test isolation should work rather than a quick patch.
- **Impact if unaddressed:** Anyone running `test:e2e` silently loses their dev data and then follows a documented recovery step that does not fully recover it.
- **Trigger condition:** Any developer running the e2e suite while relying on local dev data — i.e. routinely.
- **Proposed resolution:** Point the e2e suite at a separate database via a `DATABASE_URL` override in `test/setup-e2e.ts` or a dedicated `.env.test`. Separately, correct AGENTS.md's claim about `db:seed`, or make the seed genuinely idempotent-restoring for the fixture fields.
- **Priority:** Medium
- **Status:** Open

### DEBT-021 — Supplier master data has no edit/delete UI in back-office

- **Date logged:** 2026-08-17
- **Found during:** Phase 8d (TASK-018 / Frontend Purchases & Expenses)
- **Description:** Suppliers have a quick-create dialog (`SupplierQuickCreateDialog.tsx`) and full backend CRUD endpoints (`POST /suppliers`, `GET /suppliers`, `PATCH /suppliers/:id`, `DELETE /suppliers/:id`), but there is no dedicated Supplier management tab or edit/deactivate UI in the Master Data or Expenses screens.
- **Why deferred:** PRD §5.3 and Phase 8d prioritize the high-impact operational flow: entering general expenses, recording raw material purchases with paid/payable branching, managing running payable balances, and on-the-fly supplier creation during purchase recording. Full supplier master data table/edit/delete is lower priority than transactional workflows in v1.
- **Impact if unaddressed:** If a supplier's contact info or name changes, or if a supplier was misspelled during quick-create, editing requires calling the API directly via cURL or Postman.
- **Trigger condition:** The business owner requests the ability to rename suppliers, update supplier phone numbers/contacts, or deactivate retired suppliers from the UI.
- **Proposed resolution:** Add a "Pemasok" tab to `(back-office)/master-data` with a table, edit dialog, and delete/deactivate confirmation modal wired to existing `PATCH /suppliers/:id` and `DELETE /suppliers/:id` endpoints.
- **Priority:** Low
- **Status:** Open

### DEBT-022 — No Zod schema for the `Allocation`-with-`ledgerEntry` composed response

- **Date logged:** 2026-08-18
- **Found during:** Phase 8j (TASK-022 / Frontend Reconciliation Screen)
- **Description:** `GET /allocations/transaction/:txnId` includes the related `ledgerEntry` on every row (`allocation.controller.ts:57` → `allocation.service.ts:174`), but `AllocationResponseSchema` (`packages/api-contracts/src/allocation.schema.ts`) does not describe that composed shape. `apps/web/hooks/useReconciliation.ts` expresses it as a hand-composed intersection type (`AllocationWithLedgerEntry = AllocationResponse & { ledgerEntry: LedgerEntryResponse }`) instead of a schema-derived type, which is an exception to AGENTS.md rule 9 ("Zod schemas drive both API validation and TS types... do not manually type request/response objects if a Zod schema exists").
- **Why deferred:** Adding a proper `AllocationWithLedgerEntrySchema` is a `packages/api-contracts` change, which needs the corresponding controller/service response to actually conform to it on the API side too — an API-contracts change requiring updates on both `apps/api` and `apps/web` in the same PR (ADR-010) — out of scope for a frontend-only phase.
- **Impact if unaddressed:** The composed shape can silently drift from what the controller actually returns (e.g. a future field added to the include) without a compile-time or runtime check catching it — the intersection type is asserted, not validated.
- **Trigger condition:** Any other screen needs the same `Allocation`-with-`ledgerEntry` shape (duplicating the intersection type), or the `allocation.controller.ts` response shape changes.
- **Proposed resolution:** Add `AllocationWithLedgerEntrySchema` to `packages/api-contracts/src/allocation.schema.ts` (composing `AllocationResponseSchema` and `LedgerEntryResponseSchema`) and use the inferred type on both `apps/api`'s controller return type and `apps/web/hooks/useReconciliation.ts`.
- **Priority:** Low
- **Status:** Open

### DEBT-023 — Seed script writes KASIR rows with `branchId: null`, bypassing the role/branch invariant

- **Date logged:** 2026-08-18
- **Found during:** TASK-024 (Phase 9 manual browser smoke test) — the Users table showed "—" in the Cabang column for both seeded KASIR accounts.
- **Description:** `apps/api/prisma/seed.ts` inserts KASIR users via `prisma.user.createMany` directly against Prisma, not through `UsersService.create()`. That bypasses `assertRoleBranchConsistent` entirely, so the two seeded KASIR accounts (`kasir@ohmypos.local`, `qa.kasir@ohmypos.local`) ended up with `branchId: null` in the local dev database — a state `UsersService`/`packages/api-contracts` treat as invalid everywhere a real request goes through the service layer (ADR-011 §2).
- **Why deferred:** Discovered incidentally while smoke-testing Phase 9's new Users UI, not something Phase 9 was scoped to fix — the seed script is shared infrastructure outside this task's file list, and fixing it means deciding whether the seed should hardcode a branch id or create one first, which is a small design choice better made deliberately than as a drive-by edit.
- **Impact if unaddressed:** Anyone running `db:seed` gets KASIR accounts that can log in (auth doesn't check this) but are invisible to any future branch-scoped reporting/filtering that assumes every KASIR has a branch — a state that could otherwise only be reached by a bug, now reachable by just seeding fresh.
- **Trigger condition:** Next time `seed.ts` is touched for any reason, or before any task that relies on seeded KASIR accounts already having a valid branch assignment.
- **Proposed resolution:** Have `seed.ts` create (or look up) a branch before creating its KASIR rows and assign `branchId` to it, so the seed itself satisfies the same invariant the service layer enforces — or route seed user-creation through `UsersService` instead of `prisma.user.createMany` directly, which would catch this class of drift automatically in the future.
- **Priority:** Low
- **Status:** Open

---

## Resolved

### DEBT-003 — Two vocabularies for transaction direction

- **Date logged:** 2026-08-14
- **Found during:** TASK-001 (ADR-012)
- **Description:** The schema and all backend code use Kasync's `TransactionType {INFLOW, OUTFLOW}`, while the product, the PRD, and the Indonesian-language UI speak in terms of pemasukan/pengeluaran (income/expense). The translation between the two lived ad-hoc in presentation layers rather than in a typed system mapping.
- **Why deferred:** Renaming the enum to `INCOME`/`EXPENSE` would have required editing the ported `AllocationService` and `MatchingEngine`, which compare `bankTransaction.type` against `ledgerEntry.type` directly. `INFLOW`/`OUTFLOW` is also the more accurate word for a bank transaction.
- **Proposed resolution:** Centralise the mapping in one exported helper in `packages/ui` and `packages/api-contracts` so no screen translates the enum inline, and cover it with a test asserting both directions.
- **Priority:** Low
- **Status:** Resolved (2026-08-17) — Implemented centralized type-safe mappings in `@ohmypos/api-contracts` (`vocabulary.ts`), re-exported in `apps/web/lib/vocabulary.ts` alongside Flow Indicator (`text-accent-inflow`/`text-accent-outflow`) and status badge helpers (`StockStatus`, `PaymentStatus`, `PayableStatus`, `TransactionStatus`), fully covered with 16 unit tests in Vitest (`apps/web/lib/vocabulary.test.ts`).

### DEBT-005 — Approved mockup's POS and inventory contradict the stock and costing model

- **Date logged:** 2026-08-15
- **Found during:** Review of the Claude Design mockup (`OhMyPos App.dc.html`) — see DESIGN.md, "Approved Mockup"
- **Description:** Two conflicts that go deeper than missing fields. (1) The POS product grid shows a **stock count per product** ("Es Kopi Susu … 48"). In the data model, stock lives on `RawMaterial`; `Product` has no stock at all and is consumed through `RecipeItem` (ADR-004, ADR-007). A per-product number would either be a derived "how many can I still make" figure — computable, but a different thing entirely — or a second stock model. (2) The inventory panel states the stock valuation is "dihitung dari HPP rata-rata bergerak" (moving-average cost). ADR-005 specifies HPP is computed from the recipe and current `RawMaterial.unitCost`, then snapshotted onto `SaleItem` — a different costing method that produces different numbers.
- **Why deferred:** Nothing is built against either claim yet. Resolving them now would mean designing Phase 3's stock model against a mockup rather than against the ADRs, which is the wrong order.
- **Impact if unaddressed:** Phase 3 builds the POS screen straight from the mockup and either invents per-product stock or silently switches costing methods, breaking the accuracy guarantee ADR-005 exists to protect. Reports would then disagree with the ledger and nobody would know which is right.
- **Trigger condition:** Before the Phase 3 POS or inventory screen is designed — this must be settled first, not discovered mid-implementation.
- **Proposed resolution:** Decide explicitly whether the POS shows a derived "makeable quantity" (and specify how it is computed from the recipe and raw-material stock), and confirm that valuation follows ADR-005's recipe-based HPP. If moving-average costing is genuinely wanted, it supersedes ADR-005 and needs its own ADR.
- **Priority:** High — it touches money and stock correctness, which Playbook §10 puts in the "must have thorough tests" tier.
- **Status:** Resolved (2026-08-15) — Accepted per ADR-013. POS displays a derived advisory makeable quantity; moving-average costing is rejected; HPP stays recipe-based computed live via `hpp.calculator.ts`. `DESIGN.md` updated.

### DEBT-012 — `packages/ui`'s shadcn components reference undefined color tokens

- **Date logged:** 2026-08-17
- **Found during:** TASK-009 (Phase 8a — Frontend Auth/Nav Infra), while building the nav shell
- **Description:** `Button`, `Card`, and `Input` in `packages/ui/src/components/ui/` used shadcn's default semantic Tailwind classes (`bg-primary`, `text-primary-foreground`, `bg-card`, `bg-destructive`, `border-input`, `bg-background`, `text-muted-foreground`, etc.), but `packages/ui/src/styles/globals.css`'s `@theme` block only defined DESIGN.md's own token set (`--color-brand-primary`, `--color-surface-*`, `--color-text-*`, `--color-border-default`, `--color-status-*`). None of the shadcn `--color-primary`/`--color-card`/`--color-destructive`/etc. variables were defined anywhere in the repo.
- **Why deferred:** Pre-existing since Phase 0 scaffolding (TASK-002) — not introduced by TASK-009.
- **Impact if unaddressed:** `Button` (all variants) and `Input` render with no background/foreground color from their intended variant.
- **Trigger condition:** The next task that visibly relies on `Button`'s non-default variants or `Card`'s default appearance.
- **Proposed resolution:** Either map shadcn's semantic tokens onto DESIGN.md's palette in `globals.css` (e.g. `--color-primary: var(--color-brand-primary)`, `--color-destructive: var(--color-status-danger)`, etc.), or rewrite `Button`/`Card`/`Input` to reference DESIGN.md tokens directly, matching the pattern used by `dropdown-menu.tsx`.
- **Priority:** Medium
- **Status:** Resolved (2026-08-17) — Defined the complete DESIGN.md token palette (`#16A34A` success, `#00B894` inflow, `#2563EB` outflow/info, correct surfaces, radius, and shadows) and full semantic shadcn `@theme` color mappings in `packages/ui/src/styles/globals.css`. Rewrote `button.tsx`, `card.tsx`, `input.tsx`, and `label.tsx` to reference DESIGN.md semantic tokens directly. Verified with zero missing utilities and full test suite passing.