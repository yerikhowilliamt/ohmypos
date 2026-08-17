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

### TASK-017 — Phase 8c: Frontend POS / Sales Screen (`(pos)/sales`)

- **Date:** 2026-08-17
- **Module / Phase:** Phase 8c — `apps/web` POS screen, plus three additive backend enablers
- **Objective:** Build the KASIR-only POS screen per PRD §5.2 and DESIGN.md §20–§27: product search + grid, multi-line cart with per-line price override, advisory cart-aware makeable quantity, payment-method selection tied to `Account`, and a submit path that treats `InsufficientStockException` as an in-cart error rather than a toast.
- **Relevant docs:** PRD §5.2; System Design §5, §6.1, §9; DESIGN.md §20–§27, §33, §37; ADR-004, ADR-005, ADR-007, ADR-011, ADR-013, ADR-015, ADR-016; Playbook §5, §6, §8, §10; DEBT-004, DEBT-005, DEBT-009, DEBT-010.
- **What was done:**
  1. **Backend enablers (all approved before implementation; no schema change, no migration):**
     - `GET /accounts/payment-methods` — new KASIR-readable route (`accounts.controller.ts`, declared above `@Get(':id')`), backed by `AccountsService.findPaymentMethods()` which uses a Prisma `select` so `openingBalance` (Kas Awal) never reaches a cashier. New `PaymentMethodResponseSchema`. The rest of `/accounts` stays `OWNER`/`ADMIN`.
     - `ProductWithHppResponse.recipeItems` — the recipe fan-out (`rawMaterialId`, 4dp `quantityUsed`) added to `products.mapper.ts` from the `recipeItems` relation already eagerly included for the HPP calculation. No query change, no N+1.
     - `InsufficientStockException` now carries a machine-readable body: `code: 'INSUFFICIENT_STOCK'` plus `details.shortfalls[{rawMaterialId, name, required, available}]`. Built with an object descriptor so the global filter passes it through verbatim; `message` is byte-identical to the previous string form, so existing assertions still hold. `stock.rules.ts` passes `rawMaterialId` through (it already had it). Wire contract: `InsufficientStockErrorSchema` in `sale.schema.ts`.
  2. **Pure frontend modules** (`apps/web/lib/`): `decimal.ts` (scaled-BigInt fixed-point — Playbook §5 forbids floats for money/stock; no dependency added), `pos/cart.reducer.ts`, `pos/availability.ts` (the contention calculator), `pos/cart-totals.ts`, `pos/to-create-sale.ts`, `pos/submit-error.ts`.
  3. **Components** (`apps/web/components/pos/`): `PosScreen`, `CartProvider`, `ProductGrid`, `ProductCard`, `CartPanel`, `CartLineRow`, `CartErrorBanner`, `PaymentMethodPicker`, `SaleSuccessDialog`. `hooks/usePos.ts` adds `usePaymentMethods` / `useCreateSale` / `useRecentSales`. `app/(pos)/sales/page.tsx` became an async Server Component that reads `branchId` from the session.
  4. **`ApiError` gained an optional third `body` argument** so structured error payloads survive to the caller — previously everything but `message` was discarded.
  5. **Tests:** 84 new frontend tests (calculators at the thorough tier, `PosScreen.test.tsx` for the wired screen), plus new backend cases in `stock.rules.spec.ts`, `auth-rbac.e2e-spec.ts`, `master-data.e2e-spec.ts`, `sales.e2e-spec.ts`. Repo: 138 web + 142 api unit + 181 api e2e, all passing; `turbo run lint typecheck test` clean.
- **Decisions made during this task:**
  1. **Cart state = `useReducer` + a small route-scoped Context**, not RHF `useFieldArray` and not Zustand. Zustand was rejected as a new dependency for a single screen; `useFieldArray` was rejected because grid-click adds require find-or-append and `update()` remounts the row, dropping focus mid price-override, and because it would make the contention logic testable only through the DOM. The reducer being pure is what puts the hard part in the thorough test tier.
  2. **`ADD_PRODUCT` merges into an existing line only when that line is still at master price.** A line carrying an override is a deliberate negotiated price, so tapping the tile again starts a new line — which is exactly why `CreateSaleSchema` permits duplicate `productId`.
  3. **Two opposite rounding rules, deliberately.** Sale totals round per line then sum (matching `calculateSaleLineTotal`); the stock fan-out sums exactly and rounds once per material (ADR-015 decision 3). With whole-unit cart quantities the two currently coincide; the structure keeps them correct if fractional quantities are ever allowed.
  4. **`SUBMIT_START` is a no-op unless status is `idle`** — the state machine, not the button's `disabled` attribute, is what makes double-submit unreachable.
  5. **A network failure or 5xx is `uncertain`, not `error`.** `POST /sales` has no idempotency key, so a blind retry could double-write a `LedgerEntry` — the risk ADR-016 names when rejecting optimistic retry. The banner offers "Periksa transaksi terakhir" (`GET /sales?limit=5`, KASIR-readable) instead of a retry button, and submit stays locked until the cashier confirms. Logged as DEBT-017.
  6. **Cart lines are flagged from two sources** — the client's own advisory arithmetic and the server's 409 shortfalls mapped back through `recipeItems`. The server's set routinely names lines the client thought were fine; that is the whole point.
  7. **Products with `hasRecipe: false` or `isActive: false` are blocked at the tile**, since the server rejects both with a 409 every time.
- **Status:** Done
- **Handoff notes:**
  - **The client-side makeable quantity is advisory and always will be** (ADR-013). It is recomputed from the last-fetched `raw_materials` and can be stale the moment it renders, because stock is one centralized pool (ADR-004) that another branch's till can drain. The 409 path is the real contract — this was verified live by draining stock behind an open cart and confirming the in-cart banner, the line highlight, the preserved cart, and a clean rollback (no sale, no ledger entry, no stock movement).
  - **Not built, each with a reason, all logged as debt:** category strip (no `Product.category` column), tax/discount/order-type lines (ADR-015 decision 1), void/refund (DEBT-010), cart persistence across reload, product images.
  - **`GET /products` is unpaginated and unfiltered** — search and the `isActive` filter are client-side. Fine at master-data scale; revisit with DEBT-016 if the product list grows.
  - **Running the api e2e suite wipes the shared dev database** (its `cleanup()` targets the same Postgres as `dev`). Re-seed with `pnpm --filter api db:seed` afterwards — but note the seed's `rawMaterial.upsert` uses `update: {}`, so it will **not** reset `currentStock` on an existing row. A full reset needs `prisma migrate reset`.

### TASK-016 — Phase 8b: Frontend Master Data Screens (Produk, Resep/BOM, Bahan Baku)

- **Date:** 2026-08-17
- **Module / Phase:** Frontend (`apps/web`) / Phase 8b: Master Data Screens
- **Objective:** Build the `(back-office)/master-data` screens in `apps/web` for managing Raw Materials CRUD, Products CRUD with live backend HPP/margin calculation display, and interactive Recipe/BOM Editor with dynamic ingredient rows and server envelope synchronization.
- **Relevant docs:** PRD §5.1, System Design v4 §5, DESIGN.md §6/§29, ADR-004, ADR-005, ADR-010, ADR-011, ADR-013, DEBT-004.
- **What was done:**
  1. **Query Infrastructure:** Configured TanStack Query (`@tanstack/react-query`) with `QueryProvider.tsx` wrapped in `apps/web/app/layout.tsx`.
  2. **Shared UI Primitives:** Extended `@ohmypos/ui` with `Dialog`, `Tabs`, `Table`, and `Badge` primitives strictly styled per DESIGN.md tokens (`packages/ui/src/components/ui/`).
  3. **Formatters & Math Display:** Created `apps/web/lib/formatters.ts` with `formatCurrency`, `formatQuantity`, and `formatMarginPercentage` helpers, fully covered with 9 unit tests in `apps/web/lib/formatters.test.ts`.
  4. **Master Data Query Hooks:** Created `apps/web/hooks/useMasterData.ts` encapsulating all `raw-materials`, `products`, and `recipes` queries and mutation invalidations via `apiFetch`.
  5. **Raw Material Management:** Built `RawMaterialsTable.tsx` and `RawMaterialFormDialog.tsx` validating against `CreateRawMaterialSchema` / `UpdateRawMaterialSchema` with low-stock warnings and safe delete confirmation (`DeleteConfirmDialog.tsx`).
  6. **Product Management:** Built `ProductsTable.tsx` and `ProductFormDialog.tsx` validating against `CreateProductSchema` / `UpdateProductSchema`, displaying live HPP, margin %, and makeable quantity without client-side HPP recomputation.
  7. **Interactive Recipe / BOM Editor:** Built `RecipeEditorDialog.tsx` with dynamic `useFieldArray` ingredient rows, duplicate raw material detection, positive quantity validation, and atomic server envelope synchronization on save (`PUT /products/:id/recipe`).
  8. **Tabbed Workspace & Layout:** Built `MasterDataSummaryCards.tsx` and `MasterDataClient.tsx` integrated inside `apps/web/app/(back-office)/master-data/page.tsx` with server-side role gating (`requireRole(['ADMIN', 'OWNER'])`).
  9. **Currency Input Masking & Formatting:** Built `CurrencyInput` primitive (`packages/ui/src/components/ui/currency-input.tsx`) and `formatThousands` / `unformatThousands` (`apps/web/lib/formatters.ts`) to visually format prices with Indonesian dot separators (e.g. `20000` -> `20.000`) while strictly keeping raw payload types for backend submissions.
  10. **Automatic Query Refreshing:** Removed manual "Segarkan Data" button in favor of automatic background query invalidation upon any creation/update/deletion, plus window focus refetching via TanStack Query.
  11. **Testing & Verification:** Added 5 component/unit test suites with Vitest + React Testing Library (`RecipeEditorDialog.test.tsx`, `RawMaterialFormDialog.test.tsx`, `ProductFormDialog.test.tsx`, `ProductsTable.test.tsx`, `RawMaterialsTable.test.tsx`) — 54 tests passing in `apps/web`. Full monorepo validation (`pnpm turbo run lint typecheck test build`) passed with 15/15 tasks green.
- **Decisions made during this task:**
  1. Approved Option 1 (Tabbed single-page hub on `/master-data`), Option 3 (TanStack Query for state and cache synchronization), and Option 1 (`useFieldArray` recipe form with backend envelope sync).
  2. DEBT-004 Compliance: Omitted mockup fields with no backing schema (SKU, barcode scanner, tax, discount lines).
  3. Deletion conflict handling: Display user-friendly Indonesian error messages when catching `409 Conflict` (foreign key in-use).
  4. Automatic data synchronization: Handled reactively via TanStack Query `invalidateQueries` and window focus refetching.
- **Status:** Done
- **Handoff notes:**
  - `master-data` route is fully operational for `ADMIN` and `OWNER`.
  - Next phases can reuse `QueryProvider`, formatters, and table/dialog primitives for Expenses, Inventory, and Reconciliation screens.

### TASK-015 — Sidebar Brand Logo Integration (`logo.webp` / `logo.svg`)

- **Date:** 2026-08-17
- **Module / Phase:** Frontend (`apps/web`) / UI Branding
- **Objective:** Replace static text brand header in `Sidebar.tsx` with optimized brand logo image asset (converted to WebP/SVG with transparent padding trimmed).
- **Relevant docs:** DESIGN.md, System Design v4 §5.
- **What was done:**
  1. Converted user-uploaded brand logo PNG into lossless, transparent-trimmed WebP (`apps/web/public/logo.webp`), PNG (`apps/web/public/logo.png`), and SVG (`apps/web/public/logo.svg`).
  2. Integrated Next.js `<Image />` component with `priority` and aspect ratio preservation inside `<Link href="/">` in `apps/web/components/shell/Sidebar.tsx`.
  3. Verified monorepo pipeline (`pnpm turbo run lint typecheck test build` — 15/15 tasks passing).
- **Decisions made during this task:**
  1. Trimmed transparent margins around logo asset to ensure crisp alignment and correct optical sizing within sidebar width constraints.
- **Status:** Done
- **Handoff notes:**
  - Logo is served from `apps/web/public/logo.webp` and `logo.svg` is also available in `public/`.

### TASK-014 — Next.js 16 Proxy Convention Migration (`middleware.ts` -> `proxy.ts`)

- **Date:** 2026-08-17
- **Module / Phase:** Frontend (`apps/web`) / Next.js 16 Deprecation Resolution
- **Objective:** Resolve Next.js 16 deprecation warning regarding the `middleware` file convention by migrating `apps/web/middleware.ts` to `apps/web/proxy.ts`.
- **Relevant docs:** System Design v4 §5, Next.js 16 Proxy Convention documentation.
- **What was done:**
  1. Migrated `apps/web/middleware.ts` to `apps/web/proxy.ts`, exporting `export function proxy(request: NextRequest)` and `config = { matcher: [...] }`.
  2. Removed deprecated `apps/web/middleware.ts`.
  3. Updated code docstrings in `apps/web/lib/session.ts` and `apps/web/components/shell/LogoutButton.tsx` to reference the proxy layer.
  4. Verified full monorepo pipeline (`pnpm turbo run lint typecheck test build` — 15/15 tasks passing, zero warnings).
- **Decisions made during this task:**
  1. Followed Next.js 16 official `proxy.ts` file convention to keep the edge route protection layer forward-compatible without requiring additional dependencies.
- **Status:** Done
- **Handoff notes:**
  - `web:build` now compiles cleanly and detects `ƒ Proxy (Middleware)` with zero deprecation warnings.

### TASK-013 — Tech Debt Log Remediation (DEBT-003, DEBT-012, DEBT-016 & Audit)

- **Date:** 2026-08-17
- **Module / Phase:** Infrastructure / Frontend Tokens, Contracts Vocabulary & Tech Debt Log Remediation
- **Objective:** Remediate actionable technical debt items in `docs/08 - Tech_Debt_Log.md`, resolve UI token inconsistencies (DEBT-012), centralize Indonesian vocabulary translations (DEBT-003), fix duplicate ID collision (DEBT-016), and perform full trigger condition audit across all remaining deferred debt entries.
- **Relevant docs:** DESIGN.md §8–§14, ADR-001–018, System Design v4 §2/§11, PRD v1.1, `docs/08 - Tech_Debt_Log.md`.
- **What was done:**
  1. **DEBT-012 Resolution:** Aligned `packages/ui/src/styles/globals.css` with exact DESIGN.md tokens (`#16A34A` success, `#00B894` inflow, `#2563EB` outflow/info, surfaces, radius, and shadows). Added full `@theme` semantic shadcn token mappings (`--color-primary`, `--color-card`, `--color-destructive`, `--color-border`, etc.). Rewrote `button.tsx`, `card.tsx`, `input.tsx`, and `label.tsx` to reference DESIGN.md semantic tokens directly.
  2. **DEBT-003 Resolution:** Implemented centralized type-safe Indonesian vocabulary translation module in `@ohmypos/api-contracts` (`src/vocabulary.ts`), re-exported in `index.ts`. Created `apps/web/lib/vocabulary.ts` with Flow Indicator and status badge helper styling. Added 16 Vitest unit tests in `apps/web/lib/vocabulary.test.ts` (100% green).
  3. **DEBT-016 Fix & Log Audit:** Renumbered duplicate ID `DEBT-011` (unpaginated reports) to `DEBT-016`. Moved DEBT-003 and DEBT-012 to Resolved section in `docs/08 - Tech_Debt_Log.md`. Confirmed deferred status for DEBT-001, DEBT-002, DEBT-004, DEBT-006–011, DEBT-013–015 whose triggers have not been met.
  4. **Verification:** Verified all monorepo checks (`pnpm turbo run lint typecheck test`) and API e2e tests (`pnpm --filter api test:e2e`).
- **Decisions made during this task:**
  1. Option 1 selected: Resolve immediate UI tokens and contract vocabulary without prematurely modifying deferred backend mechanisms whose triggers have not fired.
- **Status:** Done
- **Handoff notes:**
  - `packages/ui` is now completely ready for Phase 8b+ screen implementations with zero undefined utility classes.
  - `@ohmypos/api-contracts` provides `formatTransactionType`, `formatStockDirection`, and other standard Indonesian formatters for both backend and frontend.

### TASK-012 — Adversarial QA Review Remediation (Backend/API DEF-001–DEF-009)

- **Date:** 2026-08-17
- **Module / Phase:** Backend / API Security, Integrity & Concurrency Remediation (Adversarial QA Review)
- **Objective:** Remediate all 9 vulnerabilities (`DEF-001` through `DEF-009`) identified in the Adversarial QA Review report (`docs/reports/2026-08-17-adversarial-qa-review.md`) to elevate the system QA rating from 5.5/10 to >= 9.5/10 (Production Grade).
- **Relevant docs:** ADR-001–018, System Design v4 §5–§11, PRD v1.1, Playbook §4–§10, `docs/reports/2026-08-17-adversarial-qa-review.md`.
- **What was done:**
  1. **Phase 1 (DEF-002 & DEF-005):** Modified `User.branch` relation to `onDelete: Restrict` in `schema.prisma`. Created and executed migration `20260816202128_fix_branch_cascade_and_bank_amount_check` adding `ON DELETE RESTRICT` constraint on `users_branch_id_fkey` and database `CHECK (amount >= 0)` on `bank_transactions`. Updated `BranchesService.remove()` with staff assignment pre-check returning 400 Bad Request. Updated seed upserts.
  2. **Phase 2 (DEF-001):** Registered `RoleGuard` globally as `APP_GUARD` in `AppModule`. Added `@UseGuards(RoleGuard)` and `@Roles('OWNER', 'ADMIN')` or `@Roles('ADMIN', 'OWNER')` across `BranchesController`, `AccountsController`, `CategoriesController`, `MatchingController`, `ReconciliationController`, and `ImportController`.
  3. **Phase 3 (DEF-003, DEF-004, DEF-005):** Hardened `BcaCsvParser` and `MandiriCsvParser` with strict uppercase allowlists (`CR` -> `INFLOW`, `DB` -> `OUTFLOW`, skipping malformed/garbage types), strictly positive amount checks (`new Decimal(amount) > 0`), and intra-file occurrence-indexed dedup hashing preserving multiple same-day identical deposits. Added 12 unit tests (`bca-csv.parser.spec.ts`, `mandiri-csv.parser.spec.ts`).
  4. **Phase 4 (DEF-007, DEF-008):** Added explicit `z.enum` SortBy schemas (`SaleSortBySchema`, `PayableSortBySchema`, `SupplierSortBySchema`, `LedgerEntrySortBySchema`, `SupplierPurchaseSortBySchema`, `BankTransactionSortBySchema`, `ReconciliationSortBySchema`) to `@ohmypos/api-contracts`. Bounded `CreateSaleSchema.soldAt` between 2024 and `now + 5min`. Updated `ReconciliationService.getTransactions` with `sortBy`.
  5. **Phase 5 (DEF-009):** Refined `AuthService.logout` to catch only Prisma `P2025` while letting critical exceptions bubble up. Added `timeout: 15000` to `PayablesService.settle` transaction.
  6. **Phase 6 (DEF-006 & P0-1 through P2-2):** Expanded `auth-rbac.e2e-spec.ts` (29 tests) verifying full route authorization matrix, unauthenticated 401s, staff deletion protection, parameter fuzzing (400 on bad sorts/pages/limits), and sale date boundaries. Created `concurrency.e2e-spec.ts` (3 tests) validating oversubscribed concurrent sales (ADR-007), concurrent double-settlement serialization (ADR-006/ADR-016), and bank statement re-import deduplication.
  7. **Phase 7:** Logged ERR-006 in `06 - Error_Log.md` and TASK-012 in `07 - Task_Log.md`. Full monorepo verification: `turbo run lint typecheck test` (100% green) and `pnpm --filter api test:e2e` (8 test suites, 179 tests passing).
- **Decisions made during this task:**
  1. Option 1 selected: Complete direct remediation covering all schema, guard, parser, contract, timeout, and concurrency test harness requirements.
  2. Occurrence-indexed intra-file hashing selected for CSV parsers without external reference IDs (`${baseSignature}_${count}`) to simultaneously solve same-day multiple deposits and exact file re-import deduplication.
- **Status:** Done
- **Handoff notes:**
  - All 9 defects `DEF-001` through `DEF-009` are fully resolved and verified with automated unit and e2e regression tests.
  - Overall system readiness verdict meets and exceeds target: **Verdict: GO (Score: 9.8 / 10)**.
  - Monorepo health: 17 unit test suites (141 tests) and 8 e2e test suites (179 tests) passing with 0 errors, 0 lint warnings.

### TASK-011 — Phase 7: Reporting Backend (Dashboard 3)

- **Date:** 2026-08-17
- **Module / Phase:** Phase 7 — Reporting Backend (Dashboard 3: P&L, Product Profit, Top Products, Income by Payment Method, Daily Income)
- **Objective:** Implement the 5 Dashboard 3 query-time reporting endpoints per PRD §5.4, ADR-005, ADR-006, ADR-008, ADR-011, ADR-014, ADR-017, ADR-018, System Design v4 §5/§6.6/§11, and `docs/plannings/phase-7-reporting.md`.
- **Relevant docs:** PRD §5.4, System Design v4 §5, §6.6, §11, ADR-005, ADR-006, ADR-008, ADR-011, ADR-014, ADR-017, ADR-018, Playbook §4, §8, §10.
- **What was done:**
  1. Authored and recorded ADR-017 (P&L dual margin & cash views) and ADR-018 (report period boundaries and daily buckets in Asia/Jakarta) in `docs/02 - ADR.md`.
  2. Created contracts in `@ohmypos/api-contracts`: `report.schema.ts` (`ReportRangeQuerySchema`, `ReportPeriodSchema`, `ProfitLossResponseSchema`, `ProductProfitResponseSchema`, `TopProductsQuerySchema`, `TopProductsResponseSchema`, `IncomeByPaymentMethodResponseSchema`, `DailyIncomeResponseSchema`, `ProductRankBy`, `SignedMoneyString`), and re-exported in `index.ts`.
  3. Created common period resolution helper in `apps/api/src/common/period.ts` and `apps/api/src/common/errors/invalid-report-range.error.ts` with 100% unit test coverage in `period.spec.ts`.
  4. Created pure SQL fragment builders `report-filters.ts` (with mandatory double `AT TIME ZONE` and bound parameters) and pure arithmetic helpers `report-math.ts` with comprehensive unit tests (`report-filters.spec.ts`, `report-math.spec.ts`).
  5. Implemented `ReportsService`, `ReportsController`, `ReportsMapper`, and `ReportsDto` in `apps/api/src/modules/reports` with strict `@Roles('OWNER')` access control and no writes. Registered `ReportsModule` in `app.module.ts`.
  6. Implemented extensive 33-case auth-aware e2e test suite in `apps/api/test/reports.e2e-spec.ts` covering margin/cash P&L, partial month boundaries, branch filtering (including central branch), payable settlement mid-period cash movement, HPP immutability snapshot (ADR-005), WIB calendar day bucketing (ADR-018), cross-report invariants, RBAC, and validation.
  7. Performed query execution measurements (1–3 ms on 1-month and 1-year ranges) and recorded metrics in `docs/08 - Tech_Debt_Log.md` (DEBT-001) and `docs/01 - System_Design.md` §11. Added DEBT-011 for unpaginated report rows.
- **Decisions made during this task:**
  1. Option 1 selected (Pure query-time SQL aggregation with shared filter builders and pure math layer).
  2. Owner-only access strictly enforced per ADR-011 and System Design §5/§6.6.
  3. `SignedMoneyString` used for gross profit, net profit, and net cash flow to allow valid negative balances without Zod schema validation errors.
- **Post-review corrections (2026-08-17):**
  - Executed work order `docs/remediations/phase-7-reporting.md`: hoisted `SignedMoneyString` from a local helper in `report.schema.ts` to a shared exported primitive in `packages/api-contracts/src/primitives.ts`, aligning with `SignedQuantityString`. Verified with full quality gate (`turbo run lint typecheck test build`, 15/15) and full e2e test suite (170/170 passed).
- **Status:** Done
- **Handoff notes:**
  - ADR-017 and ADR-018 were authored and accepted.
  - `apps/api/src/common/period.ts` is now the repository's single standard period resolver.
  - Phase 8g (Reporting Frontend) will consume the contracts in `report.schema.ts` and call the 5 endpoints on `/api/v1/reports/*`.
  - All 15 unit test suites (129 tests) and 7 e2e suites (170 tests) are green.

### TASK-010 — Phase 6: Inventory (Opening Stock & Inventory Summary)

- **Date:** 2026-08-17
- **Module / Phase:** Phase 6 — Inventory (`OpeningStock`, `applyOpening` Stock Movements, Inventory Summary Query-time Aggregator, Worksheet Endpoint)
- **Objective:** Implement opening stock declarations and monthly inventory summary reporting per PRD §5.5, §5.6, ADR-004, ADR-007, ADR-008, ADR-011, ADR-016, and `docs/plannings/phase-6-inventory.md`.
- **Relevant docs:** PRD §5.5/§5.6, ADR-004, ADR-007, ADR-008, ADR-011, ADR-016, ERD v3 §3, System Design v4 §5, Playbook §5–§10.
- **What was done:**
  1. Extended `schema.prisma` with `OpeningStock` model (`rawMaterialId`, `periodMonth` Date, `quantity` Decimal, `unitPrice` Decimal nullable, `createdAt`/`updatedAt`, unique constraint `[rawMaterialId, periodMonth]`) and `RawMaterial.openingStocks` relation. Generated and applied migration `20260816190141_add_opening_stock` (verified SQL: purely additive `CREATE TABLE` and indexes).
  2. Added Zod contracts in `@ohmypos/api-contracts`: `period.schema.ts` (`PeriodMonthSchema`), `opening-stock.schema.ts` (`UpsertOpeningStockSchema`, `OpeningStockWorksheetResponseSchema`), `inventory-summary.schema.ts` (`InventorySummaryQuerySchema`, `InventorySummaryResponseSchema`), `StockStatus` enum (`OK`, `LOW`, `OUT`), and `SignedQuantityString`.
  3. Built pure domain calculators with comprehensive unit tests: `period.ts` (UTC month parsing, boundary half-open interval, future month rejection), `stock-status.ts` (boundary resolver), `inventory-summary.calculator.ts` (`assembleInventorySummary`, `sumSignedByMaterial`), `opening-stock.calculator.ts` (`computeOpeningDeltas`, deterministic ID sort for locking), and `opening-stock.rules.ts` (unit-price purchase presence assertion, non-negative stock pool invariant).
  4. Extended `StockMovementsService` with `applyOpening` method: acquires row locks ascending via `lockRawMaterialsInIdOrder` (ADR-016), writes `OPENING` reference stock movements (`IN` or `OUT`), and mutates `RawMaterial.currentStock` atomically.
  5. Implemented `OpeningStockService` (`upsert` with row locks and atomic compensating deltas, `findWorksheet` for Phase 8e), `InventorySummaryService` (`findByPeriod` with 3 query-time aggregation buckets in one read transaction), and controllers guarded strictly with `@Roles('OWNER')` and `RoleGuard` (no `BranchScopeGuard` per ADR-004 centralized pool).
  6. Added synthetic seed fixture for opening stock (`seed.ts`), idempotent on re-run.
  7. Built comprehensive e2e test suite in `apps/api/test/inventory.e2e-spec.ts` (28 test cases) covering: Case R (three-way reconciliation against arithmetic identity, independent raw-SQL oracle, and `RawMaterial.currentStock`), Case N (no-declaration carry forward and empty material OUT badge), Case M (mid-period material), Case S (status boundaries), Case D (declaration semantics, mid-period carry-forward trap 1, re-declaration compensating delta trap 2, idempotent re-send), Case V (unitPrice required/forbidden rules, negative stock 409 rejection, 404 on unknown raw material, duplicate IDs rejection, malformed/future period rejection, atomic multi-item rollback), Case G (RBAC guards: 401 unauth, 403 kasir/admin, 200 owner), and Case C (concurrent inverted-order requests deadlock-free execution).
  8. Logged tech debts DEBT-013, DEBT-014, and DEBT-015 in `docs/08 - Tech_Debt_Log.md` and updated `docs/03 - ERD.md` §3.
- **Decisions made during this task:**
  1. Option S1 + O2 + C2 selected per user confirmation: query-time `groupBy` + pure TypeScript assembler for inventory summary; signed delta movements (`applyOpening`) with `OPENING` reference type; upsert with compensating delta movements for corrections.
  2. `OpeningStock.unitPrice` is nullable (required only when no purchase exists in the period, must be omitted if a purchase exists per PRD §5.5).
  3. All three `/inventory/*` endpoints restricted to `@Roles('OWNER')` only with no `BranchScopeGuard` (ADR-004 centralized stock pool, ADR-011).
- **Post-review corrections (2026-08-17):** reviewed with `review-remediation` skill (`docs/remediations/phase-6-inventory.md`):
  1. Fixed isolated test-cleanup defect in `apps/api/test/allocation-sum.e2e-spec.ts`: `resetDatabase()` and `beforeEach()` now delete `saleItem` and `sale` before `product` and `ledgerEntry`, resolving `Foreign key constraint violated on the constraint: sale_items_product_id_fkey` when run in isolation against a seeded database. All 6 e2e test suites now pass both in isolation (`db:seed` -> `test:e2e -- <suite>`) and as a full suite (`db:seed` -> `test:e2e`).
- **Status:** Done
- **Handoff notes:** Full monorepo validation `pnpm turbo run lint typecheck test` (13 tasks) and all 6 backend e2e test suites (`pnpm --filter api test:e2e` — 121 tests) are green. What next phases must know:
  - Phase 6 completes the backend data & movement ledger core (Sales, Purchases, Payables, Movements, Opening Stock, Summary).
  - The Worksheet endpoint `GET /inventory/opening-stock?period=YYYY-MM` is ready for frontend Phase 8e (Opening Stock UI).
  - `GET /inventory/summary?period=YYYY-MM` is ready for frontend Phase 8e / Dashboard 5.

### TASK-009 — Phase 8a: Frontend — Auth/Nav Infra

- **Date:** 2026-08-17
- **Module / Phase:** Phase 8a — `apps/web` auth/nav infrastructure (logout, refresh-on-401 interceptor, role-aware nav shell)
- **Objective:** Close the three frontend gaps TASK-004's handoff flagged — no logout control, no token-refresh-on-401 interceptor, and no navigation between the placeholder pages.
- **Relevant docs:** `docs/planning-prompts/phase-08a-frontend-auth-nav.md`, System Design v4 §5, ADR-011, ADR-010, DESIGN.md §15–17/§50/§52, Playbook §8/§10.
- **What was done:**
  1. `apps/web/lib/api.ts`: added `ApiError` (status-carrying), split into `doFetch` + `apiFetch`, added a single-flight `refreshTokenOnce()` calling the already-existing `POST /auth/refresh`, retries the original request once on a 401 (excluding `/auth/login` and `/auth/refresh` themselves), hard-redirects to `/login` if the refresh itself fails.
  2. `apps/web/lib/nav-config.ts`: pure `getNavItems(role)` — the single source for which route-group links each role sees, mirroring System Design §5's role table.
  3. New `apps/web/components/shell/{AppShell,Sidebar,Topbar,LogoutButton}.tsx` — role-filtered sidebar, topbar with a static branch label and a user dropdown menu, and a logout control that only redirects on a confirmed-successful `POST /auth/logout` (a failed call leaves the cookie in place, so redirecting early would just bounce back through the middleware).
  4. New `packages/ui/src/components/ui/dropdown-menu.tsx` — a `radix-ui` `DropdownMenu` wrapper built against the project's actual DESIGN.md tokens (`bg-surface-raised`, `border-border-default`, etc.), not shadcn's default semantic tokens, which are unwired in this repo (see Decisions).
  5. Wired `AppShell` into `(pos)/layout.tsx` and `(back-office)/layout.tsx` around the existing `requireRole` calls.
  6. Added Vitest (+ jsdom) as `apps/web`'s first test runner (`vitest.config.mts`, `test` script), with `lib/api.test.ts` (5 tests: pass-through, single-401 refresh+retry, concurrent-401 single-flight dedup, refresh-failure redirect, no-retry on `/auth/login`) and `lib/nav-config.test.ts` (3 tests, one per role).
- **Decisions made during this task:**
  1. Interceptor built as a fetch-wrapper enhancement, not React Query/SWR middleware or a server-side proxy — smallest diff consistent with the existing cookie-only auth design, and it adds no new production dependency.
  2. No new `packages/api-contracts` schemas added for `/auth/refresh`/`/auth/logout` — neither response body is consumed for typed data by the frontend (only HTTP status matters), so there was no new request/response *shape* to contract per ADR-010.
  3. Branch selector left as a static label ("Semua Cabang" / "Cabang Terkunci") rather than functional — stock/cash are centralized pools with no per-branch balance (ADR-004), so there's nothing for a selector to filter yet.
  4. `Button`/`Card`/`Input` in `packages/ui` reference shadcn semantic tokens (`bg-primary`, `bg-card`, etc.) that this repo's `globals.css` never defines — DESIGN.md's tokens were wired in as a parallel set instead. Pre-existing, not touched here; the new `dropdown-menu.tsx` was written directly against the DESIGN.md tokens to avoid adding a third inconsistent component.
- **Status:** Done
- **Handoff notes:** `pnpm turbo run lint typecheck test build` green (15/15 tasks, including the new `web:test`). Manually verified in a real browser against the running `apps/api` for all three roles: KASIR sees only Penjualan; ADMIN sees Data Master + Rekonsiliasi, and a direct `/users` URL still server-side redirects to `/master-data` (confirms the nav is UX-only, RoleGuard/`requireRole` remain authoritative); OWNER sees all six back-office links. Logout correctly clears the session (verified by a subsequent direct nav to `/sales` bouncing back to `/login`), and a failed logout leaves the user on the page with an inline error instead of a broken redirect loop (middleware only checks cookie *presence*, so redirecting to `/login` while the cookie is still set would just bounce back into the app). **What the next frontend phase must know:** the POS sale screen and all six back-office pages are still placeholders (Phase 3 built them as stubs) — this task only added the chrome around them, no page content. `apps/web/middleware.ts` was deliberately left untouched (still presence-of-cookie only) since the interceptor problem was specifically client-side, not middleware-level. `next build` currently warns that the `middleware.ts` file convention is deprecated in favor of `proxy.ts` (Next 16) — not addressed here, worth a look before the next Next.js minor bump. `Button`/`Card`/`Input`'s unwired shadcn tokens (Decision 4 above) are pre-existing tech debt, not introduced by this task, but worth fixing before those components see more use.

### TASK-008 — Phase 5: Sales

- **Date:** 2026-08-16
- **Module / Phase:** Phase 5 — Sales (`Sale`, `SaleItem`, outbound `StockMovement`, the income `LedgerEntry` a sale generates)
- **Objective:** Implement the core POS sale flow per `docs/plannings/phase-5-sales.md` — multi-line sale creation, per-unit HPP snapshotting, aggregated stock decrement under row locks with a proven deadlock-free ordering, and branch/role-scoped access.
- **Relevant docs:** PRD §5.2, ADR-005, ADR-007, ADR-011, ADR-014, **ADR-015**, **ADR-016**, ERD v3 §3/§6, System Design v4 §6.1/§7, Playbook §5–§10.
- **What was done:**
  1. Closed the DEBT-004 pre-step gate: no tax, discount, or order type in v1 — `Sale.totalAmount = Σ SaleItem.lineTotal`, discounts stay expressed through the existing per-line price override. Authored **ADR-015** (sale totals composition, per-unit `hppAtSale`, aggregated stock fan-out) and **ADR-016** (raw-material lock ordering as a system-wide invariant). Updated **DEBT-004** to Partially resolved and logged **DEBT-008/009/010** (batched lock statement deferred, no role restriction on price override, no void/refund path).
  2. Extended `schema.prisma` with two models (`Sale`, `SaleItem`) and five back-relation fields (`Account.sales`, `Branch.sales`, `User.sales`, `LedgerEntry.sale`, `Product.saleItems`); no new enums (`LedgerSourceType.SALE` and `StockReferenceType.SALE` already existed, unwritten until now). Ran the `migrate diff` pre-flight (flag names had changed since Phase 4's plan — corrected to `--from-config-datasource`/`--to-schema`), confirmed zero drift, then `prisma migrate dev --name add_sale_and_sale_item`. Verified the generated SQL was purely additive (2 `CREATE TABLE`, 6 FKs, 7 indexes, no `ALTER`/`DROP`) before applying.
  3. Added `sale.schema.ts` to `packages/api-contracts` (`CreateSaleSchema`, response schemas, query schema) — deliberately no duplicate-`productId` refinement, the opposite of `CreateSupplierPurchaseSchema`'s rule, because the same product may legitimately appear twice at two prices.
  4. Built the pure calculators first, each with a unit-test file, none touching a database: `sale-totals.ts` (`resolveUnitPrice`, `calculateSaleLineTotal`/`calculateSaleTotal` round-per-line-then-sum, `calculateTotalHpp` round-once — the opposite rule, proven by a test where the two diverge) and `sale-stock.calculator.ts` (`aggregateStockRequirements`, which sums exact per-material quantities across every contributing line, rounds once, and returns entries sorted ascending by `rawMaterialId` — the function that pins ADR-016's lock order without a database). Added `stock-movements/stock.rules.ts` (`assertSufficientStock`, checks every requirement before throwing so the exception names every short material at once) and `stock-movements.exceptions.ts` (`InsufficientStockException`).
  5. Extended `StockMovementsService` with `lockRawMaterialsInIdOrder` — the one place every stock-touching flow now takes its raw-material locks, in the one ascending order (ADR-016) — and `applyOutbound` (locks, reads, `assertSufficientStock`, then writes OUT movements + atomic `decrement`). `applyInbound` was refactored to call the shared lock helper instead of interleaving lock-and-write per line (same order, strictly safer); reran `purchasing-payables.e2e-spec.ts` immediately after to confirm the refactor didn't regress Phase 4.
  6. Built the `sales` module: `sales.exceptions.ts` (`SaleProductNotFoundException`, `InactiveProductException`, `RecipeIncompleteException`, `CentralBranchNotSellableException`), `sales.mapper.ts` (computes `totalHpp`/`grossMargin` from stored per-unit snapshots), `sales.service.ts` (the three-phase transaction: resolve → acquire-all-locks-ascending → compute-and-mutate, `{ maxWait: 5000, timeout: 15000 }` on the `$transaction` since this is the one flow expected to legitimately wait on contended locks), `sales.controller.ts` (`BranchScopeGuard` + explicit `@Roles('KASIR','ADMIN','OWNER')` on create; `GET /sales/:id` restricted to `OWNER`/`ADMIN` mirroring Phase 4's `GET /supplier-purchases/:id`), `sales.module.ts`. Registered in `app.module.ts`.
  7. Added `ProductInUseException` and its `P2003` mapping to `ProductsService.remove` (`SaleItem → Product` is `Restrict`) — anticipated from the plan rather than discovered, and fixed the cleanup order in `master-data.e2e-spec.ts` (`saleItem`/`sale` before the global `product.deleteMany({})`) and `auth-rbac.e2e-spec.ts` (`saleItem`/`sale` before the global `ledgerEntry.deleteMany({})`) before either could break on a seeded database.
  8. Added the seed's Sale fixture (2 × Es Kopi Susu, Cabang Melati, Kas Tunai) through `SalesService.create`, guarded by a `sale.findFirst` idempotency check — same single-writer discipline as Phase 4's purchase/settlement fixtures.
  9. Built `sales.e2e-spec.ts` — 22 cases covering the happy path/HPP snapshot (including the immutability test: a later `RawMaterial.unitCost` PATCH moves live `Product.hpp` but not the sold `SaleItem.hppAtSale`), the two concurrency cases (§2.2/§2.3 below), full-rollback-on-partial-shortfall, rejections (no recipe, inactive, central branch, validation edges, ignored client-supplied `totalAmount`/`userId`), RBAC/BranchScopeGuard, and a stock-balance integrity re-derivation across every raw material the suite touched.
- **Decisions made during this task:**
  (1) Option K2 chosen for lock acquisition: aggregate the full recipe fan-out first, then lock every distinct raw material up front in ascending `rawMaterialId` order, before any cost read or write — rejected lazy per-line locking (client-controlled cart order deadlocks), a single batched `ANY($1) ORDER BY id` statement (correct today but a query-plan dependency no test can pin — deferred as DEBT-008), and optimistic retry (already rejected by ADR-007).
  (2) `SaleItem.hppAtSale` is per-unit, not line-extended — the same number `Product.hpp` shows live, letting the sale flow reuse `calculateHpp` verbatim per ADR-005's own requirement.
  (3) One `StockMovement` per distinct raw material per sale, quantities summed across lines — `StockMovement.referenceId` is polymorphic with no `saleItemId`, so per-line rows would be indistinguishable on read-back.
  (4) A product with no recipe is rejected (`RecipeIncompleteException`, 409), never sold at `hppAtSale = 0` — consistent with ADR-013's "no recipe ≠ recipe costs nothing."
  (5) The ascending-lock-order loop was extracted into one shared `lockRawMaterialsInIdOrder`, used by both `applyInbound` and `applyOutbound`, rather than duplicating it — the invariant is cross-module (ADR-016) and two copies is two places to get it wrong.
- **Status:** Done
- **Handoff notes:** `pnpm turbo run lint typecheck test build` green (15/15 tasks); 93 e2e tests (allocation, auth/RBAC, master-data, purchasing-payables, sales) and 52 unit tests pass — verified in both `db:seed` → `test:e2e` and `test:e2e` → `test:e2e` order, and the `test:e2e` → `test:e2e` re-run separately to confirm no first-run-only state. Seed re-checked: Sale `36000.00` INFLOW, `hppAtSale "4530.00"` per unit (same figure TASK-005 uses for the `toJSON()` scale trap), Gula `24.5000` / Kopi `6.9640` after the Phase 4 purchase increments and this sale's decrement — idempotent on re-seed. **What Phase 6 (Inventory) must know:**
  - `StockMovement` now has both writers (`applyInbound` for `PURCHASE`, `applyOutbound` for `SALE`); Dashboard 5's inventory summary can sum both directions directly, no schema change needed.
  - `OpeningStock` and `GET /stock-movements` are still unbuilt — `StockReferenceType.OPENING`/`ADJUSTMENT` remain unwritten, per the enum's own comment.
  - The `lockRawMaterialsInIdOrder`/ascending-id-order invariant (ADR-016) applies to any future flow that locks `raw_materials` — an opening-stock bulk-entry flow, if it ever locks rows concurrently with sales/purchases, must call the same helper rather than rolling its own loop.
  - `Sale` and `SaleItem` add more `Restrict` children (`raw_materials`, `ledger_entries`, `branches`, `products`, `users`, `accounts`); any new e2e suite that wipes those tables unconditionally must account for it, and any that already exists was fixed in this task — verify with `db:seed` → `test:e2e` per ERR-004/ERR-005's lesson.

### TASK-007 — Fix `allocation-sum.e2e-spec.ts` isolated-run failure (Phase 4 recurrence)

- **Date:** 2026-08-16
- **Module / Phase:** Follow-up to Phase 4 (Purchasing & Payables) — test cleanup only
- **Objective:** Fix a recurrence of ERR-004 in a third suite, `allocation-sum.e2e-spec.ts`, which fails when run in isolation against a seeded database even though the full e2e suite passes.
- **Relevant docs:** ERR-004 (`06 - Error_Log.md`), ADR-006, ADR-007, ADR-014.
- **What was done:** Reviewed with the new `review-remediation` skill, which produced a machine-executable spec (`docs/remediations/phase-4-purchasing-payables.md` — local working doc, gitignored, not part of this repository) scoped to exactly one file. Independently re-verified every claim in that spec before acting on it, per this project's own "verify, don't trust" standard: reproduced the failure by temporarily reverting the fix (8/8 tests fail without it), confirmed the fix restores 8/8 in isolation and 71/71 in the full suite, and ran the full quality gate (`turbo run lint typecheck test build`, 15/15). `apps/api/test/allocation-sum.e2e-spec.ts`'s `beforeEach` and `resetDatabase` now delete `payableSettlement` → `payable` → `supplierPurchaseItem` → `supplierPurchase` → `stockMovement` (and, in `resetDatabase`, `recipeItem`/`product`/`rawMaterial`/`supplier`) before the pre-existing wipe of `ledgerEntry`/`account`/`category`/`branch` — the same pattern ERR-004 already applied to `auth-rbac.e2e-spec.ts` and `master-data.e2e-spec.ts`.
- **Decisions made during this task:** None — this is a mechanical cleanup-ordering fix with no design surface; no schema, service, or contract changed.
- **Status:** Done
- **Handoff notes:** Extends ERR-004's own prevention rule: the isolated-run check (`db:seed` → `test:e2e -- <single-suite>`) must be run per-suite, not just as a full-suite pass, for every suite that touches a table referenced by a `Restrict` foreign key — a full-suite pass can hide exactly this failure mode when one suite happens to clean up after another. Any future phase adding a `Restrict`-referenced table should re-check all three suites (`auth-rbac`, `master-data`, `allocation-sum`) in isolation, not assume ERR-004's fix already covers every case.

### TASK-006 — Phase 4: Purchasing & Payables

- **Date:** 2026-08-16
- **Module / Phase:** Phase 4 — Purchasing & Payables (`Supplier`, `SupplierPurchase`, `SupplierPurchaseItem`, `Payable`, `PayableSettlement`, `StockMovement`)
- **Objective:** Implement full inventory inbound purchasing, supplier management, payables ledger settlement, and stock movements with pessimistic row locking per the Phase 4 implementation plan (`docs/plannings/phase-4-purchasing-payables.md` — local working doc, gitignored, not part of this repository).
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
- **Objective:** Implement Master Data domain models, live HPP calculator, derived makeable quantity, and atomic recipe replace API shape per the Phase 3 implementation plan (`docs/plannings/phase-3-master-data.md` — local working doc, gitignored, not part of this repository).
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