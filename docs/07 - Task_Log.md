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

### TASK-082 to TASK-099 — Remediasi Audit QA Adversarial (Gelombang 1–4)

- **Date:** 2026-08-23
- **Module / Phase:** Full-stack remediation: database triggers, schemas, API services/controllers, security middleware, and CI pipelines
- **Objective:** Close 22 defects from the 2026-08-23 Adversarial QA Audit, raising system readiness from 5.5 to 9.0 (ready for production pilot).
- **Relevant docs:** `docs/plannings/2026-08-23-remediasi-audit-qa-adversarial.md`, ADR-001–ADR-023, Engineering Playbook v3
- **What was done:**
  - **TASK-082 (Idempotency Keys):** Added nullable `idempotency_key` and unique indexes to `sales`, `supplier_purchases`, and `payable_settlements`. Implemented client-generated UUID idempotency key handling across API and web clients. Closes DEF-A1, DEF-A2, DEF-A5, DEBT-017.
  - **TASK-083 (Ledger Allocation Limit):** Added DB trigger `trg_check_ledger_allocation_sum` on `allocations` enforcing `SUM(amount_portion) <= LedgerEntry.amount` with `SELECT FOR UPDATE` on `ledger_entries`. Closes DEF-A3.
  - **TASK-084 (Bounded Matching Engine):** Added subset evaluation budget (2,000,000 max), arithmetic feasibility pruning, `MAX_LEDGER_WINDOW = 5000`, and `truncated: boolean` response flag in `MatchingEngine` and `MatchingService`. Closes DEF-A4, DEF-A17.
  - **TASK-085 (Regression Test Suite):** Added `apps/api/test/idempotency.e2e-spec.ts` covering P0-1, P0-2, P0-4 scenarios, and updated `allocation-sum.e2e-spec.ts` for DEF-A3.
  - **TASK-086 (Safe Sort Contracts):** Removed non-existent `'dueDate'` from `PayableSortBySchema` and created `apps/api/test/sort-contract.e2e-spec.ts` to exhaustively test all sort keys. Closes DEF-A7.
  - **TASK-087 (Accounting Period Lock):** Implemented G4-b policy (N=3 days backdate limit for KASIR role, OWNER unrestricted) in `SalesService` and `SupplierPurchasesService`. Closes DEF-A6.
  - **TASK-088 (Decimal Overflow Guard):** Added `superRefine` limits on line and total amounts in `CreateSupplierPurchaseSchema` and `CreateSaleSchema` using `Number.MAX_SAFE_INTEGER`. Closes DEF-A14.
  - **TASK-089 (Safe 503 System Reference Errors):** Replaced leaking 500 exceptions in `system-refs.ts` with `ServiceUnavailableException` (503) and logged admin instructions. Closes DEF-A9.
  - **TASK-090 (Pessimistic Locking on Revoke):** Wrapped `AllocationService.revoke` in a database transaction with `SELECT ... FOR UPDATE`. Closes DEF-A16.
  - **TASK-091 (Structured 500 Logging):** Enhanced `PostgresTriggerExceptionFilter` to log error object, correlation ID, HTTP method, and URL. Closes DEF-A8.
  - **TASK-092 (Boot Environment Validation):** Added Zod `EnvSchema` to `ConfigModule.forRoot` enforcing 32-character minimum secret lengths. Closes DEF-A15.
  - **TASK-093 (Security Headers & Trust Proxy):** Added `helmet` middleware and configured `trust proxy` to 1 hop. Closes DEF-A11.
  - **TASK-094 (Upload Stream Limits):** Added `limits: { fileSize, files: 1 }` to `FileInterceptor` across all file upload endpoints. Closes DEF-A10.
  - **TASK-095 (Restricted Swagger & Metrics):** Limited Swagger UI to non-production environments and restricted `/metrics` to `OWNER` role. Closes DEF-A13.
  - **TASK-096 (Blocking Dependency Audit):** Created `scripts/audit-check.mjs` and `audit-allowlist.json`, making CI audit blocking. Closes DEF-A12, DEBT-046.
  - **TASK-097 (CodeQL Workflow):** Added `.github/workflows/codeql.yml` for automated static security analysis.
  - **TASK-098 (Coverage Threshold Enforcement):** Added `@vitest/coverage-v8` in `apps/web` and configured coverage thresholds across API and web.
  - **TASK-099 (Volume Smoke Test):** Created `apps/api/test/volume-smoke.e2e-spec.ts` testing proposed matches, reports, and inventory summary under load.
- **The trap that mattered most:** In Prisma 7 with driver adapters, `P2002` unique constraint violation errors return different `meta.target` formats (index name, snake_case column, or camelCase property name). The `isIdempotencyReplay` helper had to handle all shapes to correctly return 200 replay responses rather than 500 internal server errors.
- **Status:** Done
- **Handoff notes:** All 18 remediation tasks implemented and verified against unit, e2e, and turbo pipelines.

### TASK-081 — The two Pengeluaran tabs that stopped at 50 rows without saying so

- **Date:** 2026-08-23
- **Module / Phase:** `hooks/useExpenses.ts`, `GeneralExpenseTab`, `PurchaseEntryTab` — web only
- **Objective:** Close DEBT-055. `useLedgerEntries` and `useSupplierPurchases` requested a hardcoded `limit=50` and neither table passed a `pagination` prop, so Pengeluaran Umum and Pembelian Bahan Baku showed the newest 50 rows with **nothing on screen** marking the truncation — and, since TASK-073, an export file that could be longer than the table above it.
- **Relevant docs:** DEBT-055, DESIGN.md §12.4 Pagination, `docs/plannings/2026-08-23-roadmap-sisa-pekerjaan.md` §3 Gelombang 1b, `PayablesTab.tsx` (reference implementation)
- **What was done:**
  - `useExpenses.ts`: `LedgerEntryFilterParams` and `SupplierPurchaseFilterParams`, each with a `build*Query` **shared** between the hook and its `fetch*Page`. Both hooks now take the params object, key on `[...prefix, params]`, and use `keepPreviousData`. New exported `DEFAULT_EXPENSES_PAGE_SIZE = 10`, matching `PayablesTab`'s own default so the three tabs of one screen do not stop at three different row counts.
  - `type=OUTFLOW` stays hardcoded inside `buildLedgerEntryQuery` — it is what the Pengeluaran Umum screen *is*, not a filter the operator chose.
  - Both tabs gained `page`/`limit`/`sorting` state, a `handleSortingChange` that resets to page 1, a `queryParams` memo shared with `exportAll`, and a `pagination` prop with `itemNoun` `pengeluaran` / `pembelian`.
  - Five columns lost their `SortableHeader` (see below).
  - Tests: two new suites, `GeneralExpenseTab.test.tsx` and `PurchaseEntryTab.test.tsx`, 7 cases each. 59 web suites / 433 tests, up from 57 / 419.
- **The trap that mattered most:** **the footer was the smaller half of this defect.** Five columns across the two tables carried a `SortableHeader` for a key the backend has none of — `note` and `sourceType` on the ledger, `supplierName`, `branchId` and `paymentStatus` on purchases. While the tables held 50 unpaginated rows those headers were merely local; the moment `data` holds one page of 10, each one reorders ten rows while presenting itself as ordering the whole ledger. That is the identical lying-control class the pagination footer was added to remove, so shipping the footer without this would have closed one instance and opened five. They now render plain string headers, following `StockMovementsTable`, and only the real backend keys (`entryDate`/`amount`, `purchaseDate`/`totalAmount`) stay sortable. Pinned by a case per tab asserting those headers are absent and the real one present.
- **Decisions made during this task:**
  - **`DEFAULT_EXPENSES_PAGE_SIZE` was added rather than reusing `PayablesTab`'s constant in place.** Editing `PayablesTab` was out of scope; the new constant's docstring names the number it is matching so the coupling is visible rather than coincidental.
  - **Page size 10, not 50.** Keeping 50 would have made the footer technically present and practically invisible on a small dataset, which is how a control ends up untrusted. Every other server-paginated table in the app defaults to 10 or 25.
  - **`fetchLedgerEntriesPage(page, limit)` became `fetchLedgerEntriesPage(params)`** (same for purchases). The positional form could not carry `sortBy`/`sortOrder`, and a params object is what the other five paginated hooks already take.
  - **This is the first consumer of TASK-074's `sortOrder`** on `/ledger-entries` and `/supplier-purchases`. The two tasks were done back-to-back on purpose, so those two hook files were touched once rather than twice.
- **Status:** Done
- **Handoff notes:**
  - **No schema, contract, or API change** — `git status` for this task touches `apps/web` only. Gates: `turbo run lint typecheck test` green 13/13; 59 web suites / 433 tests; API e2e green at 15 suites / 358 tests (unchanged by this task).
  - **Sabotage-verified three ways**, each reverted after: removing the `pagination` prop reddens the footer/page-reset/page-size cases only; making `exportAll` rebuild its params instead of spreading `queryParams` reddens only the export-parity case; restoring a `SortableHeader` on `note` / `Lokasi` reddens only the no-fake-sort case.
  - **Browser verification was not performed** — no dev server in this session. The manual check worth doing: on both tabs confirm the footer reads a total larger than 10, page forward, and confirm the Export count matches the footer's total.
  - **Every paginated table now states its total twice** — once in the footer, once in the `Export (340)` label TASK-073 added — so `getByText` on a bare number is ambiguous on all of them. Assert the footer's `textContent` via `data-testid="data-table-pagination"` instead; see **ERR-027**.
  - **Not done here, deliberately:** neither tab has a search box or a date-range filter. Neither is a regression — they never had one — but Pengeluaran Umum showing 10 of several hundred rows with no way to search is a weaker screen than Sales History beside it. That is the same shape as **DEBT-053** (`PayablesTab` has no search box either), which has been widened to cover all three tabs of this screen rather than a new entry being invented here — its parenthetical calling `PurchaseEntryTab` "not comparable" was true only until this task.

### TASK-074 — The three list endpoints that accepted a sort key but not its direction

- **Date:** 2026-08-23
- **Module / Phase:** `supplier-purchases`, `ledger-entries`, `suppliers` — API and contracts only
- **Objective:** Close DEBT-049, the last open item of the TASK-067…074 pagination/sort/search/export series. `GET /supplier-purchases`, `GET /ledger-entries` and `GET /suppliers` each accepted `sortBy` but pinned the direction in the service (`orderBy: { [sortBy ?? 'x']: 'desc' }`), so a client could pick the column and never the order.
- **Relevant docs:** DEBT-049, ADR-010 (contracts as source of truth), Playbook §4, `docs/plannings/2026-08-23-roadmap-sisa-pekerjaan.md` §3 Gelombang 1
- **What was done:**
  - `sortOrder: SortOrderSchema.optional()` added to `SupplierPurchaseQuerySchema`, `LedgerEntryQuerySchema` and `SupplierQuerySchema`, each importing `SortOrderSchema` from `pagination.schema` alongside `PaginationQuerySchema`.
  - Each service destructures `sortOrder` with the default that preserves its previous behaviour — `'desc'` for supplier purchases and ledger entries, **`'asc'` for suppliers** — and the literal in `orderBy` is replaced by the variable.
  - No DTO changes were needed: all three `*QueryDto` classes are `createZodDto(...)` over the schemas above, so the field arrives typed.
  - Tests: 7 new e2e cases in `purchasing-payables.e2e-spec.ts` (Cases 37–43, covering `/supplier-purchases` and `/suppliers`) and 4 in `reconciliation-addendum.e2e-spec.ts` (`GET /ledger-entries — sortOrder`). API e2e 15 suites / 358 tests, up from 347.
- **The trap that mattered most:** the three defaults are **not** all `'desc'`. `SuppliersService` ordered by name ascending; destructuring `sortOrder = 'desc'` there would have silently reversed the master-data supplier list and the POS/expenses supplier dropdowns for every caller that does not pass the parameter. Pinned by Case 42, which asserts a *bare* `?sortBy=name` still comes back A→Z.
- **Decisions made during this task:**
  - **`sortOrder` stays off `PaginationQuerySchema`**, per DEBT-049's own reasoning and the comment already on `SortOrderSchema`. Opting in per module keeps "advertises it" and "respects it" the same set; hoisting it would re-create the silent-drop bug TASK-067 existed to fix.
  - **Every sort assertion is fenced by a filter unique to its block** — a `purchaseDate` window of 2026-11 for purchases, a `search=PP ` prefix for suppliers, an `entryDate` window of 2026-06 for ledger entries. Rows written by earlier describes in the same file therefore cannot drift into the comparison, which is what makes "asc is the exact reverse of desc" a safe assertion rather than a flaky one.
  - **The fixtures make `sortBy` and `sortOrder` independently observable.** In each block the date order and the amount order deliberately *disagree*, so a service that honours the direction but ignores the key (or vice versa) fails rather than passing by coincidence.
  - **Ledger fixtures are seeded per test, not in a `beforeAll`.** `reconciliation-addendum.e2e-spec.ts` has a suite-level `beforeEach` that truncates `ledgerEntry`; a once-only fixture was written, wiped, and produced three empty-array failures before this was found — see **ERR-025**.
  - **No `apps/web` change.** None of the three endpoints has a server-driven sort header today: `useSuppliers` is a `limit=100` dropdown feed, and the two expenses tabs are DEBT-055 / TASK-081. The contract addition is optional and additive, so ADR-010's "update both sides in the same PR" has nothing to update on the web side yet.
- **Status:** Done
- **Handoff notes:**
  - **No schema change, no migration, no new dependency, no access change** — no second approval gate was needed. Gates: `turbo run lint typecheck test` green 13/13 (57 web suites / 419 tests unchanged); API e2e green.
  - **Sabotage-verified before the green was trusted:** reverting all three `orderBy` lines to their hardcoded literals reddens exactly 5 cases (37, 38, 41, and the two ledger direction cases) and nothing else. The three "omitting sortOrder keeps the old default" cases stay green under sabotage *by design* — that is what they exist to protect.
  - **This closes the TASK-067…074 series.** Every server-paginated table is now honest about rows, search, export and sort direction.
  - **Two ways an e2e result misled during this task, both now logged.** `pnpm test:e2e -- <pattern>` forwards the pattern positionally and reports `No tests found` with exit 1, indistinguishable from a failing suite (**ERR-026**); run `npx jest --config ./test/jest-e2e.json --runInBand <pattern>` instead and check the `Test Suites: N total` line against how many were named. The other is **DEBT-057** (a rerun inside 60s inherits the throttler budget). Verify the run before diagnosing the code.
  - **The natural next task is TASK-081 / DEBT-055** — `GeneralExpenseTab` and `PurchaseEntryTab` still request `limit=50` with no pagination footer. Two of the three endpoints touched here (`/supplier-purchases`, `/ledger-entries`) are exactly the ones it needs, and they now accept the full `page`/`limit`/`sortBy`/`sortOrder` set, so its server side is finished in advance.

### TASK-073 — Export that covers the whole filtered set, not the page that happened to be on screen

- **Date:** 2026-08-23
- **Module / Phase:** `DataTable`/`ExportButton`, `lib/export.ts`, six export call sites, five Reports views — web only
- **Objective:** Close DEBT-048, DEBT-025 and DEBT-024. The Export button built its workbook from `table.getFilteredRowModel().rows` — one page under server pagination — so "Export" on Utang Pemasok produced 25 rows for an accountant with nothing in the file marking it partial.
- **Relevant docs:** `docs/plannings/2026-08-23-full-export.md` (Option A, approved), DEBT-048/025/024, ADR-010, DESIGN.md §12.1/§12.4
- **What was done:**
  - New `apps/web/lib/fetchAllPages.ts`: walks a list endpoint 100 rows per request (`PaginationQuerySchema` caps `limit` at 100) until the set is complete. `EXPORT_ROW_CAP = 5000` — 50 requests, half the throttler's 100-per-60s budget (`app.module.ts`).
  - `DataTable` gained optional `exportAll` (row supplier) and `exportTotal` (real count). `ExportButton` now labels itself `Export (1.234)` and shows a `role="alert"` on failure instead of failing silently.
  - Six call sites wired: `PayablesTab`, `StockMovementsTable`/`Client`, `BankTransactionsTable`/`ReconciliationClient`, `AttendanceLogTable`, plus the two Kelas B tabs below. Each hook grew a `fetch*Page` function that **shares its query builder with the hook**, so the exported set cannot drift from the screen.
  - DEBT-025: shared `rangeSuffix(startDate, endDate)` in `lib/export.ts`; `ReportsClient` threads `filters` into all five views. `PayablesTab`/`BankTransactionsTable` deliberately keep the export-time date — neither screen has a date-range filter.
  - Tests: 3 new suites (`fetchAllPages.test.ts`, `StockMovementsClient.export.test.tsx`, `ReportExportFilename.test.tsx`) plus cases added to `data-table.test.tsx`, `export.test.ts`, `TopProductsView.test.tsx`. 57 suites / 419 tests, up from 54 / 395.
- **The trap that mattered most:** `exportAll` must close over the **same** filter object the on-screen query uses, overriding only `page`/`limit`. Rebuilding the filters independently is how the file quietly ends up holding a different set from the screen — with nothing in the file to say so, which is the same failure mode as the original bug. Pinned by a test that asserts the exported params equal the on-screen params after `page`/`limit` are stripped; sabotage-verified by making the export send bare `{page, limit}`, which reddens exactly that one case.
- **Decisions made during this task:**
  - **Past the cap it refuses, it does not truncate.** Truncating at 5,000 would be the identical defect with a bigger number. The button disables with "Terlalu banyak baris — persempit filter dulu."
  - **The seven client-side tables were deliberately NOT given `exportAll`.** They already hold their whole result set. `TopProductsView` is the sharp case: its `limit: 10` is the report's *definition*, so an `exportAll` there would silently change the file's meaning from "top 10" to "whole catalogue". Pinned by a test asserting exactly 10 rows.
  - **Two previously-unlogged defects found while inventorying the call sites** (now DEBT-055): `GeneralExpenseTab` and `PurchaseEntryTab` hardcode `limit=50` with **no pagination footer at all** — worse than DEBT-048, since nothing on screen marks the truncation. Approved scope: fix their **export** only. Consequence to expect: their files can now be longer than the table above them.
  - **`rangeSuffix` falls back to the LOCAL date, not `toISOString()`'s UTC one.** Found during the browser verification, which ran at 04:00 WIB and produced `..._2026-08-22.xlsx` on 2026-08-23. Every export between 00:00 and 07:00 was being named with yesterday's date. The pre-existing expression had this bug too; centralising it made it visible.
  - **`ProfitLossView`'s export callback was missing the range from its `useCallback` deps** — changing the range and exporting wrote the *previous* range into the filename. Caught by an eslint warning, not by a test.
- **Status:** Done (DEBT-024 substantially, see below)
- **Handoff notes:**
  - **No API, contract, or schema change** — `git status` touches `apps/web` only. Gates: `turbo run lint typecheck test` green (13/13, 0 errors), 57 web suites / 419 tests; API e2e 15 suites / 347 tests green.
  - **Nine sabotage checks were run before trusting any green**, each reverted after: stopping the page walk, truncating instead of throwing, ignoring `exportTotal`, ignoring `exportAll`, reverting `rangeSuffix`, `PAGE_LIMIT` 100→500, removing the cap guard, rebuilding export filters independently, and wrongly giving `TopProductsView` an `exportAll`. Each reddened only its intended cases.
  - **An e2e flake was isolated, not chased** (now DEBT-057): running `test:e2e` twice inside 60s inherits the previous run's throttler budget and fails assorted assertions. Confirmed by `git stash` that the committed baseline behaves identically — it is not a regression from this work.
  - **Browser verification (DEBT-024) reached the workbook but not the Downloads folder.** Valid 26 KB `.xlsx` (`PK` magic), 594 data rows for a 594-row set, 6 requests at `page` 1–6 / `limit` 100. The `<a download>` hand-off is suppressed in the automated tab — proven to be the environment, not the code, by a bare `Blob`+anchor probe containing no app code that also produced no file. **One human click in a normal Chrome window is all that remains.**
  - **Left out of scope, logged:** DEBT-055 (pagination footers for the two expenses tabs — the natural next task, and their hooks are already half-converted), DEBT-056 (server-side export endpoints, Option B, if the 5,000 cap is ever hit), DEBT-057 (the e2e throttler flake).

### TASK-072 — Server-side search for the four tables whose search box only covered one page

- **Date:** 2026-08-23
- **Module / Phase:** `sales`, `reconciliation`, `stock-movements`, `devices` (attendance) — API and web; plus the shared `DataTable`
- **Objective:** Close DEBT-047 and DEBT-052. Four server-paginated tables offered a search box that was a TanStack column filter over the rows already on screen: it searched 25 rows while looking like it searched the whole history.
- **Relevant docs:** ADR-010 (contracts as source of truth), ADR-011 (RoleGuard — unchanged, no endpoint's access widened), Playbook §4, DESIGN.md §12.1/§12.4, `docs/plannings/2026-08-23-server-side-search.md` (Option A, approved)
- **What was done:**
  - `search: z.string().trim().optional()` added to `SaleQuerySchema`, `ReconciliationQuerySchema`, `StockMovementQuerySchema` and `AttendanceQuerySchema`, following `SupplierQuerySchema`'s existing pattern.
  - Translated in the four services into `OR` + `contains` + `mode: 'insensitive'`: sales over id / branch / cashier / account; reconciliation over `description`; stock movements over raw material / branch; attendance over user name / **user email** / branch / device label.
  - `DataTable` gained a `serverSearch: { value, onChange }` prop. `DataTableToolbar` renders one input for both modes; `serverSearch` takes precedence and `searchColumns` is then ignored entirely, so a page the server already filtered is never filtered again client-side.
  - New `apps/web/hooks/useDebouncedValue.ts` (12 lines, no new dependency). The four call sites own the raw input value, debounce it at 300 ms, and reset to page 1 on the keystroke.
  - The four tables dropped `searchColumns` and their "…di halaman ini" placeholders for honest ones ("Cari id, cabang, kasir, atau akun…", etc.).
  - Tests: 7 new e2e cases in `stock-movements.e2e-spec.ts`, 10 in `attendance.e2e-spec.ts`, 7 in `reconciliation-addendum.e2e-spec.ts`, 8 in `sales.e2e-spec.ts`; 5 new `data-table.test.tsx` cases; three new web suites (`SalesHistoryClient.search`, `StockMovementsClient.search`, `AttendanceLogTable.search`) and a `server-side search` block in `ReconciliationClient.test.tsx`.
- **The trap that mattered most:** `ReconciliationQueryDto` serves **both** `GET /reconciliation/transactions` and `GET /reconciliation/summary`, and both go through the same `buildWhereClause`. The summary computes `variance = actualBankBalance − recordedLedgerBalance`. A keyword can only match a bank transaction's `description`, so putting `search` in the shared builder would shrink the bank side while the ledger side stayed whole — turning `variance` into a wrong number that still looks official. `search` is therefore applied inside `getTransactions` only, after `buildWhereClause` returns, and `summaryFilters` in `useReconciliation.ts` drops it on the frontend. Pinned by an e2e case asserting `/summary?search=alpha` returns a `variance` **identical** to `/summary`; sabotage-verified — moving the clause into `buildWhereClause` fails exactly that one case and nothing else.
- **Decisions made during this task:**
  - **Four modules, not the two DEBT-047 names.** Stock Movements and the Attendance log had the identical defect and all four share the same `data-table.tsx` change; splitting them would mean a second visit to the same file, which DEBT-047's own "worth doing once for several modules" reasoning existed to avoid.
  - **`serverSearch` supersedes `searchColumns` rather than being made type-exclusive.** The plan called them mutually exclusive; the implementation makes the precedence explicit and pins it with a test, which is cheaper than a discriminated-union prop and fails loudly if someone later makes the toolbar apply both.
  - **Page 1 is claimed at keystroke time, not in an effect on the debounced value** — see ERR-024. The effect version worked but issued one discarded request per settled keyword and made the tests timing-dependent.
  - **`pg_trgm` was not adopted.** `ILIKE '%x%'` cannot use an index, but the indexed version needs a migration (its own approval gate) and the API contract and frontend are byte-for-byte identical either way. Logged as **DEBT-054**, triggered by `EXPLAIN ANALYZE` on real volume rather than by a guess.
  - **Attendance's two `OR` groups are wrapped in `AND`.** The branch filter already used a top-level `OR`; writing the search as a second `OR` key on the same object silently overwrites the first and drops the branch scoping. It is the only one of the four services with this clash. Pinned by an e2e case using a deliberately contradictory keyword + branch pair whose correct answer is zero — a clobbered clause answers 11 or 1, never 0.
- **Status:** Done
- **Handoff notes:**
  - **No schema change, no migration, no new dependency** — nothing here needed a second approval gate after the option was chosen.
  - Gates: `turbo run lint typecheck test` green (13/13 tasks — 54 web suites / 395 tests, 22 api unit suites / 166 tests); full e2e green (15 suites / 347 tests). Every new assertion was sabotage-checked before being trusted: dropping `mode: 'insensitive'` reddens the case-insensitivity cases; moving the reconciliation clause into `buildWhereClause` reddens only the variance case; writing attendance's clauses as two top-level `OR` keys reddens only the AND case; deleting the page reset reddens only the page-reset cases; making the toolbar apply both search modes reddens only the precedence case.
  - **Browser verification was not performed** — the API dev server was not running in this session. The one manual check worth doing before this ships: on each of the four screens, type a keyword that is absent from page 1 but present later, and confirm the row appears. Everything else is covered by the e2e page-2 cases.
  - **Deliberately left out of scope:** DEBT-048 (export still covers the current page only — `ExportButton` still reads `getFilteredRowModel()`, unchanged by this task); **DEBT-053** (new — `PayablesTab` is server-paginated with no search box at all, which is a feature rather than a defect fix); **DEBT-054** (new — the unindexed `ILIKE` scan above).
  - The nine tables that load their whole result set and search client-side (`AccountsTable`, `UsersTable`, `ProductsTable`, `RawMaterialsTable`, `InventorySummaryTable`, `BranchesTable`, `DevicesClient`, `IncomeByPaymentMethodView`, `ProductProfitView`) were **not** touched. Client-side search is correct there and `searchColumns` remains the right prop for them.

### TASK-071 — Attendance: the month navigator that could not navigate, plus pagination for attendance and leave

- **Date:** 2026-08-22
- **Module / Phase:** `devices` (attendance) + `leave-requests`, API and web
- **Objective:** Close DEBT-042 (unpaginated leave requests). Reading the code to do so turned up a correctness defect DEBT-042 does not describe, which became the larger half of the task.
- **Relevant docs:** ADR-010 (contracts as source of truth), ADR-011 (RoleGuard), Playbook §8, DESIGN.md §22 (colour is never the sole carrier of meaning)
- **What was done:**
  - `AttendanceQuerySchema` gained `startDate`/`endDate` (filtering `loginAt`), `page`, `sortBy`, `sortOrder`, and a `limit` ceiling raised 200 → 500; response became `{ data, meta }` via `AttendanceListResponseSchema`.
  - `LeaveRequestListQuerySchema` gained `overlapsFrom`/`overlapsTo`, paging and sorting; response became `{ data, meta }`.
  - `AttendanceService.findRecords` and `LeaveRequestsService.findAll` rewritten to filter, page, count and order server-side. Sort keys `userName`, `branchName`, `deviceLabel` resolve through Prisma nested `orderBy`.
  - `AttendanceCalendarMatrix` now sends the displayed month's bounds; `AttendanceLogTable` gained server paging/sorting and a date-range filter; `OwnerReviewQueue` gained a pager on both tables.
  - New `apps/api/test/attendance.e2e-spec.ts` (18 assertions); `leave-requests.e2e-spec.ts` extended (5 → 10); new `AttendanceCalendarMatrix.test.tsx` (4 tests).
- **The defect that was actually there:** `AttendanceQuerySchema` had no date parameter at all, so the endpoint could only answer "the N most recent logins". `AttendanceCalendarMatrix` has a prev/next month navigator, fetched `limit: 200` with no dates, and filtered to the displayed month **client-side**. The month never reached the server. Navigating to an earlier month matched nothing and fell through to `type: 'NONE'` — a blank cell, which on an attendance screen reads as *absent*. A month where everyone worked rendered identically to one where nobody logged in. Reproduced against real data: with 253 logins in the current month, the old-style request (`?limit=200`, no dates) returned rows no older than **5 August** — July was entirely invisible, and so were the first four days of August.
- **Decisions made during this task:**
  - Query params for leave are named `overlapsFrom`/`overlapsTo`, **not** `startDate`/`endDate`. The model has columns by those names, so same-named params would read as containment; the filter is an overlap (`startDate <= to AND endDate >= from`) so leave spanning a month boundary belongs to both months.
  - `limit` max is 500 for attendance (overriding `PaginationQuerySchema`'s 100) so a month fits one page: 8 kasir × 2 logins × 31 days = 496.
  - A month past that cap renders a visible warning band driven by `meta.total`, agreed with the user before implementation. Silently trimming would have re-created the exact defect being fixed, in a new shape.
  - `OwnerReviewQueue`'s pending badge now counts `meta.total`, not `data.length` — otherwise it would read "50" while 130 requests waited.
  - Removed `'userEmail'` from `AttendanceLogTable`'s `searchColumns`: no column has that id, so TanStack threw `[Table] Column with id 'userEmail' does not exist` on every render while contributing nothing. Pre-existing at HEAD; fixed because the file was already in scope. Email search logged as DEBT-052.
- **Verification:** Sabotage-first on all three new behaviours — swapping `loginAt` → `createdAt` broke 10 of 18 attendance assertions; hardcoding sort direction broke 3; replacing the overlap filter with containment broke exactly the boundary-spanning test; removing the truncation band broke its web test. All restored: 28/28 e2e, 370/370 web, gate 13/13. Browser: July 2026 renders a full month of attendance where it previously rendered blank; the warning band fires at 500-of-805 with days 1–8 visibly empty beneath it; page 3 of 34 survives the 30s refetch with no skeleton; zero clipping and no horizontal overflow in both themes.
- **Status:** Done
- **Handoff notes:** Verification used ~830 synthetic attendance rows inserted into the **dev** DB tagged `user_agent = 'TASK071-VERIFY'` and deleted afterwards — dev is back to its original 2 rows. `findMine` on leave requests is deliberately still unpaginated (per-user, self-scoped, small). The matrix still filters to the exact day client-side inside `getDayStatus`; that is now redundant for the month but still correct and guards timezone edges. DEBT-051 records the aggregate-endpoint option (Option C) that was considered and deferred.

### TASK-070 — Stock Movement history: the read endpoint Phase 4 deferred, and the screen behind Dashboard 5's numbers

- **Date:** 2026-08-22
- **Module / Phase:** Tier 2 pagination — `StockMovement` (api + web + contracts)
- **Objective:** Give `StockMovement` an HTTP surface. It had none: `stock-movements.module.ts` shipped with `controllers: []` and a comment deferring reads to "Dashboard 5 in Phase 6" — but Phase 6 built the AGGREGATE (`GET /inventory/summary`) and never the row-level log behind it, so the evidence under every figure on the Inventory screen was unreachable from the product.
- **Relevant docs:** ERD §3, System Design §7, PRD §5.6, ADR-004 (central stock pool), ADR-007, ADR-011, ADR-018 (business day), ADR-010. Plan: `docs/plannings/2026-08-22-stock-movement-history-endpoint-and-screen.md`.
- **What was done:** Contract extended (`StockMovementResponseSchema` gained `rawMaterialName`/`rawMaterialUnit`/`branchName`; new `StockMovementSortBySchema`, `StockMovementQuerySchema`, `StockMovementListResponseSchema`). `StockMovementsService.findAll` added — server-side paging, five sort keys in both directions, six filters — plus `StockMovementsController` (`@Roles('OWNER')`) and the read-only `StockMovementQueryDto`. Frontend: `useStockMovements` hook, `StockMovementsTable`, `StockMovementsClient`, and the route `(back-office)/inventory/movements`. `nav-config.ts`'s flat `/inventory` entry became a group with two children. 21 new e2e assertions, 7 new web unit tests.
- **Why a dedicated route rather than a third tab on `/inventory`:** the tab was the cheaper option and was rejected on one specific ground — `PeriodNavigator` sits in the page header **above** the tabs and is month-shaped, while a movement ledger needs a free date range plus four filters. As a tab it would have left the period control either inert (a control that lies) or binding (making "every movement for this material since March" impossible). TASK-067 and TASK-068 were both about removing controls that lied; adding one here to save a `page.tsx` would have undone the lesson.
- **Decisions made during this task:** (1) **No running-balance column**, agreed with the user before coding. It is only definable for one material, sorted by date ascending, over the whole history — on a screen that pages, sorts five keys two ways and filters four fields it would be wrong in nearly every reachable state, and wrong silently. Logged as DEBT-050. (2) No `BranchScopeGuard`, mirroring `InventorySummaryController`: stock is one central pool (ADR-004), so a branch-partitioned history does not exist to be scoped; `branchId` is an attribution filter only, and OWNER is the only role on the route. (3) Sorting and filtering use **`movementDate`, never `createdAt`** — `applyOpening` stamps `movementDate` with the period start, so the two can differ by weeks. (4) The Flow Indicator carries direction in a chevron **and the words Masuk/Keluar**, never colour alone (DESIGN.md §12.2 + §22). (5) Write surface deliberately absent — no create DTO, so no door is advertised that does not exist.
- **Status:** Done
- **Handoff notes:** `turbo run lint typecheck test` green (13/13), **366** web unit tests (was 359). E2E: 21 new assertions, and 76 pass across `inventory` + `sales` + `stock-movements` together, confirming the new controller did not disturb the existing writers.
  **The sortOrder test was verified to actually fail before being accepted** — temporarily hardcoding `'desc'` in the service broke exactly 3 assertions; restored, 21/21. That check is the whole point: a suite that only asks "is the result sorted?" passes against a service that ignores the parameter, which is the TASK-067 defect verbatim.
  **Verified against live dev data (594 movements), not only fixtures:** default page 1 vs `quantity` asc vs `quantity` desc share **zero** of 10 rows; asc returns the global minima (`0`) and desc the global maximum (`149.990`), which a client-side sort of one page cannot produce. `referenceType=OPENING` returns **230** rows, every one with `branchName: null` rendering as "Pusat" — the central-event case a naive inner join would have dropped silently, and it is 39% of the table.
  **Browser-verified:** footer `Menampilkan 1–10 dari 594 pergerakan · 1 / 60`, Berikutnya → `11–20 … 2 / 60`, sort change resets to page 1, back chevron disabled on page 1, page-size 10/25/50 in the toolbar beside Export (50 → `1 / 12`), light and dark themes both correct. Two clipping checks ran explicitly this time — all seven column headers, and the search placeholder measured at 160px text in 260px available — because the equivalent regression in TASK-068 shipped from changing label text without ever looking at the screen.
  **Not verified in-browser:** the ADMIN/KASIR 403s, which would have required ending the OWNER session; they are asserted in e2e instead.
  **Still open for Tier 2:** `AttendanceRecord` and `LeaveRequest` (DEBT-042) remain unpaginated.

### TASK-069 — DESIGN.md: restore what the rewrite dropped, renumber topically, repair 40 citation sites

- **Date:** 2026-08-22
- **Module / Phase:** `docs/DESIGN.md` + every source comment that cites it (33 files)
- **Objective:** The user asked whether DESIGN.md needed changing. Auditing it turned up a documentation fault serious enough to have already caused wrong work, so this task fixes it.
- **Relevant docs:** `docs/DESIGN.md`, `1b7dd65:docs/DESIGN.md` (pre-rewrite), TASK-067, TASK-068. Plan: `docs/plannings/2026-08-22-design-md-restoration-and-citation-remap.md`.
- **What was done:** `git log --follow` showed DESIGN.md was cut from **1713 lines / 49 sections to 362 / 13** in commit `2a86daa`, when the design language moved from *modern soft SaaS retail* to *Luxury Hospitality*. The rewrite replaced the visual language but carried over none of the component-level rules and updated none of the ~40 citations. Three citation categories resulted: correct (3), **silently wrong** (`§8`/`§8.2`/`§9` — resolving to a real section with unrelated content, e.g. `formatters.ts` citing "§8, §9" meaning old *Typography*/*Color Tokens*, which today are *Application Shell*/*POS*), and orphaned (21 numbers past the end of the document). Restored the nine language-neutral sections (Spacing, Motion, Component State Rules, Content & Tone, Touch & Pointer, Component Library Rules, and the per-breakpoint behaviours), rewrote the five language-bound ones against the premium tokens (Buttons, Forms & Inputs, Status Badges, Empty/Loading/Error, Domain Components), and wrote **§20 Data Formatting & Locale** — the one topic *neither* revision ever covered, lifted from `lib/formatters.ts`. Document renumbered topically to §1–§25 and all 40 citation sites repointed. DESIGN.md is now 630 lines.
- **Decisions made during this task:** (1) The user chose a **full topical renumber** over appending new sections after §13 — the append option kept existing numbers stable but would have left Spacing at §14 sitting after Accessibility at §12. Affordable exactly once, and this was that time, since every citation was being rewritten anyway. (2) **Every citation now carries the section name, not just the number** (`§7 Spacing`, never `§7`). This is the change that would have prevented the whole problem: a stale reference becomes visibly wrong instead of silently wrong, which is the only defence against the "silently wrong" category. A guard stating this sits in DESIGN.md's header. (3) Old §40 specified pill-radius badges; `badge.tsx` uses `rounded-xs` and the current §8.1 reserves pill for status dots — documented what the code does, not what the old doc said. (4) Old §27 covered POS empty states only; broadened to all surfaces, since `DataTable` already has a skeleton and two distinct empty variants with no spec at all.
- **Follow-up (same day):** closed the highest-priority gap left by the audit — **dark mode was specified at the palette layer and nowhere else**. §6.6 gave dark token values, but every component rule in §10–§12 was written in raw light-theme hex with no dark counterpart, so a reader had no way to know whether a table header colour was a token or a literal. Added **§6.7 Building Components That Survive Both Themes**, and converted every raw hex in §10.2/§11.2/§11.3/§11.4/§12.1/§12.2 to its semantic token name. Only two hex references remain in the document and both are correct as literals: §12.4's contrast measurements and §25's list of forbidden neon colours. This also closed the separate finding that §6 forbade raw hex while §8–§12 were written almost entirely in it. **What made this cheap:** the implementation was already disciplined — a grep for literal colours across `apps/web/components` and `packages/ui/src/components` returns only `text-white` over solid semantic fills, which §6.7 now names as the single sanctioned exception. The defect was in the document, not the code, and §6.7 ships the grep as its own verification.
- **Status:** Done
- **Handoff notes:** `turbo run lint typecheck test` green (13/13), 358 web unit tests — this task changed no behaviour, only comments and documentation. Verification was mechanical, not by inspection: every cited number (`4 5 6.2 10 10.2–10.4 11.1–11.4 12.1–12.4 13 13.1–13.3 16 17 19`) was checked to exist among DESIGN.md's headings, and a regex pass confirmed no DESIGN.md citation lacks a section name. **Three defects in my own remap pass were caught by that verification and are worth knowing about:** a chained `str.replace` produced `§5 Typography Typography` where an earlier rule's output matched a later rule; and bare continuation references (`", §23"`, `"pagination in §10.4"`, `"+ §23"`) carried no `DESIGN.md` prefix so the pass skipped them, leaving numbers that still resolved but to the wrong content — the exact failure mode being fixed. A find-and-replace over section numbers must be verified against the heading list afterwards, never trusted. **Still open:** old §50 *Role-Aware Visual Behavior* and several POS/report sections were dropped deliberately and are not coming back; if a screen needs them they must be rewritten, not recovered.

### TASK-068 — Reconciliation: server-side sorting, shared pagination footer, and the two silent 100-row lookup caps

- **Date:** 2026-08-22
- **Module / Phase:** `Reconciliation` read path — `GET /reconciliation/transactions`, `ReconciliationClient`, `BankTransactionsTable`, `MatchReviewQueue`, `SplitAllocationDialog`
- **Objective:** TASK-067 treated this screen as the finished reference for server-side pagination because it had page controls. Audit that claim and fix what it hid.
- **Relevant docs:** TASK-067, ADR-010, ADR-011 §6, ADR-019, Playbook §4/§8/§10, DESIGN.md §28. Plan: `docs/plannings/2026-08-22-reconciliation-server-side-sorting-and-lookup-caps.md`. Defect: **ERR-022**.
- **What was done:** Three findings. (1) `useReconciliation.ts` hardcoded `sortBy: 'txnDate'` in `buildQuery` and `ReconciliationFilters` had no sort field, so all three sort headers reordered the visible 50 rows and never reached the API — including Jumlah. `description` had a sort header with no backend key at all. (2) and (3) are ERR-022: two lookups capped at `limit=100&page=1`, one of which dead-ended the operator. Changes: `SortOrderSchema` wired into `ReconciliationQuerySchema` and `description` added to `ReconciliationSortBySchema`; the service honours `sortOrder` and its `totalPages` gained the `|| 1` floor every other paginated service already had (an empty result had been reporting `totalPages: 0`); `ReconciliationClient`'s 26-line hand-rolled footer deleted in favour of the shared `DataTablePaginationFooter` from TASK-067 — which had been copied from it in the first place; a `fetchAllPages` helper added and both lookups moved onto it.
- **Decisions made during this task:** (1) Page to completion rather than warn about truncation — for the review-queue case there is no manual workaround at all, so a warning would have been honest and still useless. Raising `limit` was not available: `PaginationQuerySchema` caps it at 100 and loosening that weakens every endpoint. (2) Both lookup hooks now return a plain array instead of `{ data, meta }`, deliberately, so a caller cannot mistake one page for the whole set. (3) `useReconciliationSummary` now strips the sort from both its query key and its query string — the summary ignores ordering, and leaving it in made the summary refetch on every sort-header click for an identical response. (4) `MAX_LOOKUP_PAGES = 20` is a runaway-loop guard, not a limit; both call sites are narrowly filtered and nowhere near it. (5) `BankTransactionsTable`'s search placeholder relabelled "Cari keterangan di halaman ini…" for the same reason as Sales History in TASK-067.
- **Follow-up 3 (same day):** added a rows-per-page selector (10 / 25 / 50), default **10**, placed in the table's toolbar row beside Export (first built into the footer, then moved on the user's instruction — the two toolbar controls both govern the whole table, while the footer reports the current page) on all three paginated screens (Sales History and Payables were 25, Reconciliation 50). It renders only when `onLimitChange` is supplied, and reads its value from the server's `meta.limit` rather than a second copy of the state, so the control cannot disagree with the rows on screen. Every `onLimitChange` handler also resets to page 1 — page 5 of a 10-row paging is not page 5 of a 50-row one, and keeping the number can land the operator past the end of the result; a `PayablesTab` test pins that. `usePayables`'s own fallback limit moved 25 → 10 to match. DESIGN.md §10.4 amended with the selector spec and the new default. One test-harness note: `data-table.test.tsx` renders bare rather than through `renderWithClient`, so it needed a side-effect `import '@/test/test-utils'` for the jsdom polyfills Radix Select requires (scrollIntoView, pointer capture) — without it the select silently never opens.
- **Follow-up 2 (same day):** the user asked where the pagination UI's design reference came from. Honest answer: nowhere — it was copied from `ReconciliationClient`'s hand-rolled footer, written under the **previous** design language (modern soft SaaS retail) and propagated into the shared component without ever being checked against the current DESIGN.md, which was rewritten to "Luxury Hospitality & High-End Retail UI / quiet luxury". Audited and found one outright violation — the numerals were rendered in Plus Jakarta Sans, contradicting §5 and §10.1's "Numbers & Dates: *JetBrains Mono*, `tabular-nums`" — plus three softer misses (no gold accent on the active state, full-word buttons where §3.1 asks for restraint, shadcn-default idiom vs §13.4). Footer redesigned: row **range** caption ("Menampilkan 26–50 dari 62 transaksi") with every numeral in `numeric font-mono`, chevron `icon-sm` buttons with explicit `aria-label`s, and the active page marked by a champagne-gold hairline underline. **Gold text was rejected on measurement:** `#C5A880` is 2.26:1 against porcelain and `#A37D4E` is 3.75:1, both below the 4.5:1 §12 requires of text — so the accent is carried by a border, not the glyph. Rule codified as **DESIGN.md §10.4 Pagination** so the next agent has a spec instead of a precedent. `data-table.tsx`'s own citations were repointed from the non-existent §28/§41.4 to §10.1/§10.4.
- **Follow-up decision (same day, after user verification):** the pagination footer now renders **always**, not only when `totalPages > 1`. The original rule was inherited from `ReconciliationClient`'s hand-rolled footer, and the user's first look at the running app exposed its cost — with 2 sales, 1 payable and 45 bank transactions in the dev database, every table sat at exactly one page, so no control appeared and the feature was indistinguishable from one that had never been wired. An invisible control cannot be told apart from a missing one. The page counter is still dropped for a single page ("Halaman 1 dari 1" is noise), but the row total always shows and both buttons sit disabled. `data-table.test.tsx`'s `renders no pagination footer for a single page` was inverted accordingly, and a case for the empty result added.
- **Manual verification (same day, browser):** run against the live app with 135 seeded bank transactions. **The assertion that mattered:** under the default date sort, page 1 showed Rp 790.000 / 2.367.750 / 2.324.500; sorting by Jumlah ascending replaced them with Rp 15.000 / 45.000 / 50.000, and descending with Rp 9.400.000 / 6.800.000 / 5.675.250 — the extremes of all 135 rows, with only 1 of 10 rows shared with the date-sorted page. A client-side sort would have reordered the same ten rows and left the overlap at 10, so this is direct evidence the ordering is server-driven. Also confirmed: footer reads "Menampilkan 1–10 dari 135 transaksi · 1 / 14"; Berikutnya → "11–20 … 2 / 14"; a sort change resets to page 1; the back chevron is disabled on page 1; the page-size select sits in the toolbar beside Export (not in the footer), and switching it to 50 yields 50 rows and "1 / 3". Role boundary not re-tested in the browser — that would have required ending the OWNER session, and `reconciliation-addendum.e2e-spec.ts` already asserts KASIR gets 403 with the new sort parameters present. **Tooling note:** the MCP Playwright server named in `.agents/skills/e2e-playwright/SKILL.md` is not available in this environment, so the session ran on Claude in Chrome; the skill's credentials and route/role table still applied.
- **Regression found and fixed during that pass:** relabelling the search placeholder to "Cari keterangan di halaman ini…" made it *longer than the input*. The wrapper was a bare flex item at ~199px, so the text clipped to "Cari keterangan di ha…" — cutting off precisely the words that made the page-scoped search honest, which was the whole point of the relabel. Added `w-full` beside the existing `max-w-xs` so the wrapper claims its budget (320px; the text needs 190px). Pinned with a class-level test, since jsdom has no layout to measure. **Worth remembering: changing a label's text is a layout change.**
- **Status:** Done
- **Handoff notes:** `turbo run lint typecheck test` green (13/13); web 359 unit tests (up from 341), `reconciliation-addendum.e2e-spec.ts` 13/13, `allocation-sum.e2e-spec.ts` 8/8. No `schema.prisma` change, no migration, no new dependency. **The two ERR-022 regression tests were verified to fail against the old behaviour** before being accepted — the paging loop was temporarily disabled and both suites went red, then green again once restored; a regression test that has never failed proves nothing. One comment fixed in passing inside a block already being edited: `SplitAllocationDialog`'s `entryOptions` memo claimed "LedgerEntryQuerySchema has no date range", which ADR-019 made false. **What the next session should know:** the review-queue defect generalises — a hardcoded `limit`/`page=1` is fine in a display list and a defect in a lookup, and the request looks identical either way, so the check is what the caller does with the result. DEBT-049 now covers only `GET /supplier-purchases`, `GET /ledger-entries` and `GET /suppliers`; `GET /stock-movements` still has no controller and remains the highest-volume list in the system.

### TASK-067 — Tier 1: server-side pagination, filtering & sorting (Sales + Payables)

- **Date:** 2026-08-22
- **Module / Phase:** `Sale` + `Payable` list endpoints, shared `DataTable`, `packages/api-contracts`
- **Objective:** Wire the pagination/filter/sort capability that `GET /sales` and `GET /payables` already had into the two screens that were ignoring it, and make sorting server-driven so it is correct across the whole result set rather than the visible page.
- **Relevant docs:** ADR-010 (contracts are the single source of truth), ADR-011 (guards unchanged), Playbook §4/§8/§10, DESIGN.md §28 (DataTable). Plan: `docs/plannings/2026-08-22-tier1-server-side-pagination-sales-payables.md`.
- **What was done:** Two findings drove the shape of the work. (1) `DataTable` sorted and filtered **client-side** (`getSortedRowModel`/`getFilteredRowModel`), so adding page buttons alone would have made "sort by Sisa Utang" reorder only the visible rows while presenting itself as sorting the ledger. (2) `sortOrder` was **dead code**: `SalesHistoryClient` sent it, `usePos.ts` serialised it, `SaleQuerySchema` had no such field so Zod stripped it, and `sales.service.ts` hardcoded `'desc'` — ascending sort was impossible on every list endpoint in the codebase. Changes: `SortOrderSchema` added to `pagination.schema.ts`; `sortOrder` added to `SaleQuerySchema` and `PayableQuerySchema`; `PayableSortBySchema` extended with `supplierName` and `status`; both services now honour `sortOrder`, with `supplierName` resolved through a nested `orderBy: { supplier: { name } }`. `DataTable` gained three optional props (`sorting`, `onSortingChange`, `pagination`) that switch it to `manualSorting` and render a page footer. `useSales` and `usePayables` gained `keepPreviousData`; `usePayables` gained parameters. Sales History and the Payables tab now page at 25/row with server-driven sort, and Payables gained supplier + status filter dropdowns whose backend support already existed but had no UI.
- **Decisions made during this task:** (1) `sortOrder` is a **standalone export**, not a field on `PaginationQuerySchema` — putting it on the base schema would make six endpoints advertise a parameter only two of them honour, recreating finding (2) in five new places. Each module opts in as its service is wired. (2) Every new `DataTable` prop is optional and `manualSorting` only engages when **both** halves of the controlled sorting pair are present, so the other 15 tables are untouched; this was verified by requiring the pre-existing `data-table.test.tsx` suite to pass **unmodified**. (3) `supplierName` and `status` were added to `PayableSortBySchema` rather than removing those two sort headers — dropping an affordance users already have would have been a regression, and both are cheap (one nested `orderBy` branch). (4) Every filter control and both sort handlers call `setPage(1)`: page 2 of the old ordering is not page 2 of the new one. (5) Sales History's search stays client-side and its placeholder was relabelled "Cari di halaman ini..." rather than silently implying a full-history search the backend does not offer.
- **Status:** Done
- **Handoff notes:** `turbo run lint typecheck test` green (13/13); web 341 unit tests (up from 328), `sales.e2e-spec.ts` 27/27, `purchasing-payables.e2e-spec.ts` 36/36. No `schema.prisma` change, no migration, no new dependency — the new `DataTable` tests use `fireEvent` because `@testing-library/user-event` is not installed anywhere in this repo and adding it would need approval. **What the next session should know:** the `DataTable` props are the reusable half of this work — Stock Movements, Ledger Entries, Supplier Purchases and Suppliers each need the same two-line service change (`sortOrder = 'desc'` in the destructure, `sortOrder` in the `orderBy`) plus one `sortOrder` line in their query schema, and then their screens can pass the same three props. `GET /stock-movements` has no controller at all yet and is the highest-volume list in the system. Three deferred gaps are recorded in the Tech Debt Log: page-scoped search on Sales History, page-scoped Export, and the four endpoints still hardcoding their sort direction. A sortable column's `id` must equal a backend sort key — `toSaleSortBy`/`toPayableSortBy` narrow it explicitly, and adding a sort header without adding the key would silently fall back to the default ordering.

### TASK-066 — Synthetic Mandiri e-Statement PDF Fixtures for Manual Import Testing

- **Date:** 2026-08-22
- **Module / Phase:** Reconciliation → Import (`apps/api/src/modules/import/parsers/mandiri-pdf.parser.ts`), manual/browser testing support.
- **Objective:** The user needed real `.pdf` files to exercise the Reconciliation import UI by hand (upload → parse → preview), not just the existing unit-test fixtures embedded as `PdfTextItem[]` arrays in `mandiri-pdf.parser.spec.ts`. Generate 5 synthetic Mandiri Livin e-Statement PDFs covering the normal case and the parser's known edge cases.
- **Relevant docs:** ADR-022 (Mandiri PDF parsing scope), `mandiri-pdf.parser.ts`'s column-geometry header comment.
- **What was done:**
  - Wrote a standalone PDF byte-writer (`docs/e-statements/gen-mandiri-pdf.js`, no new dependency) that lays out text runs at the exact x-positions `MandiriPdfParser`'s `COLUMN` map slices by (`No` <40, tanggal 40–120, keterangan 120–370, nominal 370–460, saldo ≥460, row pitch 46pt), including realistic header/column-title/footer furniture and a disclaimer page, so the generated files exercise the same page-noise-filtering logic real statements do.
  - `docs/e-statements/make-statements.js` defines 5 scenarios: (1) 1-page/9-row normal mixed inflow/outflow, (2) 4-page + disclaimer/28-row multi-page statement, (3) 3 byte-identical rows to exercise the `dedupHash` counter-suffix path, (4) 12 rows mixing 6 deliberately malformed rows (invalid date `31 Feb 2026`, missing nominal, missing date, unsigned nominal, `+0,00`, empty description) against 6 that must survive (English/Indonesian month names, a 9-digit nominal, a 1-rupiah nominal, a missing time, a description truncated at the 500-char `CreateBankTransactionSchema` limit), (5) an empty-period statement (header/footer/disclaimer only, 0 transactions).
  - Verified all 5 against the real `MandiriPdfParser` (not a reimplementation) via `ts-node --transpile-only`, from their final location in `docs/e-statements/`: 9 / 28 / 6 / 6 / 0 transactions parsed respectively, matching every scenario's intent, with correct `dedupHash` uniqueness counts and correct skip counts on the edge-case file.
  - Added `docs/e-statements/README.md` documenting each file's scenario, expected parse result, and the regeneration command.
- **Status:** Done.
- **Handoff notes:** `docs/e-statements/` is untracked (not committed — no git write operations performed, per governance). The 5 PDFs are synthetic (no real account numbers, names, or transactions) and safe to commit or discard. Regenerate or extend via `node docs/e-statements/make-statements.js docs/e-statements`; if the parser's `COLUMN` x-ranges ever change, `gen-mandiri-pdf.js`'s layout constants must be updated to match or the generated files will stop parsing correctly.

### TASK-065 — Phase 14: Verification & Hardening Gate

- **Date:** 2026-08-22
- **Module / Phase:** Cross-cutting — e2e test infrastructure, inventory/reports period boundaries, concurrency, report query performance, ops readiness, tech-debt triage.
- **Objective:** Close out the pre-launch hardening plan (`docs/plannings/2026-08-21-phase-14-verification-hardening.md`, 5 workstreams, 4 approval gates): a real end-to-end monthly-cycle e2e test against hand-computed figures; re-verify stock concurrency under load with two new attack patterns; measure report query performance at realistic data volume and issue a formal ADR-008 verdict; triage the Tech Debt Log's duplicate IDs and stale entries; bring ops readiness (health check, metrics, graceful shutdown, Docker healthcheck) up to a shippable baseline.
- **Relevant docs:** ADR-007, ADR-008, ADR-016, ADR-018, ADR-023 (new), System Design §11, Playbook §7/§8/§15.
- **What was done:**
  - **Gates 1–4 approved** (WIB adoption for inventory; `.env.test` + `ohmypos_e2e` for e2e isolation; `prom-client` dependency; apply the ADR-008 decision rule literally).
  - **Workstream A:** `apps/api/test/monthly-cycle.e2e-spec.ts` (10 stages, ~900 lines, cycle month 2026-07) — every cart/purchase/settlement/reconciliation action via real HTTP calls, every expected figure hand-computed, not asserted-then-copied. Stage 8 reproduced the WIB/UTC boundary defect on purpose before the fix landed (see `ERR-020`). `apps/api/test/reset-database.ts` created as the one shared FK-safe truncation helper, replacing two suites' private copies (closes `DEBT-033`).
  - **Gate 1 / ADR-023:** `apps/api/src/modules/inventory/period.ts` now delegates to `apps/api/src/common/period.ts` (ADR-018's WIB resolver) instead of computing its own UTC boundary. `OpeningStock.periodMonth`'s `@db.Date` write needed a decoupled `periodMonthDate` field to avoid orphaning existing rows' unique key (verified empirically — no data migration needed). `apps/api/test/inventory.e2e-spec.ts` Cases R and D-1 updated to the WIB-correct expected values.
  - **Workstream B:** `apps/api/test/concurrency.e2e-spec.ts` extended with B1 (40-way lock-ordering/deadlock probe across two branches and opposite-order recipes — this found and fixed a **real production deadlock**: `SupplierPurchasesService.create()` ran `supplierPurchaseItem.createMany()` before `applyInbound()`'s explicit `FOR UPDATE` lock, and Postgres's implicit `FOR KEY SHARE` lock on the FK-referenced `RawMaterial` row during that `createMany` could deadlock against a concurrent purchase locking in the opposite order — fixed by reordering so the explicit lock is always acquired first), B2 (50-way oversubscription — required chunking bursts to 20 concurrent requests at a time to work around this local environment's connection-burst ceiling, not a server defect), B3 (mixed-direction sale/purchase race), B4 (30-way concurrent partial settlements). All assert zero 5xx and zero test-harness-abandoned requests (`Promise.allSettled`, not `Promise.all`).
  - **Workstream C:** `apps/api/prisma/seed-volume.ts` (disposable, guarded to only ever target a `*_volume` database) seeded two volume tiers into `ohmypos_volume` — T1 (12 months, ~131K sales) and T2 (36 months, ~395K sales / ~986K `sale_items` / ~1.8M `stock_movements`, roughly 3x current actual business scale). All 7 report/inventory endpoints measured at T2 across 3 ranges with `EXPLAIN (ANALYZE, BUFFERS)`. **Verdict: HOLD** for all five Dashboard-3 report endpoints (worst case 720ms p95 at a one-year range; every one-month query resolves via an index, no sequential scan) — ADR-008 re-affirmed with the 2026-08-22 measurement. `GET /inventory/summary`'s own stricter, unbounded-scan-driven budget **did** fire (768ms p95, `Seq Scan on stock_movements`) — re-flagged in `DEBT-013`, not escalated to a schema change (no approval sought or needed, since no action was proposed).
  - **Workstream D:** Renumbered 8 duplicate Tech Debt Log IDs (each with an `> **ID note:**` line), closed 6 entries (`DEBT-033`, `DEBT-020`, `DEBT-023`, `DEBT-019`, `DEBT-022`, the tax/discount portion of `DEBT-004`, split into new `DEBT-044`), re-flagged ~28 entries with dated evidence, added `DEBT-045` (WIB/UTC split, resolved via ADR-023) and `DEBT-046` (pnpm audit `continue-on-error`). `DEBT-024` (Export→download browser verification) was attempted with a connected Claude-in-Chrome session but could not be completed — see Handoff notes.
  - **Workstream E:** Added `HealthModule` (`GET /health` via `@nestjs/terminus` + `PrismaHealthIndicator`), `MetricsModule` (`GET /metrics` via `prom-client` — sale-created counter, sale-duration histogram, stock-conflict counter, default process metrics), graceful shutdown (`app.enableShutdownHooks()`, guarded double-shutdown handling with a force-exit timeout), Docker `HEALTHCHECK` + `depends_on: condition: service_healthy` in `docker-compose.yml`, and fixed a real PII leak (the PDF-import unlock password was logged in plaintext via the request URL — pino's `req` serializer now redacts the `password` query param specifically, via `wrapRequestSerializer` rather than replacing the serializer outright).
  - **Documentation:** `ERR-020` (this task's WIB/UTC finding), `ADR-023` (new), `ADR-008`'s re-affirmation note, `System_Design.md` §11 updated with the T2 numbers, `Tech_Debt_Log.md` `DEBT-001`/`DEBT-013` measurement tables (replacing the Phase 7 fixture-scale numbers, not appending to them).
- **Decisions made during this task:** `Period.periodMonthDate` as a second, deliberately-UTC field alongside `periodStart`/`periodEnd` (ADR-023 §Decision 2) — the pragmatic fix once a straight WIB write was measured to orphan existing rows, rather than a data migration. Chunked-burst concurrency testing (`settleAllChunked`, windows of 20) adopted for B2 after confirming via bisection that this local dev machine (not the server under test) cannot sustain 40–50 truly-simultaneous new connections — attributed correctly as an environment limitation, not a product defect, and not "fixed" by any application code change.
- **Status:** Done, with one open item (see Handoff notes).
- **Handoff notes:** `DEBT-024` (Export button → file-download browser verification) is **not** closed. A Claude-in-Chrome session was connected and login was attempted repeatedly against both `next dev` and a `next build && node .next/standalone/apps/web/server.js` production server; every attempt failed with "Failed to fetch." **Correction (2026-08-22, same day):** this was initially misdiagnosed as the browser-automation extension's own sandboxing (the reasoning at the time: `curl` to the same endpoint succeeded instantly and consistently, so the app must be fine — see the now-superseded reasoning in `DEBT-024`'s prior note). That theory was wrong. The user hit the identical "Failed to fetch" independently in their own normal browser shortly after this task closed, which is what forced a second look — `curl` never runs a CORS preflight, so it could never have caught this class of bug. **Real root cause:** `apps/api/src/main.ts`'s `enableCors({ allowedHeaders: [...] })` listed only `Content-Type` and `Authorization`, never `x-correlation-id`, the header `apps/web/lib/api.ts`'s `doFetch` has sent on every request since this same task's E-8 change. Every real browser (Claude-in-Chrome's tab included — not a sandboxing artifact after all) correctly blocked the request at the CORS preflight stage. Fixed by adding `'x-correlation-id'` to `allowedHeaders`, verified via a manual `curl -X OPTIONS` preflight simulation; full writeup in `ERR-021`. Login itself is now confirmed working, but `DEBT-024`'s actual ask — a live click-through of all 8 Export buttons confirming `.xlsx` downloads — still has not been performed and remains Open. Also unfinished: the plan's Definition of Done calls for a single combined `pnpm turbo run lint typecheck test build` run as the final gate — this was run twice (`/tmp/quality-gate.log`, `/tmp/quality-gate2.log`), the first catching a real stale-assertion regression in `apps/api/src/modules/inventory/period.spec.ts` (still expected pre-ADR-023 UTC boundaries), the second fully green (15/15 tasks) after the fix.

### TASK-064 — Set Explicit `tsconfigRootDir` for `apps/web` ESLint Parser Options

- **Date:** 2026-08-21
- **Module / Phase:** ESLint Configuration (`apps/web/eslint.config.mjs`)
- **Objective:** Fix ESLint parsing error: "No tsconfigRootDir was set, and multiple candidate TSConfigRootDirs are present" in `apps/web`.
- **Relevant docs:** `packages/config/eslint/base.mjs`, `@typescript-eslint` documentation
- **What was done:**
  - `apps/web/eslint.config.mjs`: Explicitly defined `languageOptions.parserOptions.tsconfigRootDir = import.meta.dirname` in the flat config array.
  - Ran `turbo run lint typecheck test` (all 13 tasks passed cleanly).
- **Status:** Done.
- **Handoff notes:** VS Code / IDE ESLint language server in `apps/web` now properly resolves TypeScript type checking without ambiguity across monorepo packages.

### TASK-063 — Fix Mobile Dark Mode Toggle in Topbar & Enable Dark Mode on Shared Routes

- **Date:** 2026-08-21
- **Module / Phase:** Topbar (`apps/web/components/shell/Topbar.tsx`), Shared Layout (`apps/web/app/(shared)/layout.tsx`)
- **Objective:** Fix mobile dark mode button not rendering due to desktop-only wrapper container, and enable dark mode support on shared routes (including `/profile` Pengaturan).
- **Relevant docs:** `docs/DESIGN.md` §15, §16, §17
- **What was done:**
  - `apps/web/components/shell/Topbar.tsx`: Moved the mobile theme toggle button outside of `hidden md:flex` wrapper to ensure it renders on mobile devices.
  - `apps/web/app/(shared)/layout.tsx`: Passed `enableDarkMode` and `initialTheme={initialTheme}` to `AppShell` so `/profile` (Pengaturan) and other shared pages follow the active dark mode theme.
  - Ran `turbo run lint typecheck test --filter=web` (all 4 tasks passed, 328 tests green).
- **Status:** Done.
- **Handoff notes:** The theme toggle is visible in mobile viewports, and navigating to `/profile` now renders with dark surfaces when dark mode is enabled.

### TASK-062 — Add Dark Mode Toggle Button to POS Screen and Mobile Topbar

- **Date:** 2026-08-21
- **Module / Phase:** POS Screen (`apps/web/components/pos/PosPageHeader.tsx`), Shell (`apps/web/components/shell/Topbar.tsx`, `AppShell.tsx`, `apps/web/lib/theme-context.tsx`)
- **Objective:** Add dark mode toggle button to the POS sales header (`PosPageHeader`) on desktop and mobile topbar, powered by a shared React theme context.
- **Relevant docs:** `docs/DESIGN.md` §18, §23
- **What was done:**
  - Added `apps/web/lib/theme-context.tsx` (`ThemeProvider`, `useTheme()`) and wrapped `AppShell`.
  - Added theme toggle button beside the product search bar in `PosPageHeader.tsx`.
  - Added mobile theme toggle button in `Topbar.tsx` for POS/default responsive views.
  - Updated tests in `Topbar.test.tsx`.
  - Ran `turbo run lint typecheck test --filter=web` (all 4 tasks passed, 328 tests green).
- **Status:** Done.
- **Handoff notes:** Cashiers and owners can now toggle dark mode directly on `/sales` on desktop and mobile.

### TASK-061 — Standardize Shadcn Dark Mode Support with `.dark` CSS Selector

- **Date:** 2026-08-21
- **Module / Phase:** UI Theme Tokens (`packages/ui/src/styles/globals.css`, `apps/web/components/shell/AppShell.tsx`)
- **Objective:** Adopt standard shadcn dark mode pattern (`.dark` class selector alongside `[data-theme='dark']`) across the app shell and UI design tokens.
- **Relevant docs:** `docs/DESIGN.md` §6.6, Shadcn Dark Mode Conventions
- **What was done:**
  - `packages/ui/src/styles/globals.css`: Extended dark theme selector to `.dark, [data-theme='dark']`.
  - `apps/web/components/shell/AppShell.tsx`: Added conditional `.dark` class to shell wrapper when dark mode is enabled and active.
  - Ran `turbo run lint typecheck test --filter=web --filter=@ohmypos/ui` (all 7 tasks passed, 328 tests green).
- **Status:** Done.
- **Handoff notes:** Components using standard shadcn `dark:` variants or CSS variable tokens now seamlessly activate via both `.dark` and `[data-theme='dark']`.

### TASK-060 — Enable Dark Mode Support on POS Sales Route

- **Date:** 2026-08-21
- **Module / Phase:** POS Layout (`apps/web/app/(pos)/layout.tsx`)
- **Objective:** Enable dark mode on POS sales route (`(pos)/*`) so that when the theme preference is dark, POS layouts and screens follow the dark theme styling.
- **Relevant docs:** `docs/DESIGN.md` §15, ADR-011
- **What was done:**
  - `apps/web/app/(pos)/layout.tsx`: Passed `enableDarkMode` and `initialTheme={initialTheme}` to `AppShell`.
  - Ran `turbo run lint typecheck test --filter=web` (all 4 tasks passed, 328 tests green).
- **Status:** Done.
- **Handoff notes:** POS routes (`/sales`, `/sales/history`) now respect dark mode (`data-theme="dark"`).

### TASK-059 — Fix Dark Mode Theme Overrides for Shadcn Sidebar Tokens

- **Date:** 2026-08-21
- **Module / Phase:** UI Design Tokens (`packages/ui/src/styles/globals.css`)
- **Objective:** Fix sidebar staying light in dark mode by adding explicit `--color-sidebar-*` token overrides inside the `[data-theme='dark']` CSS block.
- **Relevant docs:** `docs/DESIGN.md` §8.2, §16
- **What was done:**
  - `packages/ui/src/styles/globals.css`: Added explicit dark overrides for `--color-sidebar`, `--color-sidebar-foreground`, `--color-sidebar-primary`, `--color-sidebar-primary-foreground`, `--color-sidebar-accent`, `--color-sidebar-accent-foreground`, `--color-sidebar-border`, and `--color-sidebar-ring` inside `[data-theme='dark']`.
  - Ran `turbo run lint typecheck test --filter=web --filter=@ohmypos/ui` (all 7 tasks passed, 328 tests green).
- **Status:** Done.
- **Handoff notes:** When toggling dark mode in back-office routes (`data-theme="dark"`), sidebar elements now re-theme to Obsidian dark surfaces (`#1a1e26`) with gold accents.

### TASK-058 — Fix Opening Stock Invalidation, Input Formatting, & Active Sidebar Theme

- **Date:** 2026-08-21
- **Module / Phase:** Inventory module (`apps/web/components/inventory`, `apps/web/hooks/useInventory.ts`), UI tokens (`packages/ui/src/styles/globals.css`)
- **Objective:** Fix three frontend UI/UX issues: (1) Ensure opening stock submission automatically invalidates and refreshes the "Ringkasan Pergerakan Stok" table query, (2) update active navigation link text color in the sidebar to `text-text-gold`, and (3) clean up opening stock worksheet quantity input formatting to avoid unwanted default zeros / `.0000` decimals and display clean placeholder values.
- **Relevant docs:** PRD §5.5, §5.6, `docs/DESIGN.md` §8.2, §16.
- **What was done:**
  - `apps/web/hooks/useInventory.ts`: Added `queryClient.invalidateQueries({ queryKey: INVENTORY_QUERY_KEYS.inventorySummary(variables.periodMonth) })` to `useUpsertOpeningStock` onSuccess callback.
  - `packages/ui/src/styles/globals.css`: Updated `--color-sidebar-accent-foreground` from `var(--color-text-primary)` to `var(--color-text-gold)`.
  - `apps/web/components/inventory/OpeningStockWorksheetTable.tsx`: Reset default quantity to empty string (`''`) when undeclared; formatted declared quantities and carry forward placeholders with `formatQuantity(...)` (trimming trailing zeros like `.0000`).
  - `apps/web/components/inventory/InventorySummaryTable.tsx`: Ensured all summary table quantities use `formatQuantity(...)` consistently.
  - Unit tests updated and verified in `useInventory.test.ts`, `OpeningStockWorksheetTable.test.tsx`, and `InventorySummaryTable.test.tsx`.
  - Monorepo checks verified clean: `pnpm turbo run lint typecheck test` (13/13 tasks passed).
- **Status:** Done.
- **Handoff notes:** When users record opening stock, both the worksheet and summary tabs reflect current formatted figures immediately without requiring page refresh.

### TASK-057 — Upgrade PDF Parser to pdfjs-dist & Add PDF Password Support

- **Date:** 2026-08-21
- **Module / Phase:** Import module (`apps/api/src/modules/import`), `packages/api-contracts`, reconciliation UI (`apps/web/components/reconciliation`, `apps/web/hooks/useReconciliation.ts`)
- **Objective:** Replace outdated `pdf-parse@1.1.4` (which failed on modern PDF xref streams, Chrome Print to PDF output, and uncompressed PDF test fixtures) with modern `pdfjs-dist@^3.11.174` (legacy build for Node CJS runtime) and add optional password decryption support across API contracts, NestJS import controller/service, and web reconciliation import card.
- **Relevant docs:** ADR-022, DEBT-031, DEBT-032.
- **What was done:**
  - `apps/api/package.json`: Replaced `pdf-parse@1.1.4` with `pdfjs-dist@^3.11.174`. Removed legacy `.d.ts` override.
  - `packages/api-contracts/src/bank-transaction.schema.ts`: Added `ImportPdfQuerySchema` (`format`, optional `password`).
  - `apps/api/src/modules/import/interfaces/bank-parser.interface.ts`: Updated `BankParser.parse(fileBuffer, options?: { password?: string })`.
  - `apps/api/src/modules/import/parsers/pdf-text.util.ts`: Rewrote PDF text & geometry extraction using `pdfjsLib.getDocument({ data, password, isEvalSupported: false, useSystemFonts: true, disableFontFace: true })`. Maintained strict error mapping for password-protected & corrupted files.
  - `apps/api/src/modules/import/parsers/mandiri-pdf.parser.ts`: Forwarded `options?: { password?: string }` to `extractPdfPages`.
  - `apps/api/src/modules/import/import.controller.ts` & `import.service.ts`: Extended `POST /import/pdf/:accountId` with optional query param `password`.
  - `apps/web/components/reconciliation/BankStatementImportCard.tsx` & `useReconciliation.ts`: Added optional password input field when PDF format is selected; forwarded password to API query string.
  - Unit tests: Added `pdf-text.util.spec.ts` testing valid synthetic PDF extraction with exact coordinates & invalid PDF rejection. Updated `BankStatementImportCard.test.tsx` for password flow.
  - Full suite verified: `pnpm run check` (`turbo run lint typecheck test`) passing cleanly across all workspaces.
- **Status:** Done.

### TASK-056 — Import bank statements from Mandiri PDF e-statements, alongside CSV

- **Date:** 2026-08-21
- **Module / Phase:** Import module (`apps/api/src/modules/import`), `packages/api-contracts`, reconciliation UI (`apps/web/components/reconciliation`, `apps/web/hooks/useReconciliation.ts`)
- **Objective:** The bank delivers mutasi rekening as PDF e-statements, so users had to convert to CSV before reconciling. Add PDF import while keeping CSV working. Scope confirmed with the user as **Mandiri only**.
- **Relevant docs:** **ADR-022** (written by this task), PRD §5.7/§7/§10, System Design §4/§6.5, ADR-010 (contracts are the source of truth), ADR-011 (import stays ADMIN/OWNER).
- **What was done:** Added `pdf-parse@1.1.4` to `apps/api`. New files: `parsers/pdf-text.util.ts` (custom `pagerender` + `%PDF-` signature check + password/corrupt-file error mapping), `parsers/mandiri-pdf.parser.ts`, `parsers/pdf-parse.d.ts` (local subpath types, avoids a second dependency), `parsers/mandiri-pdf.parser.spec.ts` (11 cases). Added `POST /import/pdf/:accountId` beside the CSV route; renamed `ImportService.importCsv` → `importStatement`; added `MANDIRI_PDF` to `BankParserFactory`. Added `BankImportFormatSchema` + `BANK_IMPORT_FORMATS` to `bank-transaction.schema.ts` and drove the web format picker, file `accept`, and upload route from it. Added three e2e cases (`concurrency`, `auth-rbac`). Added `docs/e-statement/` to `.gitignore`. No schema/migration change.
- **Decisions made during this task:** All the substantive ones are in ADR-022. Two worth repeating because they are easy to undo by accident: (1) **the row `No` is excluded from `dedupHash`** — it restarts at 1 per statement, so including it would double-import on an overlapping period; (2) **file type is detected by `%PDF-` signature, never mimetype** — Nest's `FileTypeValidator` was tried first and rejected legitimate CSV uploads in our own e2e suite, because the multipart mimetype is client-supplied. Also: parsing is done by **column x-position**, not line regex, because `pdf-parse`'s default renderer joins runs with no separator and splits lines on exact float equality of the baseline.
- **Status:** Done
- **Handoff notes:** Verified against the user's real 6-page, 57-transaction statement: all 57 rows parsed and the amounts reconcile exactly from the opening balance to the stated closing balance. That file is a personal financial record and is **git-ignored** — do not commit anything from `docs/e-statement/`. Consequently there is **no e2e test that parses a real PDF**; an attempt to hand-generate a fixture PDF failed because the pdf.js bundled in `pdf-parse@1.1.4` rejects hand-written xref tables ("bad XRef entry"), even a spec-canonical one. If you want that coverage, use a real PDF-writing library rather than reviving the hand-rolled generator. Two known gaps: **`docs/e-statement/mutasi bca.pdf` is actually a Bank Sultra statement**, not BCA — its layout is fully documented in ADR-022's context and is unimplemented; and **password-protected PDFs are rejected**, since `pdf-parse` has no password support (`pdfjs-dist`/`unpdf` would, but are ESM-only against this CJS build). Unrelated pre-existing breakage found while running the suite: `allocation-sum.e2e-spec.ts` and `reconciliation-addendum.e2e-spec.ts` fail in `resetDatabase()` with `devices_branch_id_fkey`, because no e2e spec deletes `Device` rows before `branch.deleteMany()`. Not caused by this task and left untouched (scope) — see Tech Debt log.

### TASK-055 — Daily "Laba Bersih" alongside Omset on the dashboard trend chart

- **Date:** 2026-08-21
- **Module / Phase:** Reports module (`apps/api/src/modules/reports`), `packages/api-contracts`, dashboard (`apps/web/components/dashboard`, `apps/web/components/reports`)
- **Objective:** Show both Omset (gross/"kotor") and Laba Bersih (net profit/"bersih") on the dashboard's "Tren Pendapatan Harian" chart, per user request. Clarified via `AskUserQuestion` that "bersih" means the same `netProfit` already computed period-level in `ProfitLossResponse` (Omset − COGS − Operating Expenses), just not previously computed per day — **not** a gross/net split of revenue itself, which ADR-015 explicitly designed out of this schema (no discount/tax/refund columns).
- **Relevant docs:** ADR-005 (HPP snapshot at sale time), ADR-015 (no gross/net revenue split — confirms this task is about profit, not revenue), ADR-017/018 (P&L definitions, WIB day bucketing), `docs/DESIGN.md` (unchanged by this task).
- **What was done:**
  - **`apps/api/src/modules/reports/report-filters.ts`**: added `wibDayOfSoldAt()`, a sibling to the existing `wibDayOfEntryDate()` but bucketing on `sales.sold_at` instead of `ledger_entries.entry_date` — needed because COGS must be grouped by the day a sale happened, not a ledger day.
  - **`apps/api/src/modules/reports/reports.service.ts`, `dailyIncome()`**: now runs three parallel raw-SQL aggregates instead of one — the existing income-per-day query, a new COGS-per-day query (`sale_items` joined to `sales`, grouped by `wibDayOfSoldAt()`), and a new operating-expenses-per-day query (`ledger_entries` OUTFLOW `source_type='MANUAL'`, grouped by `wibDayOfEntryDate()`) — mirroring `profitLoss()`'s existing `Promise.all` two-query pattern. Merges the three result sets **over the union of every day-key appearing in any of them**, not just income's days — a day with a `MANUAL` expense but zero sales would otherwise silently lose that expense from `netProfit` if only income-days were iterated (a real edge case, not hypothetical — caught during planning, not after a bug report).
  - **`apps/api/src/modules/reports/reports.mapper.ts`**: `toDailyIncomeResponse` now computes `netProfit = income − cogs − operatingExpenses` per bucket (same formula as `toProfitLossResponse`'s period-level `netProfit`) and returns `cogs`/`netProfit` per row.
  - **`apps/api/src/modules/reports/report-math.ts`**: `DailyIncomeBucket` gained `cogs`/`operatingExpenses` fields; `fillDailyGaps`'s zero-default bucket updated to match.
  - **`packages/api-contracts/src/report.schema.ts`**: `DailyIncomeRowSchema` gained `cogs: MoneyString` and `netProfit: SignedMoneyString` (a day can run at a loss).
  - **Unrelated pre-existing bug found and fixed while touching the chart code**: `apps/web/components/reports/ReportChart.tsx`'s `ReportBarChart`/`ReportLineChart` both hardcoded `fill`/`stroke` as `` `var(--color-${key})` `` — reconstructing a CSS variable name from the data key instead of using the actual `color` value already accepted as a prop. Confirmed via `grep` that every existing caller's key (`'value'`, `'total'`, `'income'`) doesn't match a real design token, so **none of these charts were rendering their intended color** before this fix — `IncomeByPaymentMethodView.tsx` even passed an explicit `color: 'var(--color-accent-inflow)'` that was silently ignored. Fixed both components to use the resolved `color` (explicit or from the `CHART_COLORS` fallback array) directly. This had to be fixed as part of this task regardless, since the new second line would have inherited the same bug.
  - **`apps/web/components/reports/ReportChart.tsx`**: `ReportLineChart` changed from a single `yKey`/`label`/`color` prop set to a `lines: {key,label,color}[]` array, mirroring `ReportBarChart`'s existing `bars` shape — renders one `<Line>` per entry.
  - **`apps/web/components/dashboard/DashboardClient.tsx`**: `dailyIncomeChartData` now also maps `netProfit`; the chart call passes two lines — Omset (`--color-brand-primary`, unchanged default) and Laba Bersih (`--color-accent-inflow`, green — reusing this app's existing "positive money" convention rather than a new token).
  - **`apps/web/components/reports/DailyIncomeView.tsx`** (the `/reports/daily` detail page, a second consumer of `ReportLineChart`): migrated to the new `lines` prop shape with a single entry — content unchanged, dashboard-only ask.
  - Tests: extended `report-math.spec.ts` (`fillDailyGaps` new fields) and `report-filters.spec.ts` (new `wibDayOfSoldAt` case); updated `DailyIncomeView.test.tsx`'s fixture rows to the new schema shape; extended `apps/api/test/reports.e2e-spec.ts`'s Case 21 (WIB-day-bucketing test) with the correct `cogs`/`netProfit` values for its fixture data, and added Case 22 asserting `netProfit` against independently-known fixture values (branch A's 2025-03-15 sale: 1×Kopi + 3×Teh = 11000.00 COGS, matching an existing period-level assertion elsewhere in the same suite) rather than a self-referential formula check.
  - **A real assumption error caught by the e2e suite, not by inspection**: Case 21's expected COGS was first written as `0.00` on the assumption its fixture used plain `postLedgerEntry` calls; running the e2e suite immediately failed and revealed the fixture actually uses `postSale` (1× Snack, hpp 2000.00) — corrected to the real expected values (`cogs: '2000.00'`, `netProfit: '3000.00'`) after reading the actual fixture setup. Left in this log because it's a concrete example of why the e2e suite was run rather than trusting a plan-time assumption.
  - Ran `turbo run lint typecheck test build` for `api`, `@ohmypos/api-contracts`, and `web`: all green (api unit: 152/152, web: 326/326). Additionally ran the reports e2e suite directly against the compose Postgres (`pnpm test:e2e -- reports.e2e-spec`, port 5433, confirmed reachable): 58/58 passing, including the two updated/added daily-income cases.
- **Decisions made during this task:** (1) Three parallel grouped SQL aggregates merged in TypeScript, not a single mega-join or an N+1 per-day loop — matches this file's own documented principle ("Aggregation happens in Postgres, not in Node") and the existing `profitLoss()` two-query pattern. (2) Did not create a second endpoint (`/reports/daily-profit`) — would have duplicated range-resolution/gap-filling logic and added a second round trip for what's conceptually one per-day report. (3) Fixed the `ReportChart.tsx` color bug in the same change rather than filing it separately, since the new second line would have silently inherited it.
- **Status:** Done.
- **Handoff notes:** No live browser verification was possible this session (Chrome extension not connected, checked again at the end of this task) — the reports e2e suite (which exercises the real endpoint against a real Postgres, not just unit-level mocks) is what backs correctness here, not just `lint`/`typecheck`/`test`/`build`. Still worth a manual look at `/dashboard` to confirm the two lines render distinguishably and the tooltip/legend name both series correctly, and a look at `/reports/daily` to confirm its single-line chart is visually unchanged after the prop-shape migration.

### TASK-054 — Adopt shadcn/ui's Sidebar component

- **Date:** 2026-08-21
- **Module / Phase:** Shell (`apps/web/components/shell`, `packages/ui`), follow-up to TASK-053
- **Objective:** Replace the hand-built app-shell sidebar (three separate hand-maintained render paths — desktop expanded, tablet icon-rail, and a fully independent mobile copy in `MobileNavDrawer.tsx`) with shadcn/ui's official `Sidebar` component family, per explicit user request ("gunakan komponen sidebar shadcn"). Not a redesign of nav content/IA.
- **Relevant docs:** DESIGN.md §8.2 (sidebar visual spec — outcome-only, doesn't mandate an implementation). Plan approved via Claude Code Plan Mode (3 options: full primitive adoption [chosen], shell/chrome-only adoption [rejected — doesn't remove the desktop/rail duplication], cosmetic token rename only [rejected — doesn't use the actual component]).
- **What was done:**
  - New `packages/ui/src/components/ui/sidebar.tsx` — a from-scratch port of shadcn's Sidebar primitive family (`SidebarProvider`, `Sidebar`, `SidebarHeader`/`Content`/`Footer`, `SidebarGroup*`, `SidebarMenu*` incl. `SidebarMenuButton`'s built-in collapsed-state tooltip, `SidebarMenuSub*`, `SidebarInput`, `SidebarSeparator`, `SidebarTrigger`, `SidebarInset`, `useSidebar`), no new npm dependency (every primitive it needs — `Sheet`, `Tooltip`, `Separator`, `Skeleton`, `Input`, `Button` — already existed in `packages/ui`, already portal-patched from TASK-053's dark-mode work). Three deliberate deviations from stock, all because this repo's rail/expanded switch is breakpoint-forced, never a user preference: `isMobile` is a required prop instead of an internal breakpoint hook (reuses `apps/web/hooks/useMediaQuery.ts`'s existing `useIsRail`/`useIsMobile` as the single source of truth); `open` is always controlled with no cookie-persistence write; no desktop `SidebarTrigger`/`SidebarRail` rendered and the stock Cmd/Ctrl+B shortcut was dropped entirely (it would silently do nothing since desktop collapse isn't user-togglable in this pass). Also pruned `SidebarRail`, `SidebarMenuAction`, `SidebarGroupAction`, and `toggleSidebar`/`setOpen` from the exported surface — they'd have been dead/inert exports with nothing calling them, which didn't sit right against how carefully unused code has been avoided elsewhere this session; can be added back if a future task actually needs user-togglable desktop collapse.
  - `packages/ui/src/styles/globals.css`: added 8 new `--color-sidebar-*` tokens as `var()` aliases onto existing tokens (not new hex), e.g. `--color-sidebar-accent: var(--color-surface-strong)`. Because they're `var()` indirections, back-office dark mode's `[data-theme='dark']` block re-resolves them automatically — no separate dark-mode entries needed for the sidebar tokens.
  - `apps/web/components/shell/Sidebar.tsx` — full rebuild on the new primitives. One JSX tree now serves all three responsive states instead of three: `ExpandedNavItem`/`ExpandedNavGroup` (desktop ≥1024px, driven by `Collapsible`+`SidebarMenuSub`, shadcn's own documented composition) also serve mobile (rendered inside `SidebarProvider`'s own Sheet when `isMobile` is true — no separate mobile component needed anymore); `RailNavItem` (768–1023px) keeps the existing `Popover`-based flyout for nested groups (deliberately not switched to `DropdownMenu` — these are a positioned link list, not a command menu, and swapping would add untested keyboard semantics for no requested benefit) and gets leaf tooltips for free from `SidebarMenuButton`'s built-in `tooltip` prop. `state`/`isMobile` come from `useSidebar()`; `AppShell` supplies `open`/`isMobile`.
  - `apps/web/components/shell/AppShell.tsx`: wraps children in `SidebarProvider` (inside the existing `PortalContainerContext.Provider`, so dark-mode-themed popups keep working), fed `open={!useIsRail()}` and `isMobile={useIsMobile()}`. Deleted `mobileNavOpen` state and the `onOpenMobileNav`/`onClose` prop-drilling entirely. Deliberately did **not** adopt `SidebarInset` for the main content wrapper — POS's `h-dvh overflow-hidden` single-viewport requirement (three-zone layout) is hand-tuned, and re-verifying it against `SidebarInset`'s own sizing assumptions was judged an unnecessary regression risk for a component-swap task.
  - `apps/web/components/shell/Topbar.tsx`: mobile hamburger's `onClick` now calls `useSidebar().setOpenMobile(true)` directly instead of an `onOpenMobileNav` prop threaded from `AppShell` — same "always opens, never toggles" semantic as before (closing still happens via link click or overlay/Escape inside the Sheet).
  - **Retired `apps/web/components/shell/MobileNavDrawer.tsx` and `LogoutButton.tsx`** (deleted both files) — `MobileNavDrawer` was the third hand-maintained copy of the nav tree and the actual source of this session's earlier drift bug (a nested-active-link style fix had to be applied to two files by hand); `Sidebar`'s own mobile Sheet rendering replaces it structurally, so the two trees can no longer drift. `LogoutButton.tsx` had no remaining call sites once `MobileNavDrawer` was gone (confirmed via `grep` before deleting); its one behavior worth keeping — a `role="alert"` message on failed logout, which the `Sidebar.tsx` inline logout action previously swallowed silently — was folded into the new unified footer logout action as a small opportunistic fix.
  - `apps/web/components/shell/Sidebar.test.tsx` and `Topbar.test.tsx` reworked (not just passthrough): both now wrap in a `SidebarProvider` (a `renderSidebar`/`renderTopbar` helper, since `Sidebar`/`Topbar` call `useSidebar()` and throw without a provider ancestor — matching real usage, `Topbar` is never rendered outside `AppShell`'s `SidebarProvider` in production either). `setViewport()`/`matchMedia` mocking was removed from `Sidebar.test.tsx` — no longer needed since rail/mobile state is now passed as explicit `isRail`/`isMobile` params to the render helper rather than derived from a hook inside the component under test. Active-row class assertions updated from the literal string `bg-surface-strong` to `bg-sidebar-accent` (same computed color via the new token alias, different class name on the DOM node). Added one new test case (`Sidebar — mobile (<768px)`) asserting the mobile Sheet renders the same active-state styling as desktop — this is the specific regression class (mobile vs. desktop drift) the migration was meant to structurally prevent, and no equivalent test existed before since mobile only lived in the now-deleted `MobileNavDrawer`, which had no test file of its own.
  - Ran `turbo run lint typecheck test build` for both `web` and `@ohmypos/ui`: all green — 49 test files / 326 tests pass (312 pre-existing + 4 dark-mode + 10 reworked/added sidebar), production build succeeds.
- **Decisions made during this task:** (1) Pruned several stock shadcn exports (`SidebarRail`, `SidebarMenuAction`, `SidebarGroupAction`, `toggleSidebar`) rather than porting them "for future use" as the approved plan suggested — flagged above, a deliberate deviation from the literal plan text in favor of not shipping dead code, consistent with this session's general practice. (2) Kept `Popover` (not `DropdownMenu`) for the rail's nested-group flyout — already-styled, already-accessible, and switching primitives for a positioned link list would add new keyboard-nav semantics nobody asked for. (3) `SidebarInset` was evaluated and explicitly not adopted, to avoid re-deriving POS's exact-one-viewport sizing contract against a different primitive's assumptions.
- **Status:** Done.
- **Handoff notes:** No live browser verification was possible this session (Chrome extension not connected, checked at both the start and end of this task) — `lint`/`typecheck`/`test`/`build` all green is what backs this entry. Before calling this fully shipped, still owed: (1) the manual checklist from the plan (desktop/rail/mobile visual+keyboard check at each breakpoint, back-office dark-mode toggle confirming the sidebar and its `Popover`/`Tooltip`/Sheet popups all re-theme via the new `--color-sidebar-*` var() aliases and stay portaled inside the `data-theme` subtree, POS route still exactly one viewport tall with only `<main>` scrolling); (2) `apps/web/components/shell/Topbar.tsx`'s mobile-width logo still references the old `/logo.png` while `Sidebar.tsx` uses `/logo-rm-bg.png` — a pre-existing drift from before this task (not touched, out of scope for a component-swap task, but worth a follow-up pass); (3) `docs/plannings/ui-revamp-phase-5-premium-tokens.md` is still stale/superseded (flagged in TASK-052, still not addressed).

### TASK-053 — Dark mode for back-office only

- **Date:** 2026-08-21
- **Module / Phase:** Shell theming (`apps/web/components/shell`, `packages/ui`), follow-up to TASK-052
- **Objective:** Add a dark theme for night-shift back-office staff (ADMIN/OWNER), scoped so it can never apply to POS (well-lit retail counters) or the `(shared)` route group (profile/help/leave-requests — reachable by KASIR). User explicitly asked for back-office only.
- **Relevant docs:** `docs/DESIGN.md` §6.6 (new — dark token values), System Design §5 (role/route scoping). Plan approved via Claude Code Plan Mode before implementation, per AGENTS.md's plan-before-code + 3-option requirement (options: scoped `data-theme` CSS-variable theme [chosen], `next-themes` + per-component `dark:` classes [rejected — new dependency, reintroduces the exact dead-`dark:`-class pattern removed in TASK-052], fully duplicated dark shell components [rejected — doubles shell maintenance forever]).
- **What was done:**
  - New `apps/web/lib/theme.ts` (`Theme` type, `THEME_COOKIE_NAME`, `isTheme` guard) and `apps/web/lib/theme-client.ts` (`persistThemeCookie` — plain `document.cookie` write, non-HttpOnly, no sensitive data). `apps/web/lib/session.ts` gained `getInitialTheme()` next to the existing `requireRole`, reusing its already-imported `cookies()` pattern for a server-side, FOUC-free initial read.
  - **Portal-container fix** (the non-obvious part): Radix `Sheet`/`Dialog`/`Popover`/`DropdownMenu`/`Select`/`Tooltip` all mount into `document.body` by default, outside any `data-theme` scope on the shell. Without a fix, every dropdown/dialog/popover/tooltip and the mobile nav drawer itself (built on `Sheet`) would have stayed light even in a dark back-office — not a corner case, it's most of the interactive surface (28+ back-office files use these primitives). Added `packages/ui/src/lib/portal-container.ts` (`PortalContainerContext`, default `null`, `usePortalContainer()`), and patched all 6 primitives' `*.Portal` call sites to pass `container={usePortalContainer()}`. Default `null` means "fall back to Radix's own `document.body` behavior" — strictly additive, zero change for POS/shared/login, which never provide the context.
  - `apps/web/components/shell/AppShell.tsx`: new `enableDarkMode?: boolean` (default `false`) and `initialTheme?: Theme` (default `'light'`) props; owns `theme` state + `toggleTheme()` (flips + calls `persistThemeCookie`); root wrapper div now uses `ref={setShellEl}` (a `useState<HTMLDivElement | null>`, not `useRef`, so the Provider re-renders once the DOM node exists) and sets `data-theme={enableDarkMode ? theme : undefined}`; wraps its children in `<PortalContainerContext.Provider value={enableDarkMode ? shellEl : null}>`; passes `enableDarkMode`/`theme`/`onToggleTheme` to `Topbar`.
  - `apps/web/app/(back-office)/layout.tsx` is the **only** layout that opts in — reads `getInitialTheme()`, passes `enableDarkMode` (bare, i.e. `true`) + `initialTheme` to `AppShell`. `(pos)/layout.tsx` and `(shared)/layout.tsx` were **not touched at all** — this is the actual scope guarantee: neither ever passes `enableDarkMode`, so `AppShell`'s default applies regardless of what the theme cookie holds in the browser (e.g. an ADMIN who enables dark mode, then clicks into `/profile`, gets a fresh unscoped `AppShell` mount there).
  - `apps/web/components/shell/Topbar.tsx`: new `enableDarkMode?`/`theme?`/`onToggleTheme?` props; a Sun/Moon icon toggle button (`data-testid="topbar-theme-toggle"`, `aria-pressed`, localized `aria-label`) renders inside the existing `variant === 'default'` right-aligned block (restructured that block into a wrapping `<div className="hidden items-center gap-2 md:flex">` so the toggle and the "Semua Cabang" branch-context badge sit side by side), gated on `variant === 'default' && enableDarkMode` — the same shape already used for the branch badge, so it structurally cannot render for POS or shared.
  - `packages/ui/src/styles/globals.css`: added a `[data-theme='dark']` block after `:root`, reusing the existing Obsidian surfaces (`#12151B`/`#1A1E26`) as the base. Full value list and the WCAG reasoning behind each is in `docs/DESIGN.md` §6.6 (added this task) — not repeated here.
  - New `apps/web/components/shell/Topbar.test.tsx` (4 tests, no prior coverage of this file): toggle renders when `enableDarkMode` is true on `variant="default"`, is absent when `enableDarkMode` isn't passed (shared routes) and on `variant="pos"` even if `enableDarkMode` were somehow true, and `aria-pressed`/`aria-label` track the `theme` prop across a rerender.
  - Ran `turbo run lint typecheck test build` (both `web` and `@ohmypos/ui`): all green — 49 test files / 325 tests pass (including the new `Topbar.test.tsx`), production build succeeds.
- **Decisions made during this task:**
  1. **Status/accent color values are a deliberate compromise, not an oversight.** Computed WCAG contrast (relative-luminance formula, not eyeballed) for every candidate: a single status color cannot simultaneously hit 4.5:1 as plain text on the dark surface *and* 4.5:1 as a white-text solid fill (badges/KPI cards) — the two requirements pull in opposite directions. Text usage dominates (122 `text-status-danger` call sites vs. 9 solid `bg-status-danger` fills, per `grep`), so values were picked to clear AA for the text case (`status-danger` #E5484D → 4.67:1 on the base surface) while landing close-but-short for the solid-fill case (white on #E5484D → 3.91:1) — the same shape of trade-off already present and accepted in the light theme (white text on the gold primary button is 2.26:1, computed the same way, pre-existing and out of this task's scope to fix). Financial accents (`accent-inflow`/`accent-outflow`) have zero solid-fill usage in the codebase, so they went straight to the fully legible value (8.02:1 / 6.79:1) with no compromise needed.
  2. **`--color-text-inverse` was deliberately left out of the dark override.** Its only consumer is `packages/ui/src/components/ui/tooltip.tsx`'s `bg-surface-dark` chip, which is a fixed dark surface in *both* themes (not tied to `data-theme`) — overriding `text-inverse` to a dark value for the dark theme would have made tooltip text render dark-on-dark inside back-office dark mode, an invisible-text regression. Caught by checking actual usage (`grep`) before assuming the override was needed, not by inspection alone.
  3. Chose a plain non-HttpOnly cookie over a Server Action for persisting the toggle — the theme change applies instantly via client state, the cookie only needs to be *read* on the next request, and this repo has no existing `'use server'`/Route Handler pattern to extend for something this low-stakes.
- **Status:** Done.
- **Handoff notes:** No live browser verification was possible this session (Chrome extension not connected, both when this task started and when it finished) — automated verification (`lint`/`typecheck`/`test`/`build`, all green) is what backs this entry; the manual checklist below is still owed before calling this fully shipped:
  1. ADMIN/OWNER on `/dashboard` → toggle appears in Topbar (desktop width) next to "Semua Cabang"; toggling flips the whole shell dark, **including** a screen that opens a `Select`/`Dialog`/`Popover` (e.g. `apps/web/app/(back-office)/devices/AddDeviceDialog.tsx`) — this is the direct regression check on the portal-container fix, the part most likely to have a subtle bug if something was missed.
  2. Open `MobileNavDrawer` at a narrow viewport with dark active — confirm it's dark (same portal check, `Sheet`-based).
  3. Client-navigate to `/profile` or `/help` and to `/sales` (as OWNER) — confirm both stay light regardless of the toggle state just set, with no flash.
  4. Hard-reload a back-office page with dark active — confirm it loads dark immediately (FOUC check on `initialTheme`).
  5. Browser devtools contrast checker against the pairs in `docs/DESIGN.md` §6.6, especially the status/accent solid-fill cases flagged in decision (1) above — the computed numbers are believed correct but haven't been eyeballed on an actual rendered screen yet.
  6. `docs/plannings/ui-revamp-phase-5-premium-tokens.md` is still stale/superseded (unrelated to this task, flagged in TASK-052) — not addressed here either.

### TASK-052 — UI Revamp Phase 5: "Quiet Luxury" token rebrand — closeout & consistency pass

- **Date:** 2026-08-21
- **Module / Phase:** UI Revamp Phase 5 (premium/luxury visual direction), supersedes the plan in `docs/plannings/ui-revamp-phase-5-premium-tokens.md`
- **Objective:** Finish and verify a luxury/premium palette rebrand ("Quiet Luxury Outside, High-Precision Engine Inside" — Champagne Gold/Warm Bronze/Obsidian) that had already been substantially started outside this session (uncommitted working-tree changes present at session start: rewritten `docs/DESIGN.md`, rewritten `packages/ui/src/styles/globals.css` token layer, a new brand mark (`logo.png`, `favicon.ico`), and partial edits to `Sidebar.tsx`/`badge.tsx`/`button.tsx`/`layout.tsx`/`login/page.tsx`). This session did **not** author that initial direction — it inherited it, confirmed with the user that it (not the previously-planned sapphire "Ink & Brass" direction) is the one to continue, then closed the remaining gaps.
- **Relevant docs:** `docs/DESIGN.md` (rewritten; now 13 sections instead of the previous 56 — §5 Typography, §6 Color Tokens, §7 Radius/Elevation, §8 Shell/Nav, §13 Anti-Patterns are the ones most load-bearing for this task). `docs/plannings/ui-revamp-phase-5-premium-tokens.md` is now **stale/superseded** — it describes a sapphire "Ink & Brass" direction that was never implemented; the shipped direction is Champagne Gold instead. That planning doc has not been deleted but should not be used as a reference for the current token values.
- **What was done:**
  - Verified `packages/ui/src/styles/globals.css` (already rewritten before this session) matches `docs/DESIGN.md` §6/§7 token-for-token (brand/accent/status/surface/text/border/radius/shadow) — no drift found, no edit needed there.
  - `apps/web/components/shell/Sidebar.tsx`: removed a now-unused `next/image` import (both rail and expanded logo branches had been collapsed to the same plain `<img>` markup, leaving `Image` imported but unused), deduplicated the now-identical rail/expanded logo ternary into one render, and aligned the two nested-nav-group active-link styles (`text-brand-primary` → `text-text-primary`) with the already-updated top-level `ROW_ACTIVE` convention so active state reads consistently at every nav depth.
  - `apps/web/components/shell/Topbar.tsx` and `apps/web/components/shell/MobileNavDrawer.tsx`: swapped their brand mark from the old `/logo.svg` to `/logo.png`, matching the swap already made in `Sidebar.tsx` and `login/page.tsx` — these two files had been missed by the in-progress rebrand and were the only remaining `logo.svg` references outside the (now-orphaned) file itself.
  - Cleaned the 5 pre-existing token-drift files flagged in an earlier session (raw Tailwind palette colors + dead `dark:` classes — this repo has no dark-mode mechanism, so every `dark:` class was inert): `apps/web/components/dashboard/BranchProfitabilityCard.tsx`, `apps/web/app/(shared)/leave-requests/MyLeaveRequests.tsx`, `apps/web/app/(shared)/leave-requests/OwnerReviewQueue.tsx`, `apps/web/app/(back-office)/devices/AttendanceLogTable.tsx`, `apps/web/app/(back-office)/devices/AttendanceCalendarMatrix.tsx`. All raw `emerald-`/`amber-`/`rose-`/`sky-`/`slate-` classes replaced with semantic `--color-status-*` tokens (`status-success`/`status-warning`/`status-danger`, and `status-info` for the one four-way case — attendance's "Cuti/Izin" state — that didn't map to success/warning/danger); the "no data" placeholder dot now uses `border-strong`. All `dark:` variants deleted.
  - Fixed a pre-existing Prettier formatting error in `apps/web/app/layout.tsx` (the already-in-progress `Cormorant_Garamond` font import) that was failing `lint`.
  - Ran `turbo run lint typecheck test --filter=web --filter=@ohmypos/ui`: lint and typecheck clean (only pre-existing, unrelated `react-hooks/incompatible-library` warnings from `react-hook-form`'s `watch()` in three dialogs remain — not touched, out of scope), all 321 web tests pass including `Sidebar.test.tsx` (9 tests, unaffected by the active-style/import edits).
- **Decisions made during this task:** (1) Confirmed with the user via `AskUserQuestion` which in-progress direction to continue — chose "continue the existing Champagne Gold work" over "run the old sapphire plan," since running the old plan would have overwritten real, already-substantially-correct work. (2) Left `QuantityStepper.tsx`'s `rounded-pill` outer control as-is despite `DESIGN.md` §7.1 now explicitly listing "stepper controls" under `radius.sm` — a test (`OrderPanel.test.tsx:35`) asserts `rounded-pill` on that exact element, and changing an established, tested UI pattern to satisfy a doc line felt like scope creep beyond "finish the rebrand"; flagged here instead of silently changed. (3) Did not attempt a full visual redesign pass of POS/back-office surfaces against the new DESIGN.md's §9/§10 (Obsidian order panel option, "count card" category filters, etc.) — those are net-new design decisions requiring visual judgment calls, not bugs in already-started work, and were left out of scope for this closeout task.
- **Status:** Done (closeout of the palette/shell/token-consistency work). Not done: a full POS/back-office visual audit against the new DESIGN.md's more detailed §9/§10 guidance (Obsidian dark order panel, category "count cards" instead of pills, gold product-card accents gated on real data) — flagged as follow-up below, not attempted here.
- **Handoff notes:** No live browser check was possible this session (Chrome extension not connected); relied on `lint`/`typecheck`/`test` (all green) plus pre-existing QA screenshots in `docs/screenshoots/` (captured during the earlier, out-of-session logo work) showing the intended sidebar look already renders correctly. Before the next visual pass: (1) `docs/plannings/ui-revamp-phase-5-premium-tokens.md` should be rewritten or marked superseded — it currently documents token values that were never shipped and will mislead a future reader; (2) DESIGN.md §9.4 raises an Obsidian-dark POS order panel option that `CartPanel.tsx`/`PosOrderSheet.tsx` don't currently implement (they're still light) — worth a deliberate decision with the user rather than assuming; (3) `apps/web/public/logo.svg` and `logo.webp` are now orphaned (nothing references them) and can likely be deleted once confirmed unused elsewhere.

### TASK-051 — OWNER branch-selectable POS access + rename "Transaksi Kasir" → "Transaksi Penjualan"

- **Date:** 2026-08-20
- **Module / Phase:** POS access (`apps/web/app/(pos)/sales`), post UI-revamp
- **Objective:** Let OWNER actually use the POS (previously hard-blocked with a warning whenever `user.branchId` was `null`, even though the nav already linked there), picking which branch a sale is attributed to via a header dropdown. Rename the feature from "Transaksi Kasir" to "Transaksi Penjualan" now that it isn't cashier-exclusive.
- **Relevant docs:** ADR-011 (OWNER is "unscoped, all-branch access" — this task completes that, doesn't violate it), ADR-004 (`Sale.branchId` is attribution-only, not a data-partitioning key), ADR-014/015 (`CentralBranchNotSellableException`).
- **What was done:**
  - Investigated first (two Explore passes): confirmed `POST /sales` already allows `@Roles('KASIR', 'ADMIN', 'OWNER')` and `BranchScopeGuard` already passes OWNER/ADMIN through unscoped — the gap was frontend-only. **No schema, migration, `api-contracts`, or backend guard change was needed or made.**
  - `apps/web/lib/nav-config.ts`: renamed both `{ href: '/sales', label: 'Transaksi Kasir' }` entries (KASIR and OWNER) to `'Transaksi Penjualan'`.
  - `apps/web/app/(pos)/sales/page.tsx`: removed the `!user.branchId && user.role === 'OWNER'` blocking block entirely; now always renders `<PosScreen branchId={user.branchId ?? null} role={user.role} />`. The KASIR block (`!user.branchId && user.role === 'KASIR'`) is untouched.
  - `apps/web/components/pos/PosPageHeader.tsx`: renamed the `<h1>` to "Transaksi Penjualan"; added an optional `branchPicker?: React.ReactNode` slot rendered under the title, `undefined` for KASIR.
  - `apps/web/components/pos/PosScreen.tsx`: `branchId` prop is now `string | null`. Added `selectedBranchId` state seeded from the prop, a `useBranches()` call, a `sellableBranches` filter excluding the seeded central branch (`CENTRAL_BRANCH_NAME = 'Pusat (Dapur Sentral)'`, a new local constant — no shared frontend constant existed), and `needsBranchSelection = role === 'OWNER' && selectedBranchId === null`. When true: header still renders (with the `Select`), but `CategoryFilterRow`/`ProductGrid`/`CartPanel`/`PosOrderSheet` are all replaced by a single placeholder ("Pilih cabang untuk memulai transaksi."). `handleSubmit` now sends `selectedBranchId` and gained a `selectedBranchId === null` guard. OWNER can change the branch at any time, including with cart lines already present — `branchId` is never wired into stock/availability computation, only into the submit payload.
  - Added `apps/web/components/pos/PosScreen.owner-branch.test.tsx` (5 tests, new file — `PosScreen.test.tsx` stays byte-identical, matching the pattern every prior UI-revamp phase used). Updated the two pre-existing hardcoded-label assertions this rename broke: `apps/web/components/shell/Sidebar.test.tsx:99` and both occurrences in `apps/web/lib/nav-config.test.ts`.
- **Decisions made during this task:** (1) UX shape (dropdown-in-header vs. full blocking picker screen vs. persisted pill) was put to the user directly via `AskUserQuestion` with previews — they picked the header-dropdown option; the plan (and this entry) reflects that choice, not an assumption. (2) No persistence (localStorage) across visits — deliberate, matches the chosen UX description and avoids complexity for what's expected to be occasional OWNER use rather than daily cashier use. (3) Central-branch exclusion uses a plain exact-match string constant rather than the existing fragile `.toLowerCase().includes('pusat')` precedent in `BranchProfitabilityCard.tsx` — flagged in the plan, not fixed (out of scope). (4) Did not touch the pre-existing duplicate `useBranches` hook (`hooks/useBranches.ts` vs. a second one inside `hooks/useExpenses.ts`) — used the canonical one, left the duplication as-is (out of scope for this task).
- **Status:** Done
- **Handoff notes:** `turbo run lint typecheck test build` green (15/15 tasks), `PosScreen.test.tsx` unmodified and passing. One test-infra note worth keeping: Radix `Select` sets `pointer-events: none` on `<body>` while its portal is open and clears it asynchronously on close — a `fireEvent.click` fired immediately after picking a `SelectItem` can land before that cleanup runs and silently do nothing. `PosScreen.owner-branch.test.tsx`'s `pickBranch()` helper waits on `document.body.style.pointerEvents` before continuing; reuse that pattern for any future test that both interacts with a `Select` and then immediately clicks something else. Manually verified end-to-end against the running dev server: OWNER login → no more warning block, header shows "Cabang" dropdown, placeholder before picking; picking a branch reveals the grid/cart; central branch never appears as an option; added a product, paid, **switched branch with the item still in cart**, submitted — the sale in `/sales/history` was correctly attributed to the branch selected at submit time (not the one selected when the item was added); logged back in as KASIR and confirmed zero visual/behavioral change (no dropdown, no placeholder, straight to the grid).

### TASK-050 — UI Revamp Phase 4: Responsive Polish, Backoffice Alignment & Accessibility QA

- **Date:** 2026-08-20
- **Module / Phase:** UI Revamp Phase 4 (final phase), per `docs/plannings/ui-revamp-design-alignment.md`
- **Objective:** Close the four remaining responsive/a11y gaps: POS has no mobile bottom sheet below 768px, POS stacks instead of staying side-by-side at 768–1023px (tablet), backoffice tables lose their identifying column on horizontal scroll, and nothing respects `prefers-reduced-motion`.
- **Relevant docs:** DESIGN.md §14 (Motion), §28 (Data Tables), §41.1–§41.6 (Responsive), §42 (Accessibility), §43 (Touch and Pointer), §44 (Component State Rules).
- **What was done:**
  - **Breakpoint fix (§41.1):** `PosScreen.tsx`'s zone wrapper, the product-discovery `<section>`, and its scroll wrapper moved from `lg:` (1024px) to `md:` (768px) — the bug was that Phases 2–3 wrote the tablet/mobile split at `lg`, putting the 768–1023px tablet band on the mobile side of the line and stacking the order panel under the grid instead of keeping both zones side by side per §41.3. `CartPanel.tsx`'s width step-down (`md:w-[320px] lg:w-[360px] xl:w-[380px]`) makes the same move.
  - **Mobile bottom sheet (§41.3):** added `apps/web/components/pos/PosOrderSheet.tsx` — below 768px a collapsed bar (item count + total + "Lihat Pesanan") replaces the in-flow panel; tapping it opens a `Sheet` containing the *same* `CartPanel` instance the wider layouts render (passed as `children`, so there is no second copy to drift). `PosScreen.tsx` now builds `cartPanel` once and conditionally mounts it inline (`!isMobile`) or inside the sheet (`isMobile`), gated by the existing `useIsMobile()` hook. The old always-mounted floating cart bar (with its own `formatCurrency`/`ShoppingBag`/`Button` imports) was deleted.
  - **Sticky identifying column (§41.4):** `apps/web/components/ui/data-table.tsx` — added `stickyFirstColumn` prop (default `true`, since §41.4 is a general backoffice rule, not per-table) and a `stickyCellClass` helper (`sticky left-0`, opaque background, `[tr:hover_&]` variant so the pinned cell tracks row hover) applied to both header and body first cells via `data-sticky`. Takes effect for all 17 `DataTable` consumers automatically through the shared wrapper. Added `data-table.test.tsx` (4 tests: pins by default, doesn't pin other columns, pins the header, can be turned off).
  - **Reduced motion (§14):** appended a `@media (prefers-reduced-motion: reduce)` block to `packages/ui/src/styles/globals.css` — `animation-duration`/`transition-duration: 0.01ms !important` (not `0`, so Radix's animation-end unmount logic still fires) plus `scroll-behavior: auto`.
  - **Two bugs found and fixed during manual verification, not in the plan's literal snippets:**
    1. `PosOrderSheet`'s `SheetHeader`/`SheetTitle` rendered a second, visually duplicate "Detail Pesanan" heading on top of `CartPanel`'s own header (which already renders that title + the "Kosongkan" button) — confirmed live in the browser at 500×800. Fixed by making the `SheetHeader` `sr-only`; Radix's Dialog still gets an accessible name, but only one heading is visible.
    2. `CartPanel`'s root was unconditionally `shrink-0`, which is correct in the desktop/tablet row layout (holds its fixed width against `ProductGrid`) but meant that inside the mobile sheet's bounded-height column it refused to shrink to fit — `sheetRect.height` (512px, `max-h-[85dvh]`) vs. `scrollHeight` (653px), `overflow-y: visible` on `SheetContent`, so "Bayar" was clipped below the viewport with **no way to scroll to it at all**, not merely "reachable only after scrolling." Root cause confirmed via `window.getComputedStyle`/`getBoundingClientRect` in the live browser. Fixed by changing `CartPanel`'s className from `shrink-0` to `shrink md:shrink-0` — at mobile it now shrinks into the sheet's flex container, activating its own internal `overflow-y-auto` order-list region while the header and the payment/CTA foot (both already `shrink-0`) stay pinned.
- **Decisions made during this task:** No tablet slide-over variant was built for the order panel — §41.3 makes it conditional ("if horizontal space is too tight"), and at 768px the 3-column grid remained usable in manual testing (confirmed live: 64px rail + 320px panel leaves enough room). Both fixes above stayed within the phase's existing file manifest (`PosOrderSheet.tsx`, `CartPanel.tsx`) rather than expanding scope.
- **Status:** Done
- **Handoff notes:** `pnpm turbo run lint typecheck test build` green (15/15 tasks) — 320/320 web tests (316 + 4 new `data-table.test.tsx`, including `PosScreen.test.tsx`'s suite unmodified per the plan's DoD), 0 lint errors (same 4 pre-existing unrelated `react-hook-form` warnings as prior phases). All four E2E scenarios from the plan's §6 were run live against `localhost:3001`/`localhost:4015` via Chrome automation and passed: (A) KASIR checkout at 1440×900 — search, add×2, pay, sale appears first in `/sales/history`; (B) the same checkout at 500×800 — order bar → sheet → pay → bar disappears (this is where the two bugs above were caught); (C) OWNER/KASIR at 900×700 — 64px rail with click-triggered flyout (hover events don't fire reliably through CDP automation — visually confirmed via a real click instead), `/master-data`'s product table keeps "Nama Produk" pinned while scrolling right past Status/Aksi, `/sales` keeps both zones side by side; (D) OWNER/ADMIN/KASIR sidebar contents match `getNavItems(role)` exactly — ADMIN shows only Data Master + Rekonsiliasi, KASIR shows only Penjualan/Cuti/Bantuan. Contrast math for DEBT item below confirmed by hand: `#00BFFF` vs. white ≈ 2.12:1. Not measured with a ruler in this session: exact pixel touch-target sizes (§5.2) and a full keyboard-only pass (§5.5's Tab/Esc walk) — both were exercised functionally (Esc closes the sheet's Radix dialog by construction; every interactive element already carries `focus-visible:ring-2`) but not itemized target-by-target. This closes the UI Revamp roadmap — see `docs/plannings/ui-revamp-design-alignment.md` for the four-phase summary.

### TASK-049 — UI Revamp Phase 3: POS Order Panel & Transaction Flow

- **Date:** 2026-08-20
- **Module / Phase:** UI Revamp Phase 3 (POS order panel), per `docs/plannings/ui-revamp-design-alignment.md`
- **Objective:** Restructure zone 3's `CartPanel` into DESIGN.md §24's top-to-bottom anatomy — panel header, order list of single rows with a unified pill stepper, summary block, payment method, full-width primary CTA pinned at the bottom — without changing any cart *behaviour*.
- **Relevant docs:** DESIGN.md §18.1, §20, §24, §24.1, §24.2, §24.3, §25, §26, §27, §41.5; ADR-004, ADR-013, ADR-015; DEBT-004.
- **What was done:**
  - Added `apps/web/components/pos/QuantityStepper.tsx` — a single bordered pill holding `[−][qty][+]`, replacing three separate `Button`s. Decrement is `disabled` at `quantity <= 1` (§25's current wording moves "remove item" to the row's dedicated delete icon), rather than editing `cartReducer`'s DECREMENT branch, which four test files cover.
  - Added `apps/web/components/pos/OrderSummary.tsx` — Subtotal (n) then Total bayar, divider between, no tax row (`Sale.totalAmount` is Σ line totals only, ADR-015 decision 1).
  - Rewrote `CartLineRow.tsx` — thumbnail (resolved by `CartPanel` from the product list, since `CartLine` deliberately carries no photo), name, `QuantityStepper`, mono line total, dedicated top-right trash icon in `status-danger`, dividers between rows instead of a per-row card border. Over-committed state is a tinted background + left accent bar rather than a border.
  - Rewrote `CartPanel.tsx` — panel header ("Detail Pesanan" + Kosongkan), internally-scrolling order list, pinned foot (error banner → `OrderSummary` → `PaymentMethodPicker` → full-width "Bayar" CTA with a `Send` icon). Takes a new `productPhotos: Map<string, string | null>` prop.
  - `PaymentMethodPicker.tsx`: 4 targeted edits — visible "Metode pembayaran:" label, horizontal scroll instead of wrap so the control's height never pushes the CTA off-panel, `shrink-0` tiles, updated doc comment recording the §24.3 dropdown deviation.
  - `PosScreen.tsx`: added a `productPhotos` memo (productId → photoUrl, from the same `productList` the grid renders) and passed it into `CartPanel`.
  - Added `apps/web/components/pos/OrderPanel.test.tsx` (9 tests) covering `QuantityStepper`, `OrderSummary`, and `CartLineRow` in isolation.
- **Decisions made during this task:** None beyond what the plan already specified — this task was a literal, section-by-section execution of a pre-approved plan (no approval checkpoint inside the phase, per the plan's §0.8). Three documented DESIGN.md deviations, logged as **DEBT-027**: (1) no customer combobox (§18.1) — no `Customer` model exists; (2) no Service Tax row (§24.2) — `Sale.totalAmount` has no tax column; (3) payment method stays a segmented tile control rather than the §24.3 dropdown, on §26/§43/§41.5 touch-target grounds and because ~15 existing POS tests select a method via `payment-method-<id>` tile clicks.
- **Status:** Done
- **Handoff notes:** `pnpm turbo run lint typecheck test` green (13/13 tasks) — 312/312 web tests (including `PosScreen.test.tsx`'s full 14-test regression suite, unmodified), 151/151 api tests, 0 lint errors (same 4 pre-existing unrelated `react-hook-form` warnings as TASK-047/048). `lib/pos/` was not touched — `cart.reducer.ts`, `cart-totals.ts`, `availability.ts`, `submit-error.ts`, `to-create-sale.ts` are byte-identical to before this task. Manually verified against the running dev server (`localhost:3001`/`localhost:4015`) at 1440×900 as the seeded KASIR (`kasir@ohmypos.local`): panel header reads "Detail Pesanan"; empty state shows both §27 lines; adding products renders one row per line with thumbnail, red top-right trash icon, pill stepper (decrement correctly disabled at quantity 1), and a mono right-aligned line total, separated by hairlines; the order list scrolls internally while summary/payment/CTA stay pinned; overriding a price live-updates Subtotal/Total bayar and shows the "Harga khusus" badge; payment tiles scroll horizontally and selecting one enables the "Bayar" CTA; a full submit produced a correct receipt (itemized, override reflected, Rp 95.000 total) and cleared the cart back to the empty state. Did **not** verify tablet/mobile breakpoints, tab order, or exact pixel touch-target measurements (plan §7.2–§7.3) in this session — those remain outstanding for whoever picks up Phase 4. Phase 4 (mobile bottom sheet) can mount the same `CartPanel` as-is — it is self-contained and prop-driven, and its foot (summary → payment → CTA) is already a single pinned block per the plan's §9 handoff notes.

### TASK-048 — UI Revamp Phase 2: POS Product Discovery & Filter Cards

- **Date:** 2026-08-20
- **Module / Phase:** UI Revamp Phase 2 (POS product discovery zone), per `docs/plannings/ui-revamp-design-alignment.md`
- **Objective:** Turn POS's middle zone from a search box over a plain card grid into DESIGN.md's §20/§21/§22 product discovery zone — a page header with the live WIB date and right-aligned search, a row of bordered filter cards with live counts, and a fixed-column grid whose first cell is the Add-New-Product affordance.
- **Relevant docs:** DESIGN.md §18, §20, §21, §21.1, §22, §23, §41.3, §41.5; ADR-013 (advisory headroom); ADR-011 (role-gated `/master-data`); DEBT-018, DEBT-004.
- **What was done:**
  - Appended `formatLongDate` to `apps/web/lib/formatters.ts` — Indonesian long-date format pinned to `Asia/Jakarta`, since `report.schema.ts` pins every report range to that zone and a browser-local date would disagree with it near midnight. Tests appended to `formatters.test.ts`.
  - Added `apps/web/lib/pos/product-filters.ts` (pure module) with `bucketOf`/`sellableProducts`/`countByBucket`/`filterProducts`. DESIGN.md §22 illustrates the filter row with menu categories, but `Product` has no category column (DEBT-018) — the row instead buckets by the cart-aware makeable-quantity headroom already computed in `availability.ts` (Semua Produk / Siap Dibuat / Stok Habis / Tanpa Resep), same card anatomy, real predicates. Covered by `product-filters.test.ts` (12 tests).
  - Added `apps/web/components/pos/PosPageHeader.tsx` (title + WIB date, rendered client-side only post-mount to avoid an SSR/browser timezone hydration mismatch, re-stamped at local midnight) and `CategoryFilterRow.tsx` (§22's bordered radiogroup cards with live counts).
  - Added `AddProductCard.tsx` (§21.1's dashed-border grid-first-cell, links to `/master-data`, shown only when `canCreateProducts` — ADR-011 restricts that route to ADMIN/OWNER).
  - Rewrote `ProductCard.tsx` (image now fills the card's top edge-to-edge at a fixed aspect ratio with an `ImageOff` placeholder when absent, `radius.lg`, brand-border highlight on the most-recently-added product) and `ProductGrid.tsx` (search/filter state moved out to `PosScreen`; grid now takes `canCreateProducts`, `highlightedProductId`, `isFiltered` for a distinct no-result-vs-empty-catalogue message). All pre-existing `data-testid`s (`product-card-*`, `product-in-cart-*`, `product-headroom-*`) and the literal string `Belum ada resep` were preserved unchanged.
  - `PosScreen.tsx`: both exported components now take a `role: UserRole` prop; added bucket/query/highlight state and the three-zone layout (`<section>` product-discovery panel wrapping header + filter row + scrollable grid, sibling to `CartPanel`). `app/(pos)/sales/page.tsx` passes `role={user.role}` through.
  - Added `apps/web/components/pos/ProductDiscovery.test.tsx` (7 tests) covering `CategoryFilterRow` rendering/selection and `ProductGrid`'s role-gated Add card, highlight, and empty-state copy.
  - **Post-implementation fix:** the plan's §7.1.5 layout applied `h-full`/`min-h-0`/`flex-1`/`overflow-y-auto` to the product-discovery section and its grid wrapper unconditionally, but `CartPanel` is `shrink-0` (its own natural content height, `CartPanel.tsx:84`) and only the `lg:flex-row` split was breakpoint-gated. Below `lg` (mobile/tablet, stacked column), the bounded-height section was forced to compete for leftover space against CartPanel's full natural height — on a phone-width viewport CartPanel's content alone exceeds the viewport, squeezing the product grid into a sliver with a broken nested-scroll region. Found via manual mobile verification (see Handoff notes) and reported by the user as "ui mobile untuk transaksi kasir nya rusak". Fixed by moving `h-full`/`min-h-0`/`flex-1`/`overflow-y-auto` behind `lg:` on the outer wrapper, the `<section>`, and the grid's scroll wrapper, so mobile/tablet fall back to natural stacked flow relying on `AppShell`'s own `<main>` scroll — unchanged from how Phase 1 already worked — while desktop keeps the fixed, non-scrolling three-zone layout the plan intended.
- **Decisions made during this task:** (1) The §22 filter-row deviation (availability buckets, not menu categories) was pre-approved in the plan itself, 2026-08-20 — logged as **DEBT-026**, and DEBT-018 updated to Partially resolved. (2) §21.2's discount tag was left unbuilt for the same reason DEBT-004 already gives (no discount/original-price field on `Product`; the per-line price override is the entire mechanism) — noted as an addendum on DEBT-004 rather than a new entry. (3) `PosPageHeader`'s mount-effect `setState` call needed a targeted `eslint-disable-next-line react-hooks/set-state-in-effect` — this is a one-time sync with the client clock for SSR-hydration safety, not the derived-state render cascade that rule guards against; not caught by the plan's literal snippet, fixed during the lint verification pass. (4) The mobile-layout regression above was not caught by lint/typecheck/tests (all pass regardless of Tailwind breakpoint gating) — only manual viewport verification surfaces it, which is why the plan's §9.2 step exists; skipping it initially is what let this ship.
- **Status:** Done
- **Handoff notes:** `pnpm turbo run lint typecheck test --filter=web` green (4/4 tasks, 303/303 tests, 0 lint errors — same 4 pre-existing unrelated `react-hook-form` warnings as TASK-047). Manually verified in Chrome at ~500×659 (mobile: hamburger topbar, full-width search, horizontally-scrolling filter row, 2-column grid, natural page scroll into the Pesanan/CartPanel section, floating "Lihat Pesanan" bar updates on add-to-cart) after the fix above. Did **not** verify 1440×900 desktop three-zone layout, the 900×700 tablet rail, or the KASIR/OWNER Add-card visibility difference in this session — this session's browser tool could only reliably resize a *freshly created* tab (resizing an already-navigated tab's window had no effect on its viewport), so only one viewport was checked; the rest of the plan's §9.2 checklist is still outstanding. **What Phase 3 needs:** `PosScreen`'s right zone is still today's `CartPanel`, positioned as zone 3 of the `flex ... lg:flex-row` row from §7.1.5 of the Phase 2 plan (now with `h-full`/`min-h-0` gated to `lg:`, see the fix above) — Phase 3 replaces only the panel's internals, not the wrapper or any prop passed into it, and must keep the `lg:`-gating rather than reintroducing an unconditional fixed-height layout. `CartPanel.tsx`, `CartLineRow.tsx`, `PaymentMethodPicker.tsx`, and `cart.reducer.ts` were untouched in this task.

### TASK-047 — UI Revamp Phase 1: App Shell & Modern Sidebar Navigation

- **Date:** 2026-08-20
- **Module / Phase:** UI Revamp Phase 1 (app shell + sidebar), per `docs/plannings/ui-revamp-design-alignment.md`
- **Objective:** Replace the flat, fully-saturated sidebar with the anatomy DESIGN.md §16 specifies (search, "Menu" label, tinted active pill, icons, 768–1023px icon rail, account card/avatar), and give POS a fixed-height shell so Phases 2–4 can build a non-scrolling three-zone layout on top of it.
- **Relevant docs:** DESIGN.md §15–17, §41.1–41.6, §42; AGENTS.md governance (no schema/dependency/contract changes, no Git writes).
- **What was done:**
  - Added `apps/web/hooks/useMediaQuery.ts` (SSR-safe `useSyncExternalStore`-based media query hook, `useIsRail`/`useIsMobile`) with `useMediaQuery.test.ts`.
  - Rewrote `apps/web/lib/nav-config.ts`: every `NavItem` now carries a `lucide-react` icon, added `isNavItemActive` and `filterNavItems` pure helpers, added optional `comingSoon` tag support. Appended new test blocks to `nav-config.test.ts`; all prior `getNavItems` assertions kept passing unchanged.
  - Added `apps/web/components/shell/SidebarAccountCard.tsx` (extracted account identity block; renders a full card at ≥1024px and an avatar + popover at the 768–1023px rail).
  - Rewrote `apps/web/components/shell/Sidebar.tsx`: sidebar search input, "Menu" section label, tinted `bg-surface-strong`/brand-text active pill with a 3px left indicator bar (replacing the old fully-saturated `bg-brand-primary text-white`), 64px icon-only rail at tablet width with flyout `Popover` submenus and hover `Tooltip` labels, `min-h-10`/`size-10` touch targets (§41.5).
  - Rewrote `apps/web/components/shell/Topbar.tsx`: added a `variant` prop (`'default' | 'pos'`) and an all-branch "Semua Cabang" branch-context pill for the Backoffice topbar (§17).
  - Rewrote `apps/web/components/shell/AppShell.tsx`: added a `variant` prop switching the outer container/`<main>` between the normal scrolling shell and a `h-dvh overflow-hidden` POS shell with an internally-scrolling `<main>`.
  - `apps/web/app/(pos)/layout.tsx`: passes `variant="pos"` to `AppShell`. `(back-office)` and `(shared)` layouts unchanged (default variant).
  - Edited `apps/web/components/shell/MobileNavDrawer.tsx` to reuse `isNavItemActive`/`NavItem`/`ROLE_LABEL` from the files above, added icons and the same tinted-pill active styling to both flat links and collapsible groups.
  - Added `apps/web/components/shell/Sidebar.test.tsx` covering expanded (search, active pill, filtering, auto-expand, role visibility) and rail (icon-only layout, flyout, avatar popover) behaviour.
- **Decisions made during this task:** (1) One `AppShell` with a `variant` prop rather than a dedicated `PosShell` — `(pos)` also contains `/sales/history`, an ordinary scrolling table page, so a POS-only shell component would have forced `overflow-hidden` onto it too. (2) A JS `useMediaQuery`/`useIsRail` hook rather than CSS-only breakpoints, because §41.2 requires different markup at the rail width (a `Popover` flyout instead of an inline indented list), which CSS cannot produce. (3) Cashier branch-name context (§17's `Kemang · Terkunci`) was **not** implemented — logged as tech debt below, see DEBT-005.
- **Status:** Done
- **Handoff notes:** `pnpm turbo run lint typecheck test` green (4/4 tasks, 282/282 tests, 0 lint errors — 4 pre-existing unrelated React Compiler warnings only). Manually verified in Chrome at 1440×900 (expanded sidebar, tinted active pill, branch-context pill), 900×700 (64px icon rail, flyout submenu on click, avatar popover), 500×800 (hamburger drawer with icons and tinted active pill), and `/sales` at 1440×900 (no 52px topbar, POS shell renders with the group auto-expanded and its active child pill-highlighted). Did not test logging in as ADMIN/KASIR interactively — role-based nav visibility is covered by `Sidebar.test.tsx` instead. **What Phase 2 needs:** `AppShell variant="pos"`'s `<main>` is `min-h-0 flex-1 overflow-y-auto`, sized to the viewport minus the mobile topbar; `useIsRail`/`useIsMobile` from `hooks/useMediaQuery.ts` are ready for the product grid and bottom sheet.

### TASK-046 — All Employees Leave History View in Leave Requests Page

- **Date:** 2026-08-20
- **Module / Phase:** Leave Requests (Phase 12, ADR-021)
- **Objective:** Add employee leave history view to `/leave-requests` page allowing owners to see all employees' historical leave requests alongside the pending review queue.
- **Relevant docs:** ADR-021, AGENTS.md, `04 - Engineering_Playbook.md`
- **What was done:**
  - Updated `LeaveRequestResponse` and `LeaveRequestUserSummary` schema in `packages/api-contracts/src/leave-request.schema.ts` to include employee summary (`name`, `email`).
  - Updated `LeaveRequestsService` in `apps/api` to `include` user relation details (`name`, `email`, `id`) in `findMine`, `findAll`, `approve`, and `reject`.
  - Refactored `OwnerReviewQueue` in `apps/web` with Radix `Tabs` for "Menunggu Persetujuan" and "Riwayat Semua Cuti".
  - Added dynamic filtering by employee (User) and status (Pending/Approved/Rejected) in the history tab.
  - Updated E2E test in `apps/api/test/leave-requests.e2e-spec.ts` to verify user details in leave request queries.
- **Decisions made during this task:** Added user metadata directly into `LeaveRequestResponse` query join, avoiding multiple fragmented frontend network round-trips.
- **Status:** Done
- **Handoff notes:** All unit and e2e test suites passing cleanly (`turbo run lint typecheck test`).

### TASK-045 — Export (XLSX) Buttons Across Key Data Pages

- **Date:** 2026-08-20
- **Module / Phase:** Cross-cutting frontend feature — Reports, Expenses, Inventory, Reconciliation, Devices/Attendance
- **Objective:** Add Export buttons to the pages where exporting to a spreadsheet has real business value (accounting rekap, payroll, audit trail) — the app previously had no export functionality anywhere.
- **Relevant docs:** N/A — purely additive frontend feature, no schema/migration or API contract change; scope and format (XLSX) were confirmed with the user directly before implementation.
- **What was done:**
  - Added `exceljs` as a new dependency to `apps/web` (dynamic-imported inside the export handler so it never lands in the initial bundle — only pages with an Export button pay for it, and only once clicked).
  - Added `apps/web/lib/export.ts` (`exportRowsToXlsx`, `exportMatrixToXlsx`, and the exported-for-testing `buildWorkbook`) plus `export.test.ts` (3 tests: header row, native cell types, empty-row case).
  - Extended the shared `apps/web/components/ui/data-table.tsx` with optional `exportColumns`/`exportFilename` props — renders an Export button in the toolbar that exports the currently filtered/searched rows (`table.getFilteredRowModel()`), not the full unfiltered dataset.
  - Wired `exportColumns` into every existing `DataTable` consumer that qualified: `GeneralExpenseTab`, `PurchaseEntryTab`, `PayablesTab` (Expenses); `InventorySummaryTable` (threaded a new `period` prop from `InventoryClient` for the filename); `BankTransactionsTable` (Reconciliation); `AttendanceLogTable` (Devices); and 4 of the 5 Reports views — `DailyIncomeView`, `TopProductsView`, `ProductProfitView`, `IncomeByPaymentMethodView` — all of which already used the same shared `DataTable`, so no bespoke per-tab export logic was needed there (a simplification over the original plan, which hadn't yet noticed this).
  - Added a bespoke Export button to `ProfitLossView` (single KPI-summary object, no table) calling `exportRowsToXlsx` directly with a one-row export.
  - Added a bespoke Export button to `AttendanceCalendarMatrix` (staff × day-of-month grid) calling `exportMatrixToXlsx`, reusing its existing `cashiers`/`daysArray`/`getDayStatus` state.
  - Explicit scope exclusions (confirmed with user up front): Master Data, Users, Branches, Accounts — low export value, and Users holds semi-sensitive staff data.
- **Decisions made during this task:**
  - Format: XLSX over CSV — native numeric/date cell types (summable in Excel, no re-parsing needed) and no Indonesian-locale delimiter ambiguity (Excel there defaults to `;`, not `,`). Presented as a 3-option plan (XLSX/CSV/both) via plan mode and approved before implementation, per AGENTS.md's dependency-approval gate.
  - Library: `exceljs` over `xlsx`/SheetJS — SheetJS's npm-published releases are stale (development moved to their own CDN after v0.18.5) and the npm package carries a known prototype-pollution advisory; `exceljs` is actively maintained and published directly to npm.
- **Status:** Done
- **Handoff notes:**
  - Verified via `lint`/`typecheck`/full test suite (261 tests, all passing) and via a direct API-login + curl fetch of the SSR HTML, confirming the Export button renders correctly for Expenses/Reconciliation/Attendance. Reports and Inventory render behind a `React.Suspense` boundary (required by `useSearchParams()`), so static curl can't observe their post-hydration DOM — same `DataTable` code path, but unverified live. Nobody has clicked Export in an actual browser yet and confirmed a `.xlsx` downloads and opens with correct data (the Claude-in-Chrome extension wasn't connected this session) — see DEBT-024.
  - Export filenames on the 5 Reports views use the export-time date, not the report's selected `startDate`/`endDate` — see DEBT-025.

### TASK-044 — Help / Documentation Page (Phase 13)

- **Date:** 2026-08-20
- **Module / Phase:** Documentation / Help Page (Phase 13)
- **Objective:** Provide a dedicated role-aware Help/Documentation ("Bantuan") page with step-by-step guidance rendered through accessible accordion components without introducing new dependencies or MDX pipelines.
- **Relevant docs:** `docs/plannings/phase-13-help-page.md`, AGENTS.md, DESIGN.md
- **What was done:**
  - Added Accordion component in `packages/ui/src/components/ui/accordion.tsx` wrapping `radix-ui` Accordion primitives.
  - Authored structured static typed guide data in `apps/web/lib/help-content.ts` with role-based filtering (`getHelpSections`).
  - Created shared help page `apps/web/app/(shared)/help/page.tsx` and client component `HelpClient.tsx`.
  - Updated `apps/web/lib/nav-config.ts` to include `/help` in navigation for `KASIR` and `OWNER` (omitting sidebar link for `ADMIN` per AGENTS.md constraints while keeping URL accessible).
  - Updated unit tests in `apps/web/lib/nav-config.test.ts`.
  - Ran turbo lint, typecheck, and full test suite across workspace.
  - Verified live E2E rendering and role-based filtering for `OWNER`, `KASIR`, and `ADMIN` via Playwright.
- **Status:** Done
- **Handoff notes:**
  - Next phases in HR-lite/backlog can proceed independently.

### TASK-043 — Attendance Monthly Calendar & Leave Matrix

- **Date:** 2026-08-20
- **Module / Phase:** Devices & Attendance Tracking / Cuti (Phase 11 & 12 Integration)
- **Objective:** Provide a monthly attendance calendar grid/matrix (Option 1) mapping each cashier to days 1..31 with status indicators (Hadir Valid, Pelanggaran, Cuti/Izin Disetujui, Libur/Kosong) and interactive popover details.
- **Relevant docs:** ADR-021, PRD §5.4
- **What was done:**
  - Created `AttendanceCalendarMatrix` component (`apps/web/app/(back-office)/devices/AttendanceCalendarMatrix.tsx`).
  - Integrated `useUsers`, `useAttendanceRecords`, and `useAllLeaveRequests` to cross-reference daily cashier presence with official approved leaves.
  - Implemented day popover showing login timestamp, device label, and leave reasons.
  - Added tab switcher in `apps/web/app/(back-office)/devices/attendance/AttendanceClient.tsx` (Kalender Matriks & Riwayat Log Detail).
  - Verified live E2E via Playwright and saved screenshot to `docs/screenshoots/attendance-calendar-matrix.png`.
- **Status:** Done

### TASK-042 — Attendance Status Manual Override by Owner

- **Date:** 2026-08-20
- **Module / Phase:** Devices & Attendance Tracking (Phase 11 Extension)
- **Objective:** Allow Owner to manually update/correct attendance validity status (e.g. override system errors, mark as Valid or specific Violation reason) via `PATCH /devices/attendance/:id`.
- **Relevant docs:** ADR-021, AGENTS.md
- **What was done:**
  - Added `UpdateAttendanceStatusSchema` in `@ohmypos/api-contracts`.
  - Added `updateStatus` method in `AttendanceService` and endpoint `PATCH /devices/attendance/:id` in `DevicesController` (OWNER-only).
  - Added `useUpdateAttendanceStatus` mutation in `apps/web/hooks/useDevices.ts`.
  - Added row action DropdownMenu in `AttendanceLogTable.tsx` allowing Owner to toggle record validity ("Tandai Sebagai Valid", "Tandai: HP Pribadi", "Tandai: Salah Cabang", "Tandai: Tak Terdaftar").
  - Verified live E2E in browser via Playwright and captured screenshot to `docs/screenshoots/attendance-status-override-menu.png`.
- **Status:** Done

### TASK-041 — Dashboard Compact Branch Profitability Card

- **Date:** 2026-08-20
- **Module / Phase:** Dashboard UI
- **Objective:** Consolidate branch profitability into a single clean minimalist card showing top 3 branches with branch name, Profit/Loss badge, and total omset/revenue.
- **Relevant docs:** PRD §5.4, DESIGN.md
- **What was done:**
  - Simplified `apps/web/components/dashboard/BranchProfitabilityCard.tsx` into a single compact card showing max 3 operational branches sorted by omset.
  - Displayed essential info: Nama Cabang, Badge Status (`Profit` / `Tidak Profit`), Omset per cabang, dan progress bar horizontal minimalis.
  - Verified live rendering in Playwright, and passed all linter, typecheck, and unit tests across workspace.
  - Captured screenshot in `docs/screenshoots/dashboard-branch-profitability-single-card.png`.
- **Status:** Done

### TASK-040 — Dashboard Branch Profitability Horizontal Bar Chart

- **Date:** 2026-08-20
- **Module / Phase:** Dashboard & Reports
- **Objective:** Convert the branch profitability card from a data table into an analytical Horizontal Bar Chart with custom tooltips (Revenue, Net Profit, Margin %) and inflow/outflow conditional color fills.
- **Relevant docs:** PRD §5.4, DESIGN.md §36/§37
- **What was done:**
  - Refactored `apps/web/components/dashboard/BranchProfitabilityCard.tsx` from `@ohmypos/ui` Table to Recharts `BarChart` (`layout="vertical"`).
  - Configured XAxis numeric with compact Indonesian numbers and YAxis with branch names.
  - Added conditional bar fill colors: emerald green (`--color-accent-inflow`) for profit branches (net profit >= 0) and red (`--color-accent-outflow`) for loss branches.
  - Added rich analytical tooltip detailing Pendapatan, Laba Bersih, dan Margin %.
  - Verified live rendering via Playwright and saved screenshot to `docs/screenshoots/dashboard-branch-profitability-barchart.png`.
- **Decisions made during this task:**
  - Dynamic bar chart height based on the number of operational branches (`Math.max(220, branchResults.length * 60 + 50)`).
- **Status:** Done

### TASK-039 — Dashboard Branch Profitability Card

- **Date:** 2026-08-20
- **Module / Phase:** Dashboard & Reports
- **Objective:** Display branch profitability metrics (Revenue, COGS, Opex, Net Profit, Margin %, Profit/Loss badge status) on the main Owner Dashboard.
- **Relevant docs:** PRD §5.4, ADR-014, ADR-017
- **What was done:**
  - Created `BranchProfitabilityCard` component (`apps/web/components/dashboard/BranchProfitabilityCard.tsx`).
  - Integrated real-time query per operational branch to `useProfitLoss({ startDate, endDate, branchId })`.
  - Filtered out the Central/Pusat kitchen inventory pool, displaying retail selling branches.
  - Added summary status badges: Profit (emerald), Rugi/Tidak Profit (destructive), Impas (outline), and margin breakdown.
  - Embedded into `apps/web/components/dashboard/DashboardClient.tsx`.
  - Verified live via Playwright E2E and saved screenshot to `docs/screenshoots/dashboard-branch-profitability.png`.
- **Decisions made during this task:**
  - Used `@ohmypos/ui` shadcn `Table`, `Badge`, `Card`, and `Skeleton` primitives.
- **Status:** Done

### TASK-038 — Recipe Decimal Parsing & E2E Playwright Verification

- **Date:** 2026-08-20
- **Module / Phase:** Master Data (Recipe/BOM) & E2E Testing
- **Objective:** Fix decimal input validation for recipe ingredients supporting comma format ("0,025") and dot format ("0.025"), verify live in browser via Playwright.
- **Relevant docs:** ADR-010, ADR-012, Playbook §5
- **What was done:**
  - Updated `decimalString` in `packages/api-contracts/src/primitives.ts` to accept `/^-?\d+(?:[.,]\d+)?$/` and sanitize comma to dot via transform.
  - Updated `RecipeEditorDialog.tsx` to sanitize input strings before mutation submission.
  - Verified live E2E browser flow via Playwright: logged in as Owner, opened Product & Recipe table, edited recipes for Air Mineral and Burger using decimal quantities with commas (`0,05`) and dots (`0.03`), successfully computed Live HPP and Margins without any validation errors.
  - Captured verification screenshot in `docs/screenshoots/master-data-updated-recipe.png`.
- **Decisions made during this task:**
  - Comma and dot inputs are both supported seamlessly across API contracts.
- **Status:** Done

### TASK-037 — Product Photo Upload & Display

- **Date:** 2026-08-20
- **Module / Phase:** Master Data & POS (Products)
- **Objective:** Enable OWNER/ADMIN to upload product photos to Cloudinary and display product photos in Master Data Table, Form Dialog, and POS cards.
- **Relevant docs:** ADR-020 (Cloudinary Pattern), AGENTS.md, PRD §5.1
- **What was done:**
  - Added `photoUrl String? @map("photo_url")` to `Product` model in `apps/api/prisma/schema.prisma` and applied migration `20260820013927_add_product_photo_url`.
  - Updated `@ohmypos/api-contracts` (`ProductResponseSchema` with `photoUrl: z.string().nullable().optional()`).
  - Added `ProductPhotoService` in `apps/api/src/modules/products/product-photo.service.ts` with unit test in `product-photo.spec.ts`.
  - Added `POST /products/:id/photo` endpoint with `FileInterceptor` in `ProductsController` (OWNER/ADMIN only).
  - Updated `useMasterData.ts` in `apps/web` with `useUploadProductPhoto` mutation.
  - Updated `ProductFormDialog` with photo upload selector/preview and multipart upload integration.
  - Updated `ProductsTable` to show product image thumbnail in the product column.
  - Updated POS `ProductCard` to render product image banner.
  - Verified tests, lint, and typechecks across monorepo.
- **Decisions made during this task:**
  - Cloudinary public ID follows deterministic pattern `product_<productId>` with `overwrite: true` to prevent orphan image storage.
- **Status:** Done
- **Handoff notes:**
  - Standard Cloudinary credentials (`CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`) in API env are shared with user profile photo uploads.

### TASK-036 — Phase 12: Leave Requests (Cuti)

- **Date:** 2026-08-20
- **Module / Phase:** Phase 12 — Leave Requests (Cuti)
- **Objective:** Enable employees (KASIR) to submit leave requests and view submission history, while providing an OWNER-only review and approval/rejection queue.
- **Relevant docs:** ADR-021, `docs/plannings/phase-12-leave-requests.md`, AGENTS.md
- **What was done:**
  - Added Prisma model `LeaveRequest` and enum `LeaveRequestStatus` in `apps/api/prisma/schema.prisma` with relations to `User` (`leaveRequests`, `reviewedLeaveRequests`), and applied migration `20260820010402_add_leave_requests`.
  - Added API contracts in `packages/api-contracts/src/leave-request.schema.ts` (`CreateLeaveRequestSchema`, `LeaveRequestListQuerySchema`, `LeaveRequestResponseSchema`) and exported in `index.ts`.
  - Implemented backend module `apps/api/src/modules/leave-requests/` (`leave-requests.exceptions.ts`, `leave-requests.dto.ts`, `leave-requests.service.ts`, `leave-requests.controller.ts`, `leave-requests.module.ts`).
  - Registered `LeaveRequestsModule` in `apps/api/src/app.module.ts`.
  - Created frontend React Query hooks in `apps/web/hooks/useLeaveRequests.ts`.
  - Built frontend UI under `apps/web/app/(shared)/leave-requests/` (`page.tsx`, `LeaveRequestsClient.tsx`, `MyLeaveRequests.tsx`, `OwnerReviewQueue.tsx`).
  - Updated `apps/web/lib/nav-config.ts` to include `/leave-requests` for `KASIR` and `OWNER`, and updated `nav-config.test.ts`.
  - Added full e2e test suite in `apps/api/test/leave-requests.e2e-spec.ts` covering submission, self-listing, date validation, RBAC restrictions (KASIR forbidden from all/review), and Owner approval/rejection workflows.
  - Verified with unit tests, e2e tests, linter, and typecheck across the monorepo.
- **Decisions made during this task:**
  - Leave dates are calendar days (`@db.Date`), validated with `startDate <= endDate` at the contract schema level.
  - Review queue for Owner defaults to `PENDING` items for simple triage in v1.
- **Status:** Done
- **Handoff notes:**
  - Phase 12 fully complete and tested.

### TASK-035 — Phase 11: Attendance & Device Tracking

- **Date:** 2026-08-19
- **Module / Phase:** Phase 11 — Attendance & Device Tracking
- **Objective:** Track KASIR login timestamp and physical device validity using signed HttpOnly device cookies activated via an authenticated OWNER ceremony; surface attendance violations as non-blocking login warning banners.
- **Relevant docs:** ADR-021, `docs/plannings/phase-11-attendance-device-tracking.md`, AGENTS.md
- **What was done:**
  - Added ADR-021 in `docs/02 - ADR.md` documenting scope expansion for Attendance/Device Tracking & Leave Requests.
  - Added Prisma models `Device`, `AttendanceRecord`, and enum `AttendanceViolationReason` in `apps/api/prisma/schema.prisma` and applied migration `20260819151056_add_devices_and_attendance`.
  - Implemented HMAC-SHA256 device cookie signing & timing-safe verification utility (`apps/api/src/common/utils/device-cookie.util.ts`) with Jest unit tests.
  - Added device contracts (`packages/api-contracts/src/device.schema.ts`) and extended `LoginResponseSchema` with `attendance` field in `packages/api-contracts/src/auth.schema.ts`.
  - Built `devices` backend module (`devices.controller.ts`, `devices.service.ts`, `attendance.service.ts`, `devices.dto.ts`, `devices.exceptions.ts`, `devices.module.ts`).
  - Integrated `AttendanceService` into `AuthService.login()` and `AuthController.login()` to inspect cookies for `KASIR` logins and record attendance.
  - Registered `DevicesModule` in `apps/api/src/app.module.ts` and set cookie constants (`DEVICE_COOKIE`, `DEVICE_COOKIE_MAX_AGE`).
  - Built frontend pages and components: `/devices` listing with `AddDeviceDialog`, `/devices/attendance` log monitoring page with `AttendanceLogTable`, `/devices/activate` page, `useDevices` and `useAttendanceRecords` hooks, updated `nav-config.ts` (adding `/devices` with submenus `Daftar Perangkat` & `Log Absensi` for OWNER) and `nav-config.test.ts`, plus non-blocking attendance warning banner on `/login`.
  - Refactored `/devices` and `/devices/attendance` UI to replace native elements and custom tables with `@ohmypos/ui` shadcn primitives (`Badge`, `Checkbox`, `Select`, `Table`) and TanStack `DataTable` with client-side search and sorting.
  - Added `GET /devices/attendance` endpoint for real-time Owner monitoring of cashier login times, device names, and violation statuses with branch and violation filters.
  - Verified with unit tests, linting, and typechecks across all packages.
- **Decisions made during this task:**
  - `Device` scoped to `Branch`, not `User` (terminals shared per branch).
  - Attendance recording is strictly for `KASIR` logins; `ADMIN` and `OWNER` logins return `attendance: null`.
  - Login always succeeds for valid credentials; unregistered or mismatched device results in `isValid: false` warning banner rather than login failure.
  - Owner activation endpoint `POST /devices/activate` requires authenticated OWNER role rather than public endpoint.
- **Status:** Done
- **Handoff notes:**
  - Documented accepted residual risk in `08 - Tech_Debt_Log.md`: cashier with physical dev tools access could extract and copy the device cookie to a personal device.
  - Ready for Phase 12 (Leave Requests) which builds on ADR-021 and existing `(shared)` route group patterns.

### TASK-034 — Phase 10b: Profile Photo Upload (Cloudinary)

- **Date:** 2026-08-19
- **Module / Phase:** Phase 10b — Profile Photo Upload
- **Objective:** Implement self-service profile photo upload using Cloudinary for storage and transformation, adding `User.photoUrl` and `POST /auth/me/photo`.
- **Relevant docs:** ADR-020, ERD §7 Note 4 (Superseded), PRD v1.1
- **What was done:**
  - Authored and approved ADR-020 reversing ERD §7 Note 4.
  - Added `cloudinary` dependency to `apps/api`.
  - Updated `apps/api/prisma/schema.prisma` with `photoUrl String? @map("photo_url")` on `User` model, generated and executed migration `20260819141846_add_user_photo_url`.
  - Updated `@ohmypos/api-contracts` (`UserResponseSchema` with `photoUrl: z.string().nullable()`, `UploadPhotoResponseSchema`).
  - Added `ProfilePhotoService`, `InvalidImageFileException`, and `POST /auth/me/photo` in `apps/api`.
  - Updated `AuthService` and `UsersService` to include `photoUrl` in response mapping.
  - Added `useUploadPhoto` mutation hook and `PhotoForm` component in `apps/web`.
  - Set Cloudinary upload target folder to `ohmypos` with public ID format `user_<userId>`.
  - Updated CSP headers in `apps/web/next.config.ts` to allow `https://res.cloudinary.com` under `img-src`.
  - Added profile photo avatar rendering to `Sidebar.tsx`.
  - Removed server-side thumbnail crop transformation in `ProfilePhotoService` so the original photo is preserved intact in Cloudinary.
  - Added unit test `profile-photo.spec.ts`.
- **Decisions made during this task:**
  - Cloudinary public ID is deterministic (`ohmypos/user_<userId>`) with `overwrite: true` to avoid orphan image accumulation.
  - Storing original aspect ratio without server-side crop; circular/square presentation handled in frontend CSS.
- **Status:** Done
- **Handoff notes:** Requires real `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET` in environment variables when deployed.

### TASK-033 — Remove Redundant Branch Label from Topbar

- **Date:** 2026-08-19
- **Module / Phase:** apps/web Layout Shell (`Topbar.tsx`, `AppShell.tsx`)
- **Objective:** Hapus label "Semua Cabang" / "Cabang Terkunci" dari Topbar karena data bersifat terpusat (ADR-004) dan filter cabang sudah tersedia secara lokal di modul yang relevan (Laporan & Riwayat Penjualan).
- **Relevant docs:** DESIGN.md §17, ADR-004
- **What was done:**
  1. Menghapus helper `branchLabel` dan elemen teks cabang dari `Topbar.tsx`.
  2. Menyembunyikan topbar pada layar desktop (`md:hidden`) karena fungsi profil dan menu telah berpindah penuh ke sidebar.
  3. Memperbarui `AppShell.tsx` dan memverifikasi lint, typecheck, dan unit test.
- **Status:** Done
- **Handoff notes:** Lolos lint, typecheck, dan seluruh unit test.

### TASK-032 — Refactor Sidebar Footer Layout with Explicit Settings, Logout, and User Info

- **Date:** 2026-08-19
- **Module / Phase:** apps/web Layout Shell (`Sidebar.tsx`)
- **Objective:** Hilangkan dropdown pada avatar user di footer sidebar; susun secara vertikal: tombol Pengaturan (`/profile`), tombol Keluar (Logout), lalu kartu info statis profil user (foto/avatar, nama, dan role).
- **Relevant docs:** DESIGN.md §16–18, PRD §5
- **What was done:**
  1. Menghapus wrapper `DropdownMenu` dari kartu user di sidebar.
  2. Menambahkan tombol navigasi link `Pengaturan` (`/profile`) dengan icon `Settings`.
  3. Menambahkan tombol aksi `Keluar` (`Logout`) langsung dengan icon `LogOut` berwarna merah (danger) di bawah tombol pengaturan.
  4. Menempatkan kartu informasi statis identitas profil user di urutan paling bawah (avatar inisial, nama user, dan label role).
- **Status:** Done
- **Handoff notes:** Lint, typecheck, dan unit test seluruhnya lulus.

### TASK-031 — Move User Profile & Role to Sidebar Footer

- **Date:** 2026-08-19
- **Module / Phase:** apps/web Layout Shell (`Sidebar.tsx`, `Topbar.tsx`, `AppShell.tsx`)
- **Objective:** Pindahkan identitas profil user dari topbar ke footer bawah sidebar dengan avatar inisial, nama user, role label, dan popup menu aksi (Profil & Logout).
- **Relevant docs:** DESIGN.md §16–18, PRD §5
- **What was done:**
  1. Menghapus dropdown profile dari `Topbar.tsx` dan menyederhanakan topbar menjadi hanya indikator cabang & mobile menu button.
  2. Menambahkan user identity footer di `Sidebar.tsx` (paling bawah): avatar lingkaran inisial, nama user, role badge, serta chevron selector.
  3. Mengintegrasikan popup `DropdownMenu` (Profil Saya & Logout) di footer sidebar.
  4. Mengupdate `AppShell.tsx` agar mengalirkan prop `user: UserResponse` ke `Sidebar`.
- **Status:** Done
- **Handoff notes:** Lint, typecheck, dan unit test (40 test file, 257 passed) lulus.

### TASK-030 — Enhance Back-Office Dashboard with Rich Visualizations & Donut Payment Chart

- **Date:** 2026-08-19
- **Module / Phase:** apps/web Dashboard (`DashboardClient.tsx`, `ReportChart.tsx`)
- **Objective:** Tingkatkan kepadatan informasi halaman dashboard dengan menambahkan diagram lingkaran (donut chart) porsi metode pembayaran (dalam persentase & nominal), peringkat 5 produk terlaris, feed transaksi terkini, serta card peringatan aksi cepat (bahan baku menipis & utang terbuka).
- **Relevant docs:** DESIGN.md, PRD §5.4
- **What was done:**
  1. Menambahkan komponen `ReportPieChart` pada `ReportChart.tsx` berbasis Recharts `PieChart`, `Pie`, dan `Cell` lengkap dengan tooltip persentase dan nominal terformat.
  2. Memperbarui `DashboardClient.tsx` untuk mengonsumsi data `useIncomeByPaymentMethod`, `useTopProducts`, `useSales` (recent sales), `useInventorySummary`, dan `usePayablesSummary`.
  3. Menyusun layout grid 2 baris yang informatif dan responsif:
     - Baris 1: Ringkasan KPI Utama (Kas, Laba Bersih, Utang, Stok).
     - Baris 2: Tren Pendapatan Harian (Line Chart) + Diagram Lingkaran Metode Pembayaran (Donut Chart dengan legend persentase).
     - Baris 3: Top 5 Produk Terlaris, Feed Transaksi Kasir Terkini, dan Status Perhatian / Aksi Operasional (Low Stock & Utang Supplier).
- **Status:** Done
- **Handoff notes:** Lint, typecheck, dan unit test lolos.

### TASK-029 — Collapsible Sidebar & Mobile Navigation for Sub-routes

- **Date:** 2026-08-19
- **Module / Phase:** apps/web UI shell navigation (`Sidebar.tsx`, `MobileNavDrawer.tsx`, `@ohmypos/ui/collapsible`)
- **Objective:** Buat parent sidebar dengan sub-menu dapat di-expand/collapse ketika diklik menggunakan komponen shadcn Collapsible.
- **Relevant docs:** DESIGN.md, PRD §5
- **What was done:**
  1. Menambahkan komponen shadcn UI `Collapsible`, `CollapsibleTrigger`, `CollapsibleContent` di `packages/ui/src/components/ui/collapsible.tsx` berbasis Radix UI.
  2. Mengubah `Sidebar.tsx` dan `MobileNavDrawer.tsx` agar menggunakan `Collapsible` dengan chevron icon indikator animasi rotasi.
  3. Menangani auto-expand ketika user berada di dalam active sub-route sambil tetap mengizinkan toggle buka-tutup manual.
- **Status:** Done
- **Handoff notes:** Lolos lint, typecheck, dan seluruh unit test.

### TASK-028 — Split Back-Office Routes into Dedicated Sub-Routes

- **Date:** 2026-08-19
- **Module / Phase:** apps/web routing refactor (`/master-data`, `/expenses`, `/reports`)
- **Objective:** Pecah halaman back-office yang sebelumnya menggunakan internal client tabs menjadi URL sub-routes terpisah dengan navigasi sidebar bertingkat.
- **Relevant docs:** PRD §5, ADR-011, System Design v4 §5
- **What was done:**
  1. **Master Data Sub-routes:**
     - `/master-data`: Produk & Resep / BOM (`MasterDataClient` tab `products`)
     - `/master-data/raw-materials`: Bahan Baku (`MasterDataClient` tab `raw-materials`)
  2. **Expenses Sub-routes:**
     - `/expenses`: Pengeluaran Umum (`ExpensesClient` tab `general`)
     - `/expenses/purchases`: Pembelian Bahan Baku (`ExpensesClient` tab `purchases`)
     - `/expenses/payables`: Pelunasan Utang (`ExpensesClient` tab `payables`)
  3. **Reports Sub-routes:**
     - `/reports`: Laba Rugi (`ReportsClient` tab `profit-loss`)
     - `/reports/product-profit`: Laba per Produk
     - `/reports/payment-methods`: Pendapatan per Metode Bayar
     - `/reports/top-products`: 10 Produk Terlaris
     - `/reports/daily`: Pendapatan Harian
  4. **Navigasi & Filter:**
     - Memperbarui `nav-config.ts` dan `nav-config.test.ts` untuk sub-menu `Data Master`, `Pengeluaran`, dan `Laporan`.
     - Mempertahankan query params tanggal dan cabang (`startDate`, `endDate`, `branchId`) saat berpindah tab sub-route laporan.
- **Decisions made during this task:** Menggunakan navigasi berbasis Link untuk tab bar atas agar setiap halaman memiliki URL unik yang bookmarkable tanpa menghilangkan UX tab switching.
- **Status:** Done
- **Handoff notes:** Semua test (`vitest`), lint, dan typecheck lolos.

### TASK-027 — Split Sales Navigation, Sales History & Receipt Printing

- **Date:** 2026-08-19
- **Module / Phase:** Phase 8c Addendum / Sales History & Struk (`(pos)/sales/history`)
- **Objective:** Pisahkan menu Penjualan di sidebar menjadi sub-menu Transaksi Kasir (`/sales`) dan Riwayat Transaksi (`/sales/history`), serta sediakan UI preview & cetak struk (faktur kasir) dengan nama usaha dan cabang.
- **Relevant docs:** PRD §5.2, ADR-011, DESIGN.md
- **What was done:**
  1. **Navigasi Nested (`apps/web/lib/nav-config.ts`):** Menambahkan dukungan nested items `children` pada `NavItem`. Membuka menu sub-item Penjualan (`Transaksi Kasir` dan `Riwayat Transaksi`) untuk role `KASIR` dan `OWNER`.
  2. **Sidebar & Mobile Navigation:** Memperbarui `Sidebar.tsx` dan `MobileNavDrawer.tsx` agar merender sub-menu berjenjang dengan active indicator yang presisi.
  3. **Role Gating:** Memperbarui `(pos)/layout.tsx` dan `/sales/page.tsx` untuk mengizinkan role `KASIR` dan `OWNER`.
  4. **Riwayat Penjualan (`apps/web/app/(pos)/sales/history`):**
     - Membuat `page.tsx` dan `SalesHistoryClient.tsx` dengan filter cabang (khusus Owner) dan date-range filter.
     - Membuat `SalesHistoryTable.tsx` berbasis `DataTable` lengkap dengan pencarian dan sorting.
     - Menambahkan hook `useSales` di `apps/web/hooks/usePos.ts`.
  5. **Struk & Invoice (`SaleReceiptDialog.tsx` & `SaleSuccessDialog.tsx`):**
     - Menampilkan nama usaha (`NEXT_PUBLIC_BUSINESS_NAME` / fallback) dan nama cabang.
     - Mendukung aksi cetak struk via `window.print()`.
  6. **Testing:** Menambahkan unit test `SalesHistoryTable.test.tsx` dan memperbarui `nav-config.test.ts`.
- **Status:** Done
- **Handoff notes:** Semua unit tests dan linter pass (40 test suites, 257 tests passed). PR diajukan ke branch `dev`.

---

### TASK-026 — Payment Methods (Accounts) Management UI & POS Revamp Preparation

- **Date:** 2026-08-19
- **Module / Phase:** Phase UI Revamp / Payment Methods Management (`(back-office)/accounts`)
- **Objective:** Sediakan UI manajemen Metode Pembayaran / Akun Kas & Bank (`(back-office)/accounts`) untuk role ADMIN dan OWNER guna mendukung fleksibilitas konfigurasi metode pembayaran (Kas Tunai, E-Wallet, QRIS, Bank Transfer) yang dikonsumsi POS dan rekonsiliasi.
- **Relevant docs:** PRD §5.1, ADR-004, ADR-010, ADR-011, DESIGN.md
- **What was done:**
  1. **Frontend UI (`(back-office)/accounts`):** Membuat `page.tsx`, `AccountsClient.tsx`, `AccountsTable.tsx`, dan `AccountFormDialog.tsx` untuk CRUD akun kas/bank (nama, tipe akun `CASH`/`BANK`/`EWALLET`, kas awal / opening balance).
  2. **Frontend Hooks (`apps/web/hooks/useAccounts.ts`):** Mengimplementasikan TanStack Query hooks `useAccounts`, `useCreateAccount`, `useUpdateAccount`, `useDeleteAccount`.
  3. **Navigasi (`apps/web/lib/nav-config.ts`):** Mendaftarkan route `/accounts` (Metode Pembayaran) untuk role ADMIN dan OWNER. Update unit tests di `nav-config.test.ts`.
  4. **Database Seed (`apps/api/prisma/seed.ts`):** Menambahkan seed akun default untuk QRIS dan E-Wallet serta memperbarui penamaan Transfer Bank.
  5. **DESIGN.md Update:** Memperbarui spesifikasi layout dan komponen POS sesuai referensi Konteks POS 3-Zone layout.
- **Status:** Done
- **Handoff notes:** `turbo run lint typecheck test` all green (web: 256 unit tests passed, api: 145 unit tests passed).

---

### TASK-025 — Phase 10a: Profile Self-Service (name, password, delete-own-account)

- **Date:** 2026-08-18
- **Module / Phase:** Phase 10a of the HR-lite feature set (plan: `list-fitur-yang-kurang` / `docs/plannings/phase-10a-profile-self-service.md`) — second of six phases (9–13, with 10 split into 10a/10b) covering employee/branch management, profile self-service, attendance/device tracking, leave requests, and a help page.
- **Objective:** Give every authenticated role (KASIR, ADMIN, OWNER) a self-service profile page to change their own display name, change their password (reusing the existing `PATCH /auth/password` endpoint), and soft-deactivate their own account ("Hapus Akun Saya" in the UI) — with the critical guard that the last active OWNER cannot deactivate themselves (ADR-011 §5: would leave the business with no one who can create/manage staff). `Sale.userId` is an audit trail (ERD §7 note 3) — no hard delete, ever.
- **Relevant docs:** ADR-011 (role/branch rules, self-service scope), ERD §7 note 3 (no hard delete — `Sale.userId` audit trail), System Design v4 §5 (route/role table — neither `(back-office)` nor `(pos)` admits all three roles), Playbook §4 (Zod contracts), Playbook §8 (guards).
- **What was done:**
  1. **API contracts (`packages/api-contracts/src/auth.schema.ts`):** Added `UpdateSelfSchema` (`{ name: string.trim().min(1).max(120) }`) + `UpdateSelf` type — name only, no email (email change stays OWNER-administered via `PATCH /users/:id`). Same low-risk additive shape as Phase 9's `UpdateUserSchema` extension, pre-approved at go/no-go checkpoint.
  2. **Backend DTO (`apps/api/src/modules/auth/auth.dto.ts`):** Added `UpdateSelfDto` re-exporting the contract schema.
  3. **Backend exceptions (`apps/api/src/modules/auth/auth.exceptions.ts` — new file):** Created `LastActiveOwnerException` extending `BadRequestException` with the guard message, following the `users.exceptions.ts` pattern (Playbook §6 — named domain exceptions instead of bare framework exceptions).
  4. **Backend service (`apps/api/src/modules/auth/auth.service.ts`):** Added `updateProfile(userId, dto)` — simple name update; added `deactivateSelf(userId)` — soft-deactivates (`isActive: false`, clears `refreshTokenHash`, bumps `tokenValidFrom`), with `if (user.role === 'OWNER') { if (activeOwnerCount <= 1) throw LastActiveOwnerException() }` guard.
  5. **Backend controller (`apps/api/src/modules/auth/auth.controller.ts`):** Added `PATCH /auth/me` (`updateProfile`), `PATCH /auth/deactivate` (`deactivateSelf` + clears auth cookies).
  6. **Backend e2e test (`apps/api/test/profile-self-service.e2e-spec.ts` — new file):** 6 tests covering KASIR name change, empty-name rejection, unauth rejection; last-active-OWNER rejection, normal OWNER self-deactivation, session termination (old cookie unauthorized after deactivation). **One test-order bug found and fixed during execution:** the `activeOwnerCount` guard counts *all* active OWNERs in the table, so the `soleOwner` fixture was only truly "last" after the other two fixture OWNERs (`ownerA`, `ownerB`) had deactivated themselves in preceding tests — reordered the three deactivate tests to run: session-end → ownerA deactivation → soleOwner last-OWNER rejection (last). `beforeAll`/`afterAll` amendments deactivate/restore pre-existing seeded OWNERs so the test is environment-independent.
  7. **Frontend route group (`apps/web/app/(shared)/layout.tsx` — new file):** New route group admitting all three roles via `requireRole(['KASIR', 'ADMIN', 'OWNER'])` + `AppShell`. Neither existing group (`(back-office)`: ADMIN/OWNER only; `(pos)`: KASIR only) could host a page needed by all roles. Phase 13 (Help page) reuses this same group. Approved at go/no-go checkpoint.
  8. **Frontend hooks (`apps/web/hooks/useProfile.ts` — new file):** `useCurrentUser()`, `useUpdateProfile()`, `useChangePassword()`, `useDeactivateSelf()` — TanStack Query hooks against the new endpoints.
  9. **Frontend profile page (`apps/web/app/(shared)/profile/page.tsx` + `ProfileClient.tsx` + `DeleteMyAccountDialog.tsx` — new files):** Three-section UI: name form (pre-filled, validation via `UpdateSelfSchema`), password form (old + new + confirm, validation via extended `ChangePasswordSchema`), danger zone with "Hapus Akun Saya" button opening a confirm dialog. Dialog copy adapted from `DeactivateConfirmDialog.tsx` (first-person, soft-deactivate semantics). `router.refresh()` on save updates Topbar display name.
  10. **Topbar (`apps/web/components/shell/Topbar.tsx`):** Added `User` icon import; dropdown now shows "Profil Saya" link (href `/profile`) between the email label and Logout, accessible to all three roles.
- **Decisions made during this task:**
  1. **Go/no-go checkpoints re-confirmed before execution** (plan §0.1): (a) additive `UpdateSelfSchema` contract change approved; (b) new `(shared)` route group approved over duplicating `/profile` under both existing groups — structural decision, not just a file addition.
  2. **Prettier reformatting (4 spots, formatting only):** plan's literal code violated repo's prettier config (printWidth 80); applied only the lint-required fixes — `updateProfile` signature collapsed to one line, e2e fixture object/array reformatted. No semantic change.
  3. **E2e test-order bug (plan §6 defect):** plan's test order assumed `soleOwner` was "last active OWNER" among fixtures, but guard counts ALL active OWNER rows in table. Discovered when 2/6 tests failed; fixed by reordering deactivate tests to run in dependency order (ownerB session test → ownerA deactivation → soleOwner rejection last). Added explanatory comment. **Lesson:** even a reviewed plan's literal test order can carry an internal contradiction between what the guard counts and what the test assumes — running the e2e suite is not optional.
- **Status:** Done
- **Handoff notes:** `pnpm --filter @ohmypos/api-contracts build`, `pnpm turbo run lint typecheck --filter=@ohmypos/api-contracts --filter=api --filter=web`, `pnpm --filter api test:e2e -- profile-self-service.e2e-spec.ts` (6/6), `pnpm turbo run test` (api: 145 unit + 6 new e2e, web: 254 unit) — all green. Manually verified in-browser via Playwright skill (step §8): KASIR/ADMIN/OWNER all see "Profil Saya" in Topbar dropdown and reach `/profile`; name change → Topbar refreshes; password change with wrong/right old password both verified; self-deactivation logs out to `/login` and OWNER can see deactivated account at `/users`; last-active-OWNER guard surfaces error in dialog. One thing discovered, not fixed: the plan's "current" content for `auth.schema.ts` omitted the file's existing header comment (`/** Auth request/response shapes (ADR-011 §3)... */`) — cosmetic, no drift.

---

### TASK-024 — Phase 9: User & Branch Management UI (`(back-office)/users`, `(back-office)/branches`)

- **Date:** 2026-08-18
- **Module / Phase:** Phase 9 of the HR-lite feature set (plan: `list-fitur-yang-kurang`) — first of six phases (9–13, with 10 split into 10a/10b) covering employee/branch management, profile self-service, attendance/device tracking, leave requests, and a help page.
- **Objective:** Give OWNER a working UI to create/edit/deactivate/reactivate staff, assign/reassign a KASIR's branch, and CRUD branches — closing the gap where `UsersService`/`BranchesController` were fully built but `/users` was a stub and `/branches` had no frontend at all.
- **Relevant docs:** ADR-011 (role/branch rules), ERD §7 note 3 (no hard delete — `Sale.userId` is an audit trail), System Design §5 (route/role table), Playbook §4 (Zod contracts), Playbook §8 (guards).
- **What was done:** Extended `UpdateUserSchema` (`packages/api-contracts/src/user.schema.ts`) with optional `role`/`branchId` — approved separately as an API-contract change before implementation. Fixed `branchRule`'s generic signature (`user.schema.ts`) so `zodResolver` type-infers correctly against the refined schema; this was a latent typing bug in the pre-existing helper that had never been exercised because no form had used `CreateUserSchema` before. `UsersService.update()` now re-validates `assertRoleBranchConsistent` against the **merged** role/branchId (existing + patch), not just the fields sent, and checks the target branch exists. Frontend: `UsersClient.tsx`/`UsersTable.tsx`/`CreateUserDialog.tsx`/`EditUserDialog.tsx`/`DeactivateConfirmDialog.tsx` and the equivalent `BranchesClient.tsx`/`BranchesTable.tsx`/`BranchFormDialog.tsx`/`DeleteConfirmDialog.tsx`, following the Phase 8e–8i server-component/client-component/TanStack-Query-hook pattern exactly (`hooks/useUsers.ts`, `hooks/useBranches.ts`). `/branches` added to `lib/nav-config.ts`'s OWNER array. New e2e suite `apps/api/test/user-branch-management.e2e-spec.ts` (8 tests) covering the merge-validation edge cases the schema layer can't catch on its own (promote without clearing branch, demote without assigning one, reassign between branches, unknown branch 404).
- **Decisions made during this task:** (1) "Hapus" in the UI calls `PATCH /users/:id/deactivate` under the hood, per user's explicit choice when this was scoped — no hard delete exists or was added (ERD §7 note 3 stands). (2) Create/edit user dialogs are two separate components rather than one dual-schema dialog, because `CreateUserSchema` requires `password` and `UpdateUserSchema` doesn't — forcing one shared Zod resolver would have meant a weaker type than either schema actually has. (3) Added `autoComplete="off"`/`"new-password"` to the create-user form fields after live browser testing showed Chrome's password manager autofilling the logged-in OWNER's own saved name/password into the new-user form — a real UX/security footgun for a form whose entire purpose is minting a *different* person's credential, not a hypothetical.
- **Status:** Done
- **Handoff notes:** `turbo run lint typecheck test` green (web: 254 unit tests incl. updated `nav-config.test.ts`; api: 203 e2e tests incl. the new 8; both packages lint/typecheck clean). Manually smoke-tested in a real browser end-to-end: create → edit (assign branch) → deactivate → reactivate, all verified against the running dev stack, not just automated tests. **One thing discovered, not fixed, worth flagging:** the local dev seed (`prisma/seed.ts`) writes KASIR rows via `prisma.user.createMany` directly, bypassing `UsersService` — two seeded KASIR accounts (`kasir@ohmypos.local`, `qa.kasir@ohmypos.local`) had `branchId: null` in the dev DB, which violates the invariant `UsersService`/`assertRoleBranchConsistent` enforces everywhere else. Logged as DEBT-023. Not a Phase 9 regression — Phase 9's new Edit UI is in fact the first tool that can fix it, and was used to fix one of the two live during testing. **What Phase 10a needs to know:** the `EditUserDialog` pattern (role-conditional branch select, merge-aware validation) is the template for any future self-service profile form; `PATCH /auth/password` already exists server-side, only the UI is missing.

---

### TASK-023 — Phase 8i: Dashboard Overview screen (`GET /reports/cash-balance` + `(back-office)/dashboard`)

- **Date:** 2026-08-18
- **Module / Phase:** Phase 8i — new `GET /reports/cash-balance` endpoint (Dashboard 3) and the OWNER-only `(back-office)/dashboard` overview screen (Dashboard 1).
- **Objective:** Give OWNER a single landing screen summarizing cash, this month's P&L, supplier debt, and low-stock — combining a new running-cash-balance report with three already-existing endpoints (`profit-loss`, `daily-income`, `/payables/summary`, `/inventory/summary`). Executed from `docs/plannings/phase-8i-dashboard-overview.md` (an approved, fully-literal implementation plan that was itself reviewed and amended for four verified defects before execution — see below).
- **Relevant docs:** PRD §5.4; ADR-004 (Kas Awal), ADR-008 (query-time reports), ADR-017 (P&L composition), ADR-018 (WIB report period); System Design v4 §5/§6.6; AGENTS.md glossary (Kas Awal, Admin/Owner route scope).
- **What was done:**
  1. **`apps/api/src/common/period.ts`:** added `todayWib(now: Date): string` (WIB calendar day for an instant — stays pure, no internal `Date.now()`) and exported `WIB_OFFSET_MS`. Unit tests added to `period.spec.ts` (same-day, roll-over, early-UTC cases).
  2. **`packages/api-contracts/src/report.schema.ts`:** added `CashBalanceQuerySchema` (`asOfDate` optional), `CashBalanceAccountRowSchema`, `CashBalanceResponseSchema` (`{ asOfDate, timezone, totalBalance, accounts[] }`).
  3. **Backend — `reports.dto.ts`/`.controller.ts`/`.mapper.ts`/`.service.ts`:** new `GET /reports/cash-balance` (`@Roles('OWNER')`, no `BranchScopeGuard` — deliberate, same reasoning as the other five report endpoints). `ReportsService.cashBalance` is a raw-SQL running balance — `Account.openingBalance` + Σ(INFLOW) − Σ(OUTFLOW) strictly before `asOfDate`'s WIB-midnight cutoff — deliberately **not** built on the shared `ledgerScope` helper (unbounded lower edge, no branch filter). Added 7 e2e cases (34–40: zero-activity account, inflow/outflow sum, asOfDate exclusivity boundary, default-to-today, schema conformance, RBAC).
  4. **Frontend hooks — `apps/web/hooks/useReports.ts`:** added `useCashBalance(asOfDate?)` to the **existing** Phase 8g file (see "Decisions" below) — did not touch `useProfitLoss`/`useDailyIncome`'s existing `(filters, enabled)` signature.
  5. **New route/components:** `app/(back-office)/dashboard/page.tsx` (OWNER-only, `requireRole(['OWNER'])`), `components/dashboard/DashboardKpiCards.tsx` (4 KPI cards: Kas, Laba Bersih Bulan Ini, Utang Supplier, Stok Rendah), `components/dashboard/DashboardClient.tsx` (KPI row + daily-income trend chart, reusing the existing `ReportLineChart`/`ChartEmptyState` from `components/reports/ReportChart.tsx` — no new chart component, no new dependency), plus `DashboardKpiCards.test.tsx`.
  6. **Nav + landing redirect:** `lib/nav-config.ts` — `/dashboard` added as OWNER's first nav item (ADMIN/KASIR unchanged). `app/page.tsx` — root now routes OWNER → `/dashboard`, KASIR → `/sales`, ADMIN → `/master-data` (previously ADMIN and OWNER both landed on `/master-data`).
- **Decisions made during this task:**
  1. **Pre-execution plan review caught 4 verified defects, fixed in the plan doc before any code was written:** (a) the plan's own §0 pre-check asserted `InventorySummaryResponse`'s array field was `.rows`; the live schema (`inventory-summary.schema.ts`) has `.data` — three usage sites corrected. (b) the plan assumed `recharts` needed installing behind a governance checkpoint; it was already a dependency since commit `fc80502` (Phase 8g) — the install step was replaced with a verify-only `grep`. (c) the plan's §4 spec'd a new bespoke `DailyIncomeChart.tsx` reimplementing axis/tooltip/theme logic that `ReportLineChart` already provides — removed, §3.4 rewired to reuse it. (d) the e2e `cleanup()` helper only deleted `Account` rows prefixed `'RP '`; the new `'CB '`-prefixed fixture accounts would have leaked across test runs — added the missing delete.
  2. **A fifth defect surfaced only during execution, not the review pass:** the plan's §1.7 literally specified `const cutoff = resolveReportRange(asOfDate, asOfDate).to` for the cash-balance cutoff. `.to` is the *exclusive upper bound the day after* `asOfDate` (per `period.ts`'s own contract), which would have counted entries dated *on* `asOfDate` as already-elapsed — contradicting both the response schema's own doc comment ("strictly before asOfDate's exclusive upper bound") and e2e Case 36's explicit assertion that same-day entries are excluded. Running the e2e suite caught this immediately (Case 36 failed with the wrong balance); fixed to `.from`. Lesson: even a reviewed, amended plan's literal code can carry an internal contradiction between what one section's SQL does and another section's test expects — running the tests it specifies is not optional, even for "already-verified" plan sections.
  3. **`useReports.ts`/`useReports.test.ts` were not new files, contrary to the plan's premise.** They already existed (Phase 8g, commit `fc80502`) with `useProfitLoss(filters: ReportFilters, enabled)` / `useDailyIncome(filters, enabled)` consumed by `ReportsClient.tsx` and `TopProductsView.tsx`. Overwriting them with the plan's assumed two-string-argument signature would have broken those live consumers. Resolution: added `useCashBalance` alongside the existing hooks without changing their signature, and adapted `DashboardClient.tsx` to call `useProfitLoss({ startDate, endDate })`/`useDailyIncome({ startDate, endDate })` (the real signature) instead of the plan's `useProfitLoss(startDate, endDate)`. No other file in this repo assumes the plan's hook signature, so this was a zero-blast-radius adaptation.
- **Status:** Done
- **Handoff notes:** `pnpm --filter api test` (145/145), `pnpm --filter api test:e2e -- reports.e2e-spec` (57/57, including the 7 new cash-balance cases), `pnpm --filter web test` (254/254 across 38 files), and `pnpm turbo run lint typecheck` all green across all 5 packages. Manually verified in-browser (not just automated tests) via `claude-in-chrome`: OWNER login renders the dashboard with real seeded data (KPI cards, chart, "Perlu Perhatian" panel with a working link to `/expenses`); ADMIN and KASIR direct-navigating to `/dashboard` are both server-side redirected away (`requireRole` guard) rather than seeing even a flash of the page. Two things worth knowing for whoever next touches `useReports.ts`: (1) it now serves two different call conventions historically — `ReportFilters`-object hooks (profit-loss, product-profit, income-by-payment-method, top-products, daily-income) and one optional-single-arg hook (`useCashBalance`) — this asymmetry is intentional (cash-balance has no date range, just a single `asOfDate`), not an inconsistency to "fix"; (2) `CashBalanceQuerySchema`'s `asOfDate` is a WIB calendar-day cutoff, and the endpoint has **no `BranchScopeGuard`/branch filter by design** — `Account.openingBalance` carries no branch (ERD §3), so branch-scoping only the ledger side while leaving opening balance unscoped would silently misstate the total; do not add a `branchId` query param to this endpoint without revisiting that reasoning first.

### TASK-022 — Phase 8j: Frontend Reconciliation Screen (`(back-office)/reconciliation`)

- **Date:** 2026-08-18
- **Module / Phase:** Phase 8j — `apps/web` Reconciliation back-office screen
- **Objective:** Build the ADMIN/OWNER-only reconciliation UI per PRD §5.7 — bank statement CSV import, auto-match review queue, manual split allocation, and a filterable bank-transaction table with a summary strip — against the reconciliation backend that has been live since Phase 1–2 (`apps/api/src/modules/{import,matching,allocation,reconciliation}`). Executed from `docs/plannings/phase-8h-reconciliation.md` (an approved, fully-literal implementation plan).
- **Relevant docs:** PRD §5.7; System Design v4 §6.5; ADR-004, ADR-008, ADR-010, ADR-011, ADR-012; ADR-019 (new — see below); ERD v3 §2/§6 (`BankTransaction`, `Allocation`); DESIGN.md §34/§35 (split-allocation dialog).
- **What was done:**
  1. **`lib/api.ts`:** `doFetch` now omits the JSON `Content-Type` header for a `FormData` body so the browser can set the multipart boundary itself — the only caller is the CSV import. JSON callers are unaffected (+2 tests in `api.test.ts`).
  2. **`lib/reconciliation/allocation-draft.ts` + test:** pure arithmetic for the split-allocation running total (`summariseDraft`), copying the backend's allocation-sum invariant verbatim — strict `>` boundary, ACTIVE-only committed sum, per-line validation states, and a `toCreateAllocationPayload` builder. All money arithmetic goes through `lib/decimal.ts`'s BigInt `Fixed`, never `Number`.
  3. **`lib/reconciliation/match-candidates.ts` + test:** turns a `MatchCandidate` (which carries a plural `bankTransactionIds` and one aggregate `matchedAmount`, not per-transaction amounts) into a `CreateAllocation` batch by looking up each transaction's own amount and cross-checking the sum against the engine's total before submitting.
  4. **`hooks/useReconciliation.ts`:** one `useQuery`/`useMutation` per endpoint (summary, transactions, pending-review, transaction-allocations, ledger-entry candidates; import, propose, reset, reject, create-allocations, revoke-allocation), following the established Phase 8a pattern. `useProposeMatches` is deliberately a mutation, never a query, because `POST /matching/propose` writes (`UNRESOLVED → PENDING_REVIEW`).
  5. **`components/reconciliation/`:** `BankStatementImportCard.tsx` (CSV upload, BCA/MANDIRI format select, 5 MB client-side size guard), `MatchReviewQueue.tsx` (propose-on-click, accept-builds-a-batch, per-candidate reject — see decisions below, confirm-gated bulk reset), `ReconciliationSummaryCards.tsx` (status counts + bank/ledger/variance from `GET /reconciliation/summary`, server-computed per ADR-008), `SplitAllocationDialog.tsx` (the centerpiece — server-confirmed committed base + client-projected draft rows, submit disabled while over-allocated), `BankTransactionsTable.tsx` (shared `DataTable`).
  6. Wired `app/(back-office)/reconciliation/page.tsx` to render a new `ReconciliationClient.tsx` (filters, summary, import card, match queue, transaction table + pagination, split dialog), replacing the Phase-1 placeholder sentence. `requireRole(['ADMIN','OWNER'])` guard untouched; a 403 reaching the client (session role changed after render) collapses the whole body to one Alert rather than four separate widget errors.
  7. Test suites: `allocation-draft.test.ts`, `match-candidates.test.ts`, `SplitAllocationDialog.test.tsx`, `MatchReviewQueue.test.tsx`, `BankStatementImportCard.test.tsx`, `ReconciliationClient.test.tsx`, plus the 2 new `api.test.ts` cases.
- **Decisions made during this task:**
  1. **Split-allocation running-total feedback (plan §2.1, "Decision 1"):** server-confirmed committed base (`GET /allocations/transaction/:id`, ACTIVE rows only) + local draft state, combined by one pure function (`summariseDraft`), over an optimistic-cache approach or submit-each-line-immediately — chosen so an abandoned split costs nothing and the `==` boundary (exact allocation is the success case, not an error) stays expressible.
  2. **Split UI location (plan §2.2):** a modal `Dialog` opened from a transaction row, matching every other write surface in this codebase (`PayableSettlementDialog`, `ProductFormDialog`), over a permanent third pane or a `Sheet`.
  3. **Ledger-entry candidate picker (plan §2.3, superseded mid-plan):** the plan's original design (unbounded `limit=100` fetch, client-side date-proximity sort only) was superseded before implementation — see "Backend expansion" below. The picker now filters server-side by an inclusive ±30-day window around the anchor transaction's date (`LEDGER_CANDIDATE_WINDOW_DAYS` in `useReconciliation.ts`), deliberately wider than the matching engine's 3-day auto-match tolerance, with the client-side nearest-date-first sort retained as a secondary refinement within that narrower window.
  4. **"Abaikan" (reject) semantics (plan §2.4, superseded mid-plan):** the plan's original "client-side dismissal only, writes nothing" design was superseded before implementation — see "Backend expansion" below. "Abaikan" now calls the real per-candidate reject endpoint once per `bankTransactionId` in the candidate (an AGGREGATION candidate can span several) and only removes the candidate from the queue once every call succeeds; a partial failure leaves the candidate visible with an error rather than silently dropping a transaction that is still `PENDING_REVIEW`.
  5. **403 handling (plan §2.5):** one page-level guard — if any reconciliation query fails with `ApiError.status === 403`, the whole screen body collapses to a single Alert, rather than four separate per-widget error states.
  6. **Backend expansion (done by the orchestrating session, not deferred as tech debt):** two backend gaps the plan's DRAFT had flagged as out-of-scope tech debt were actually closed before this task's implementation began: `POST /matching/reject/:bankTransactionId` (guarded ADMIN/OWNER, 404 if the transaction doesn't exist, 409 if it isn't `PENDING_REVIEW`) was added to `matching.controller.ts`/`matching.service.ts`; and `LedgerEntryQuerySchema` gained optional `startDate`/`endDate` (inclusive `entryDate` bounds), wired through `LedgerEntriesService.findAll`'s `where`. The frontend was built against these endpoints directly rather than against the plan's original workarounds. The "one `LedgerEntry` may legally be allocated by more than one `BankTransaction`" gap (plan §1.6/§2's tech debt #2) was likewise not logged as debt — it is recorded as an accepted v1 risk in **ADR-019**, and the `SplitAllocationDialog`'s advisory-only "•" marker on already-allocated entries (never blocking, per ADR-019) was built exactly as the plan specified.
- **Status:** Done
- **Handoff notes:** `pnpm --filter web test`, `pnpm turbo run lint typecheck test --filter=web`, and `pnpm --filter web build` all green. Not touched: `apps/api/**`, `packages/api-contracts/**`, `packages/ui/**` (all already correctly updated for the backend expansion ahead of this task). Three non-obvious backend behaviours the screen is built around, worth knowing before touching this screen again: (1) `POST /matching/propose` **writes** — it flips every matched transaction `UNRESOLVED → PENDING_REVIEW`, so it is a mutation behind an explicit button, never a `useQuery`; (2) proposed candidates are **not persisted** — they exist only in that one HTTP response, so reloading the page empties the queue and re-running propose will not re-surface transactions it already moved to `PENDING_REVIEW` (the only way back is Reset or the new per-candidate reject); (3) `BankTransaction.status` is **entirely trigger-derived** (`sync_transaction_status`) — the UI never computes or predicts it, always refetches after a write. Remaining tech debt: `AllocationWithLedgerEntry` (the `Allocation`-with-`ledgerEntry` composed response type in `useReconciliation.ts`) still has no dedicated Zod schema — logged as DEBT-022.

### TASK-021 — Phase 8g: Frontend Reports Screen (`(back-office)/reports`, Dashboard 3)

- **Date:** 2026-08-18
- **Module / Phase:** Phase 8g — `apps/web` Reports back-office screen
- **Objective:** Build the OWNER-only Dashboard 3 reports UI per PRD §5.4 — P&L, sales-per-product profit, income by payment method, top 10 products, and daily income, all filterable by date range and branch, with charts — against the five `GET /reports/*` endpoints Phase 7 already shipped (`apps/api/src/modules/reports/*`). Pure frontend-rendering work; no backend/contract change.
- **Relevant docs:** PRD §5.4; `docs/plannings/phase-7-reporting.md` (exact API shapes, ADR-017 P&L composition, ADR-018 WIB report boundaries); DESIGN.md §36/§37 (Reports density, Flow Indicator) and §51 (approved mockup, reference-not-spec); AGENTS.md governance (new-dependency approval gate).
- **What was done:**
  1. **New dependency (approved):** added `recharts@^3.10.1` to `apps/web` — no charting library existed in `packages/ui` or `apps/web` beforehand; verified React 19 peer-dep compatibility before installing.
  2. **`hooks/useReports.ts`:** 5 TanStack Query hooks (`useProfitLoss`, `useProductProfit`, `useIncomeByPaymentMethod`, `useTopProducts`, `useDailyIncome`), each building its query string from a shared `{startDate, endDate, branchId?}` filter shape (+ `rankBy`/`limit` for top-products), `enabled`-gated per active tab so switching tabs doesn't fire five requests at once. Test suite `useReports.test.ts`.
  3. **`components/reports/`:** `ReportFilterBar.tsx` (shared date-range + branch `Select`, URL-synced, `Semua Cabang` sentinel for the omitted-branchId case); `ReportChart.tsx` (shared Recharts bar/line wrappers themed off `packages/ui`'s CSS-variable design tokens, one custom tooltip, one `ChartEmptyState`); `ProfitLossView.tsx`, `ProductProfitView.tsx`, `IncomeByPaymentMethodView.tsx`, `TopProductsView.tsx`, `DailyIncomeView.tsx` (one per report, each pairing a chart with the shared `DataTable`); `ReportsClient.tsx` composing the filter bar + a `Tabs` shell (Phase 8f pattern) + the five views, URL-synced (`startDate`, `endDate`, `branchId`, `tab`).
  4. **Shared helpers:** `formatPercent` (`lib/formatters.ts`) for the already-computed `marginPct`/`sharePct`/`netMarginPct` fields; `getFlowIndicatorClassesForAmount` (`lib/vocabulary.ts`) — a sign-based sibling to the existing direction-based `getFlowIndicatorClasses`, for report figures that are legitimately negative (grossProfit/netProfit/netCashFlow, ADR-017 §2) rather than INFLOW/OUTFLOW literals.
  5. Wired `app/(back-office)/reports/page.tsx` to render `<ReportsClient />` in a `Suspense` boundary, replacing the Phase-3 placeholder; `requireRole(['OWNER'])` guard untouched.
  6. Test suites: `ReportFilterBar.test.tsx`, `ProfitLossView.test.tsx`, `ProductProfitView.test.tsx`, `IncomeByPaymentMethodView.test.tsx`, `DailyIncomeView.test.tsx`, `TopProductsView.test.tsx`, plus additions to `formatters.test.ts` and `vocabulary.test.ts` — filter/formatting correctness and representative + empty-payload rendering, not chart pixel output, per the reviewer's steer.
- **Decisions made during this task:**
  (1) Chart library: Recharts over hand-rolled SVG or visx — user's explicit choice among the 3 options presented (AGENTS.md's ≥3-option requirement), approved as a new dependency.
  (2) Screen structure: one page with a `Tabs` shell and one shared filter bar (matches Phase 8f precedent) over separate sub-routes per report or an all-stacked no-tabs page — only the active tab's query is `enabled`.
  (3) `TopProductsView` is the one view that calls its own `useTopProducts` hook internally (owns local `rankBy`/`limit` UI state) instead of receiving `data`/`isLoading` as props like the other four — `rankBy` is specific to that one report, not part of the shared filter bar.
  (4) P&L has no per-day series in its API response (single aggregate for the range) — its chart is a composition bar (income/COGS/opEx/net), not a trend line; the literal PRD "trend line" chart belongs to Daily Income, the one report with a real per-day series. No client-side recomputation was introduced to fake a P&L trend.
  (5) Explicitly out of scope, flagged rather than silently built: the mockup's XLSX export / "Bagikan laporan" buttons (no backend endpoint, not in PRD §5.4) and its per-branch side-by-side comparison table (PRD asks for filter *by* branch, not a simultaneous multi-branch matrix) — DESIGN.md §51/§52, mockup is reference not spec.
- **Status:** Done
- **Handoff notes:** `pnpm turbo run lint typecheck test build` green; 205 frontend tests pass (`apps/web`). Manually verified against the running dev stack (Chrome browser automation, Playwright MCP unavailable this session): all 5 tabs render real data from the live API with correct Flow Indicator sign-coloring, the branch filter and `rankBy` control both trigger correctly-parameterized requests (confirmed via network inspection), and ADMIN is still redirected away from `/reports` (guard untouched, re-verified live). **One real bug found and fixed during that manual pass:** the default date-range helper in `ReportsClient.tsx` built `YYYY-MM-DD` via `date.toISOString().slice(0, 10)`, which reads UTC and silently shifts the "1st of the month" default backward by a day in any positive-UTC-offset timezone — including WIB (UTC+7), this app's actual target timezone (ADR-018). Fixed to build the date string from local `getFullYear()`/`getMonth()`/`getDate()` components instead, the same pattern `DatePicker` (`packages/ui`) already used correctly. Worth grepping for `toISOString().slice(0, 10)` elsewhere in `apps/web` if a similar default-date helper gets added later — this is an easy mistake to reintroduce.

### TASK-020 — Phase 8e: Frontend Opening Stock Screen (`(back-office)/inventory`)

- **Date:** 2026-08-17
- **Module / Phase:** Phase 8e — `apps/web` Opening Stock back-office screen
- **Objective:** Build the OWNER-only monthly opening stock worksheet entry screen per PRD §5.5, Phase 6 plan, and DESIGN.md: month-based period navigation with URL sync, bulk worksheet table displaying raw material carry-forward balances, quantity input pre-fills, and conditional unit price entry (rendered as active CurrencyInput when `requiresUnitPrice: true`, or locked badge when purchase already priced the material in that period).
- **Relevant docs:** PRD §5.5; System Design §5, §6.4; ADR-004, ADR-010, ADR-011, ADR-016, ADR-018; Playbook §4, §5, §8, §10; DESIGN.md §6/§32; Phase 6 plan `phase-6-inventory.md`.
- **What was done:**
  1. **Data Hooks (`apps/web/hooks/useInventory.ts`):**
     - Created `useOpeningStockWorksheet(period)` calling `GET /inventory/opening-stock?period=YYYY-MM`.
     - Created `useUpsertOpeningStock()` calling `PUT /inventory/opening-stock` and invalidating the active period worksheet query cache on success.
     - Added test suite `hooks/useInventory.test.ts` covering both query and mutation workflows.
  2. **Components (`apps/web/components/` & `@ohmypos/ui`):**
     - Created Radix/shadcn UI primitive `packages/ui/src/components/ui/select.tsx` (`Select`, `SelectTrigger`, `SelectContent`, `SelectItem`, `SelectValue`).
       - Added curated shadcn/Radix components to `@ohmypos/ui`: `alert.tsx`, `popover.tsx`, `tooltip.tsx`, `separator.tsx`, `skeleton.tsx`, `scroll-area.tsx`, `sheet.tsx`, `calendar.tsx`, `date-picker.tsx` with DESIGN.md tokens.
       - Refactored `MobileNavDrawer.tsx` from hand-rolled overlay div to shadcn `Sheet` (Radix Dialog) primitive with side="left" mobile drawer behavior.
      - `PeriodNavigator.tsx` now opens a month-grid popover instead of a date calendar — only month names rendered (no dates/days), with year prev/next header; clicking a month sets the period to `YYYY-MM` of the viewed year; prev/next month buttons retained.
      - Replaced all native `<input type="date">` with the shadcn `DatePicker` (Popover + Calendar) in `GeneralExpenseFormDialog.tsx` (entryDate), `PurchaseEntryFormDialog.tsx` (purchaseDate), and `PayableSettlementDialog.tsx` (settledAt).
      - Bumped vitest `testTimeout` to 15000ms in `apps/web/vitest.config.mts` — 5s default flaked under turbo's parallel CPU load with Radix popover/portal-heavy jsdom tests.
      - Fixed calendar popover jumpiness: `calendar.tsx` now renders a fixed 6-week grid (49 cells, trailing empty cells + uniform `h-8 w-8` cells) so the calendar height never varies between months and the Popover content stays anchored in place. `DatePicker` popover forced `side="top"` + `avoidCollisions={false}`.
      - 320px mobile support: calendar container changed from fixed `w-65` to `w-fit`, `PopoverContent` gained default `collisionPadding={8}`. Verified via Playwright at 320×700 — inventory, expenses, master-data (incl. Sheet drawer 272px), reports, reconciliation all show zero horizontal overflow; month-grid popover (22–312px) and calendar popover (42–284px) stay fully in viewport.
     - Refactored all screens and dialogs away from `NativeSelect` to full Radix `Select` primitive across the entire web app: `PeriodNavigator.tsx`, `RecipeEditorDialog.tsx`, `GeneralExpenseFormDialog.tsx`, `PurchaseEntryFormDialog.tsx`, and `PayableSettlementDialog.tsx`.
     - `OpeningStockWorksheetTable.tsx`: Bulk tabular form using React Hook Form + `zodResolver(UpsertOpeningStockSchema)` + `useFieldArray`. Renders material metadata, carry-forward balance, declared quantity input with decimal validation, conditional `CurrencyInput` for unit price or "Otomatis (Pembelian)" locked badge, and complete/partial declaration status badge.
     - `InventoryClient.tsx`: Client coordinator handling URL `?period=YYYY-MM` parameter synchronization, loading/error states, submission handling, and success/error alert banners.
  3. **Page Route (`apps/web/app/(back-office)/inventory/page.tsx`):**
     - Server Component with `requireRole(['OWNER'])` wrapping `InventoryClient` in React `Suspense`.
  4. **Verification & Tests:**
     - Component unit tests: `OpeningStockWorksheetTable.test.tsx` (5 tests passing).
     - Hook unit tests: `hooks/useInventory.test.ts` (2 tests passing).
     - Full monorepo verification: `pnpm turbo run lint typecheck test build` 100% green (15/15 tasks passing).
- **Decisions made during this task:**
  1. Approved Option 1 (React Hook Form with `useFieldArray` + `zodResolver(UpsertOpeningStockSchema)`), Option 1 (URL Query Parameter sync `?period=YYYY-MM`), and Option 1 (Smart pre-fill with locked purchase price badge).
  2. `requiresUnitPrice` respected strictly from backend without client-side recomputation.
- **Status:** Done
- **Handoff notes:**
  - `(back-office)/inventory` opening stock screen is operational and verified.
  - Next phase: Phase 8f (Frontend Inventory Summary).

### TASK-019 — Frontend Responsive Design (Mobile, Tablet, & Desktop Support)

- **Date:** 2026-08-17
- **Module / Phase:** Frontend (`apps/web` and `@ohmypos/ui`) Responsive Design Refactoring
- **Objective:** Implement complete mobile, tablet, and desktop responsive UX across OhMyPos: collapsible slide-over mobile drawer navigation with backdrop blur, responsive topbar with hamburger toggle, responsive 1/2/4-col KPI summary cards, horizontally scrollable tabs and tables, floating sticky bottom cart bar for mobile POS cashiering, and constrained responsive modal dialogs.
- **Relevant docs:** PRD §5; DESIGN.md; Engineering Playbook §5, §10; implementation plan `implementation_plan.md`.
- **What was done:**
  1. **Core UI Primitives (`packages/ui/src/components/ui/dialog.tsx`):**
     - Updated `DialogContent` with `w-[calc(100%-2rem)] max-w-lg max-h-[90vh] overflow-y-auto` to prevent viewport clipping and allow smooth vertical scrolling on small mobile screens.
  2. **Shell Layout & Navigation (`apps/web/components/shell/`):**
     - Created `MobileNavDrawer.tsx`: slide-over mobile drawer with ESC-key dismiss, body scroll locking, brand logo, user badge, navigation items, and logout action.
     - Updated `Sidebar.tsx`: hidden on `< md:` screens (`hidden md:flex`) and persistent on desktop.
     - Updated `Topbar.tsx`: hamburger trigger button on mobile (`md:hidden`), mobile logo header, and truncated user profile badge.
     - Updated `AppShell.tsx`: state management for mobile drawer and responsive content padding (`p-3.5 sm:p-6 overflow-x-hidden`).
  3. **POS Screen (`apps/web/components/pos/`):**
     - Added floating sticky bottom cart bar on mobile viewports (`lg:hidden`) displaying item count, total price in IDR, and smooth scroll button to cart panel.
     - Maintained desktop 2-column split view (`ProductGrid` on left, `CartPanel` on right) on `lg:` viewports.
  4. **Back-Office Screens & Dialogs (`apps/web/app/(back-office)/`):**
     - `MasterDataSummaryCards.tsx` & `PayablesTab.tsx`: Responsive grid cards (`grid-cols-1 sm:grid-cols-2 lg:grid-cols-4`).
     - `MasterDataClient.tsx` & `ExpensesClient.tsx`: Responsive segmented tabs with compact touch styling.
     - `PurchaseEntryFormDialog.tsx`: Responsive input grids (`grid-cols-1 sm:grid-cols-2` and `grid-cols-12`).
  5. **Verification:**
     - Vitest suite: 21 test files, 160 tests passing (100%).
     - Monorepo validation (`turbo run lint typecheck build test`): 15/15 tasks passing clean.
     - Playwright MCP responsive testing across Mobile portrait (375x667), Tablet (768x1024), and Desktop (1280x800).
- **Status:** Done
- **Handoff notes:** Frontend is fully responsive across mobile, tablet, and desktop screens. Ready for remaining feature phases.

### TASK-018 — Phase 8d: Frontend Purchases & Expenses Screens (`(back-office)/expenses`)

- **Date:** 2026-08-17
- **Module / Phase:** Phase 8d — `apps/web` Purchases & Expenses back-office screens
- **Objective:** Build the OWNER-only Purchases & Expenses back-office screen per PRD §5.3 and DESIGN.md: categorized general operational expense entry, raw material purchase recording with immediate-paid vs. unpaid (utang) branching (ADR-006), on-the-fly quick supplier creation, payables list with per-supplier running balance summaries, cross-tab unpaid purchase banner, and partial/full payable settlement with live remaining balance calculation and client-side over-settlement prevention.
- **Relevant docs:** PRD §5.3; System Design §5; ADR-006, ADR-010, ADR-011; Playbook §4, §5, §8, §10; DESIGN.md; DEBT-021; ERR-005.
- **What was done:**
  1. **Page shell & tabs (`apps/web/app/(back-office)/expenses/`):**
     - `page.tsx` enforcing `requireRole(['OWNER'])`.
     - `ExpensesClient.tsx` rendering 3 tabs: "Pengeluaran Umum", "Pembelian", and "Utang".
  2. **Components (`apps/web/components/expenses/`):**
     - `GeneralExpenseTab.tsx` + `GeneralExpenseFormDialog.tsx`: Lists OUTFLOW ledger entries, creates categorized expenses tied to branch and account.
     - `PurchaseEntryTab.tsx` + `PurchaseEntryFormDialog.tsx`: Multi-item purchase entry form with running total calculation, paid/unpaid toggle (hides account picker when UNPAID, shows when PAID per ADR-006), duplicate raw-material validation, and cross-tab banner on unpaid creation.
     - `SupplierQuickCreateDialog.tsx`: Modal to register new suppliers on-the-fly without leaving purchase entry.
     - `PayablesTab.tsx` + `PayableSettlementDialog.tsx`: Supplier running balance cards, payables table with status badges (`Belum Lunas`, `Sebagian`, `Lunas`), and modal for partial/full settlement with live "Sisa Setelah Bayar" calculation and client-side overage block (`lib/decimal.ts`).
     - `CentralBranchTag.tsx`: Badge indicator for central vs branch purchases.
  3. **Data Hooks (`apps/web/hooks/useExpenses.ts`):**
     - Reference data hooks: `useCategories`, `useAccounts`, `useBranches`.
     - Ledger hooks: `useLedgerEntries`, `useCreateLedgerEntry`.
     - Supplier hooks: `useSuppliers`, `useCreateSupplier`.
     - Purchase hooks: `useSupplierPurchases`, `useCreateSupplierPurchase`.
     - Payable hooks: `usePayables`, `usePayablesSummary`, `useSettlePayable`.
  4. **Tests & Monorepo Validation:**
     - 6 unit test suites covering expenses: `GeneralExpenseFormDialog.test.tsx`, `PurchaseEntryFormDialog.test.tsx`, `SupplierQuickCreateDialog.test.tsx`, `PayableSettlementDialog.test.tsx`, `PayablesTab.test.tsx`, and `hooks/useExpenses.test.ts`. Total: 21 test files, 160 tests in web, all passing.
     - Full monorepo validation `turbo run lint typecheck test build` 100% clean (15/15 tasks).
     - Live MCP Playwright E2E smoke pass through the full golden path: General expense entry → Unpaid raw material purchase → Cross-tab banner redirection → Partial payable settlement → Automatic OUTFLOW ledger entry creation.
  5. **Tech Debt & Error Logs:** Logged `DEBT-021` (deferred supplier master data edit/delete UI) in `08 - Tech_Debt_Log.md` and `ERR-005` in `06 - Error_Log.md`.
- **Decisions made during this task:**
  1. Fixed-point decimal arithmetic (`lib/decimal.ts`) was used for settlement balance subtraction and purchase totals to avoid floating-point inaccuracies, matching Playbook §5.
  2. Supplier edit/delete master data table deferred to post-v1 backlog (`DEBT-021`); quick-create modal satisfies the purchase entry operational flow cleanly.
- **Status:** Done
- **Handoff notes:** All Phase 8d deliverables, unit tests, monorepo checks, and Playwright E2E smoke tests are complete and verified. Ready for the next phase.

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
  7. Performed query execution measurements (1–3 ms on 1-month and 1-year ranges) and recorded metrics in `docs/08 - Tech_Debt_Log.md` (DEBT-001) and `docs/01 - System_Design.md` §11. Added DEBT-016 (originally logged as "DEBT-011"; the ID collision this created was fixed the same day by renumbering — see TASK-013 below) for unpaginated report rows.
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

### TASK-011 — Phase 8f: Frontend — Inventory Summary Screen (Dashboard 5)

- **Date:** 2026-08-18
- **Module / Phase:** Phase 8f — `apps/web` inventory summary view (PRD §5.6 "Dashboard 5")
- **Objective:** Build the read-only inventory summary table (opening/in/out/closing per raw material per period + OK/low/out status) as a tabbed view on `(back-office)/inventory`, reusing the Phase 8a data-fetching pattern, `packages/ui` primitives, and the Flow Indicator motif.
- **Relevant docs:** PRD §5.6, Phase 6 plan §7.3/§7.4, ADR-004, ADR-008, ADR-010, DESIGN.md §28/§32/§37/§40, Playbook §10.
- **What was done:**
  1. Added `useInventorySummary(period)` hook + `INVENTORY_QUERY_KEYS.inventorySummary` in `apps/web/hooks/useInventory.ts`, calling `GET /inventory/summary?period=YYYY-MM` via `apiFetch` (Phase 8a pattern).
  2. Created `apps/web/components/inventory/InventorySummaryTable.tsx`: server-aggregated table rendering values verbatim (no client-side recomputation), Flow Indicator colors on the Masuk (`text-accent-inflow`) and Keluar (`text-accent-outflow`) columns, JetBrains Mono tabular numerals via `font-mono tabular-nums`, stock status badge via `getStockStatusBadgeClasses` + `formatStockStatus` ("Aman"/"Menipis"/"Habis"), client-side name search filter, loading skeleton and empty states.
  3. Restructured `apps/web/components/inventory/InventoryClient.tsx` into `Tabs` (Ringkasan Stok / Stok Awal) sharing the URL-driven `PeriodNavigator`; moved the existing worksheet notification/loading/error blocks into the Stok Awal tab. Page header retitled "Inventori" and `page.tsx` metadata updated.
  4. **No branch filter** — per ADR-004/Phase 6 §7.4 stock is a centralized pool; `GET /inventory/summary` has no branch dimension, so the prompt's "branch filter" line was corrected rather than implemented.
  5. Wrote `InventorySummaryTable.test.tsx` (7 cases): header/row rendering with `formatQuantity`, Flow Indicator classes on in/out cells, status badge label + semantic color, zero/negative quantity rendering, empty state, live search filter, and no-match empty state.
- **Decisions made during this task:**
  1. Option 1 selected (tabbed interface on `/inventory`) per user approval — summary and opening-stock worksheet live in one domain surface with a shared period navigator, per `docs/plannings/phase-08f-frontend-inventory-summary.md`.
  2. Both tab queries run on mount (Tabs content is unmounted when inactive but the tanstack query still fires) — accepted for master-data scale; no `enabled`-gating added to keep the hook signature stable.
- **Status:** Done
- **Handoff notes:** `pnpm --filter web test` green (24 files, 174 tests); `pnpm --filter web typecheck` green; `eslint` green on all touched files. Pre-existing lint error in `apps/web/components/master-data/RecipeEditorDialog.tsx:74` (`watchedItems` unused) was NOT touched (out of scope, unrelated to this task). No schema, dependency, or Git changes made. What next phases must know: the summary table reuses `getFlowIndicatorClasses`/`getStockStatusBadgeClasses` from `apps/web/lib/vocabulary.ts` (DEBT-003 pattern) — any new screen with movement numbers should reuse the same helpers rather than introducing a bespoke indicator.
- **Post-review amendment (2026-08-18):** per user request, feature-bearing tables must use the shadcn Data Table pattern instead of hand-rolled search inputs:
  1. Added dependency `@tanstack/react-table@^8.21.3` to `apps/web` (user-approved; governance gate for dependency additions; pinned to v8 deliberately — v9.1.2's `useTable`/`createCoreRowModel` API differs from the shadcn data-table pattern and is not yet documented everywhere).
  2. Created reusable `apps/web/components/ui/data-table.tsx` — TanStack Table + `@ohmypos/ui` table primitives (DESIGN.md §28): sortable headers via column defs, column-filter toolbar (search input bound to a filterable column via `searchColumn`), align via `meta.align`, consistent loading/empty states. This is the shared surface for search/filter/sort tables going forward (Phase 8g reports, reconciliation, etc.).
  3. Rewrote `InventorySummaryTable` on `DataTable` with `ColumnDef`s: sortable name/quantity/status columns, numeric `accessorFn` sorting (string values sort lexically, so values are converted to `Number`), Flow Indicator kept on in/out cell spans, status badge + search behavior preserved. Added a sort interaction test.
- **Handoff notes (amended):** tables needing search/filter/sort must use `apps/web/components/ui/data-table.tsx`, not a bespoke input. `meta.align: 'right'` is the convention for right-aligned numeric columns. `@tanstack/react-table` v8 is the pinned major — do not bump to v9 without re-verifying the data-table wrapper against the new `useTable` API.
- **Post-review amendment 2 (2026-08-18):** "use DataTable everywhere" — every display table in the app migrated off raw `@ohmypos/ui` Table markup onto the shared DataTable:
  1. Extended `components/ui/data-table.tsx`: `isLoading` (skeleton rows), `searchColumns: string[]` (multi-column search; single-column `searchColumn` removed), `meta.align: 'center'`, filter-aware empty state ("Tidak ditemukan data yang cocok dengan filter." when filters active vs `emptyMessage`), shared `SortableHeader` export (deduplicated from InventorySummaryTable).
  2. Migrated `GeneralExpenseTab`, `PayablesTab`, `PurchaseEntryTab` (fixer lane) and `RawMaterialsTable`, `ProductsTable` (parallel fixer lane): ColumnDef arrays, `accessorFn` numeric/date sorting, `meta.align` right/center, loading+empty via props, hand-rolled search inputs replaced by `searchColumns` (RawMaterials preserves name-OR-unit search via a custom `filterFn` because TanStack ANDs multiple column filters — verified against `table-core` source; Products searches name; expenses tables get no search as before). Aksi/action columns declared in-component where they close over dialog state setters (documented in both files).
  3. `OpeningStockWorksheetTable` deliberately NOT migrated: it is a form (react-hook-form fields + validation + row-level error state), not a display table; binding form field indexes to TanStack row order would be a correctness hazard. Flagged to user; no sort/search exists on it.
  4. Found pre-existing `RawMaterialsTable.test.tsx` / `ProductsTable.test.tsx` suites (8 tests) — still green after migration.
- **Handoff notes (amended 2):** rule of thumb for future tables — display tables with search/filter/sort use `components/ui/data-table.tsx`; form tables (editable inputs per row) stay raw `Table` markup. Numeric columns must sort via `accessorFn: (row) => Number(row.x)`. Multi-column search filters AND in TanStack — for OR semantics write a custom `filterFn` on one search column. `SortableHeader` now lives in `data-table.tsx`.
- **Status:** Done

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