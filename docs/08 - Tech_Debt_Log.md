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

### DEBT-057 — Running `pnpm --filter api test:e2e` twice inside 60s produces spurious failures

- **Date logged:** 2026-08-23
- **Found during:** TASK-073 (verification gate) — observed, then isolated
- **Description:** The e2e suite passed 347/347 on a clean run, failed 1 test on an immediate second run, and failed a *different* 12 on a third. Isolated by `git stash`: the committed baseline showed the same pattern, so it is not caused by any change. The throttler is `{ ttl: 60000, limit: THROTTLE_LIMIT ?? 100 }` (`app.module.ts`), and `.env.test` raises the limit but does not reset the counter between processes — a second run starting inside the same 60s window inherits the first run's consumed budget. Failures then surface as assertion mismatches on whichever suite happens to exhaust it, not as an obvious 429, which is what makes it read as a real regression.
- **Why deferred:** It is a test-harness artefact, not product behaviour. No production path runs the suite twice in a minute.
- **Impact if unaddressed:** Real time lost chasing a phantom regression — it cost one stash-and-compare cycle in TASK-073, and would cost more to someone who did not think to compare against baseline. It could also mask a genuine failure by making red runs look routine.
- **Trigger condition:** The next time someone reports an e2e failure that does not reproduce on a clean run, or if CI ever runs the suite twice in one job.
- **Proposed resolution:** Reset the throttler storage in `test/setup-e2e.ts`'s `resetDatabase()`, or give the e2e app module a no-op throttler guard. Either is a test-only change.
- **Priority:** Low
- **Status:** Open
- **Confirmed 2026-08-23:** the diagnosis was tested rather than assumed. A run immediately following another failed 3 tests; **waiting 75 seconds** (past the throttler's 60s `ttl`) and running again gave 347/347 with no code change in between. The window, not the code, decides the result.

### DEBT-056 — No server-side export endpoint; the button pages the API instead

- **Date logged:** 2026-08-23
- **Found during:** TASK-073 (full export) — Option B, considered and deferred
- **Description:** `fetchAllPages` (`apps/web/lib/fetchAllPages.ts`) walks the list endpoint 100 rows at a time until the filtered set is complete, then builds the workbook in the browser. `PaginationQuerySchema` caps `limit` at 100 and the throttler allows 100 requests per 60s per IP, so the loop is capped at `EXPORT_ROW_CAP = 5000` rows (50 requests, half the minute's budget). Past that the button disables itself and says so rather than exporting a partial file.
- **Why deferred:** Option B needs six new routes (`/payables/export`, `/stock-movements/export`, …), each with its own `RoleGuard`/`BranchScopeGuard`, Zod contract and e2e coverage, plus `exceljs` as a new `apps/api` dependency — two extra approval gates (AGENTS.md §Governance items 2 and 3) for a volume tier that does not need it yet. It would also duplicate the `exportColumns` definitions, which today live only in the web components, giving them somewhere to silently diverge.
- **Impact if unaddressed:** An operator whose filtered set exceeds 5,000 rows cannot export it at all — they are told to narrow the filter, which is honest but is a refusal, not a feature. A 4,000-row export also costs 40 sequential requests and several seconds.
- **Trigger condition:** The first time `ExportTooLargeError` is actually seen by an operator, or a single export takes longer than 15 seconds.
- **Proposed resolution:** Streaming export endpoints per Option B in `docs/plannings/2026-08-23-full-export.md` §4, with the column definitions moved into `packages/api-contracts` so web and api cannot drift.
- **Priority:** Low
- **Status:** Open

### DEBT-055 — `GeneralExpenseTab` and `PurchaseEntryTab` show 50 rows with no pagination footer

- **Date logged:** 2026-08-23
- **Found during:** TASK-073 — not previously logged; found while inventorying every export call site
- **Description:** `useLedgerEntries` and `useSupplierPurchases` (`apps/web/hooks/useExpenses.ts`) request `limit=50`, and neither table passes a `pagination` prop. So both screens display at most the first 50 rows and render **nothing** to say the list is truncated. This is worse than the class of defect DEBT-048 described: a server-paginated table at least carries a footer reading "Menampilkan 1–25 dari 340", which makes the truncation visible.
- **Update 2026-08-23 (TASK-073):** the **export** on both tabs now covers the whole set (`exportAll` walks every page). The screens were deliberately left alone, per the approved scope. One consequence to expect: the exported file can now contain more rows than the table above it — honest, but confusing until this entry is paid off.
- **Why deferred:** Explicit scope decision when TASK-073 was approved. The export defect (a short spreadsheet handed to an accountant with nothing marking it partial) is the worse of the two failures and was the one in scope; adding server pagination to two more tables is a separate task, and TASK-067's own reasoning was that pagination work is worth doing deliberately rather than sneaked into an adjacent change.
- **Impact if unaddressed:** Someone reviewing expenses believes they are looking at the whole list when they are looking at the newest 50. Since TASK-073, they also get a spreadsheet longer than the screen with no explanation.
- **Trigger condition:** Either tab exceeding 50 rows in normal use — which for `Pengeluaran Umum` (every OUTFLOW, manual and generated) will happen early — or the first user question about why the export is longer than the table.
- **Proposed resolution:** Give both hooks the `page`/`limit`/`sortBy`/`sortOrder` parameter object the other five paginated hooks already take, and pass `pagination` to both `DataTable`s, following `PayablesTab` as the reference implementation. The `fetch*Page` functions TASK-073 extracted already take `page` and `limit`, so the hook side is half done.
- **Priority:** Medium
- **Status:** Open

### DEBT-054 — Server-side search is an unindexed `ILIKE '%x%'` scan

- **Date logged:** 2026-08-23
- **Found during:** TASK-072 (server-side search) — Option C, considered and deferred
- **Description:** The `search` added to `/sales`, `/reconciliation/transactions`, `/stock-movements` and `/devices/attendance` compiles to Prisma `contains` + `mode: 'insensitive'`, i.e. `ILIKE '%keyword%'`. A leading wildcard cannot use a B-tree index, so each of those queries is a sequential scan of the table (and of the joined `Branch`/`User`/`RawMaterial` rows). The indexed version is a `pg_trgm` extension plus a GIN index on each searched column — or `to_tsvector` with `$queryRaw` if fuzzy matching is wanted too.
- **Why deferred:** It needs a migration, which is its own approval gate (AGENTS.md §Governance item 1), and an extension that has to exist in the production and e2e databases as well as locally. Crucially the API contract and every line of frontend code are **identical** either way — this is a later optimisation of the same feature, not a different one, so nothing written in TASK-072 has to change when it is done.
- **Impact if unaddressed:** Search latency grows linearly with table size. `StockMovement` is the one that matters: it grows with recipe lines per sale rather than with sales, so it is the first table where a seq scan per keystroke will be felt.
- **Trigger condition:** `EXPLAIN ANALYZE` on a real-volume `StockMovement` (or `Sale`) search showing a seq scan whose cost is actually noticeable — not before. At v1 volumes (thousands of rows) it is not measurable.
- **Proposed resolution:** Migration enabling `pg_trgm` and adding `gin (column gin_trgm_ops)` indexes on the searched columns. `contains` keeps working unchanged and starts using the index; no contract or frontend change.
- **Priority:** Low
- **Status:** Open

### DEBT-053 — `PayablesTab` is server-paginated but has no search box at all

- **Date logged:** 2026-08-23
- **Found during:** TASK-072 (server-side search), while enumerating which paginated tables had the DEBT-047 defect
- **Description:** `components/expenses/PayablesTab.tsx` pages server-side like the four tables TASK-072 fixed, but it never had a `searchColumns` toolbar in the first place — so unlike them it was never *misleading*, only missing. `PayableQuerySchema` has no `search` field, which DEBT-047's proposed resolution had suggested adding in the same pass. (`PurchaseEntryTab`, the supplier-purchase list, is a different case: it has neither search nor server pagination, so it is not comparable to this one.)
- **Why deferred:** Adding a search box to a screen that has none is a new feature, not a defect fix, and TASK-072's scope was the boxes that lied about what they searched (AGENTS.md §Strict Scope). The plumbing it would need already exists and is proven: `search` on the query schema, an `OR` in the service, `serverSearch` on `DataTable`, `useDebouncedValue` in the client.
- **Impact if unaddressed:** Someone chasing one supplier's unpaid invoice pages through the list or narrows by supplier dropdown first. Nothing is wrong on screen; the workflow is just slower than the four screens beside it.
- **Trigger condition:** The first request to "find this invoice/supplier" from the Utang screen, or when that list routinely runs past a couple of pages.
- **Proposed resolution:** Copy the TASK-072 pattern exactly — `search: z.string().trim().optional()` on `PayableQuerySchema`; an `OR` over supplier name and invoice reference in `PayablesService`; `serverSearch` + `useDebouncedValue` + reset-to-page-1 at the call site. Roughly the same size as one of TASK-072's four modules.
- **Priority:** Low
- **Status:** Open

### DEBT-052 — Attendance log cannot be searched by employee email

- **Date logged:** 2026-08-22
- **Found during:** TASK-071 (Attendance date range + pagination)
- **Description:** `AttendanceLogTable` listed `'userEmail'` in `searchColumns`, but no column has that id — the email is rendered inside the Karyawan cell alongside the name. TanStack therefore threw `[Table] Column with id 'userEmail' does not exist` on every render and the id contributed nothing to filtering. The dead id was removed; email is now genuinely unsearchable rather than apparently-searchable-but-broken.
- **Why deferred:** Making it work means either a hidden `accessorKey: 'userEmail'` column or converting the Karyawan column to an `accessorFn` that concatenates name and email. The latter changes the column's id, which is now load-bearing for server-side sorting (`sortBy=userName`), so it was not worth the risk inside a task that had just wired that path.
- **Impact if unaddressed:** An OWNER searching the attendance log by an employee's email address gets no results and no explanation.
- **Trigger condition:** When DEBT-047 (server-side `search`) is implemented — email belongs in that server-side search term, which removes the need for a client-side column at all.
- **Proposed resolution:** Fold `userEmail` into the server-side search added by DEBT-047 rather than reintroducing a client-side column.
- **Priority:** Low
- **Status:** Resolved (2026-08-23, TASK-072) — exactly as proposed: `user.email` is one clause of the `OR` in `AttendanceService.findRecords`, so an email fragment now finds the row without any column carrying it. No column id changed, so `sortBy=userName` is untouched. Covered by an e2e case that searches `att-kasir-b@` and asserts the single matching row comes back.

### DEBT-051 — Attendance calendar fetches raw logins instead of a server-reduced monthly matrix

- **Date logged:** 2026-08-22
- **Found during:** TASK-071 (Attendance date range + pagination) — Option C, considered and deferred
- **Description:** `AttendanceCalendarMatrix` renders one cell per kasir per day, but fetches the month's raw `AttendanceRecord` rows and reduces them client-side in `getDayStatus` (leave beats attendance; any valid login beats a violation). The alternative is a purpose-built `GET /devices/attendance/matrix?month=YYYY-MM` returning the already-reduced cells with leave folded in, making the payload `cashiers × days` regardless of login volume.
- **Why deferred:** The raw-row payload is bounded by a month and the 500-row page cap, and a month past that cap is now reported on screen rather than silently truncated. The aggregate endpoint would also move presentation precedence into the API, which this repo has kept client-side everywhere else — a real architectural shift to make for a table whose worst case is a few hundred rows.
- **Impact if unaddressed:** Once a month routinely exceeds 500 logins (roughly 8+ kasir logging in twice a day), the matrix stops showing a complete month and falls back to the warning band. The band is honest, but it is a degraded view, not a working one.
- **Trigger condition:** When the truncation band starts firing in normal use — i.e. a typical month's `meta.total` exceeds the page cap — or when the matrix is extended past a single month.
- **Proposed resolution:** Add the aggregate endpoint described above, move the `getDayStatus` precedence rules into it with their own e2e coverage, and drop the matrix's second `useAllLeaveRequests` call.
- **Priority:** Low
- **Status:** Open

### DEBT-050 — Stock movement history has no running-balance column, and no drill-down from the summary

- **Date logged:** 2026-08-22
- **Found during:** TASK-070 (Stock Movement read endpoint + screen)
- **Description:** `/inventory/movements` lists every movement with quantity and direction, but not the resulting stock level after each one. Three related gaps were deferred with it: no drill-down link from `InventorySummaryTable` to the filtered movement list for that material; `referenceId` renders as a short opaque id rather than the order number or purchase invoice it points at; and the toolbar search is page-scoped (shared with DEBT-047) with export page-scoped (DEBT-048).
- **Update 2026-08-23 (TASK-072):** the page-scoped search half of that last item is closed — this screen's box is now server-side (DEBT-047). The running balance, the drill-down and `referenceId` resolution are all still open, and export is still page-scoped (DEBT-048).
- **Why deferred:** A running balance is only well-defined for **one material, ordered by movementDate ascending, over its whole history**. This screen pages, sorts five keys in two directions, and filters on six fields. Under any sort other than date-ascending, or on page 2 of anything, a per-row balance is arithmetically meaningless — and it would render as a confident number rather than as an error, which is worse than not showing it. The user agreed to omit it rather than ship a figure that is wrong in most reachable states. `referenceId` resolution needs three conditional lookups because the column is polymorphic across `Sale`/`SupplierPurchase`/`OpeningStock` with no FK, exactly like `LedgerEntry.sourceId` (ERD §2).
- **Impact if unaddressed:** An operator auditing "why is Kopi at 4.2 kg" reads the movements but must add them up by hand. The summary screen and the movement screen stay two separate destinations rather than one drill-down. Tracing a specific movement back to its originating sale requires a manual id lookup.
- **Trigger condition:** The first time someone asks "what was the stock after this movement?", or a stock discrepancy investigation requires manually summing more than one page of rows.
- **Proposed resolution:** A single-material drill-down view — reached from the summary row — with sort locked to `movementDate asc` and the running balance computed server-side over the full history for that material, not over the page. That is the only shape in which the number is correct. Add `referenceId` resolution there, where the row count is bounded, rather than on the general list.
- **Priority:** Medium
- **Status:** Open

### DEBT-049 — Four list endpoints still hardcode their sort direction

- **Date logged:** 2026-08-22
- **Found during:** TASK-067 (Tier 1 server-side pagination, Sales + Payables)
- **Description:** `sortOrder` was added as a standalone `SortOrderSchema` and wired into `GET /sales` and `GET /payables` only. `GET /supplier-purchases`, `GET /ledger-entries` and `GET /suppliers` still hardcode their direction (`orderBy: { [sortBy ?? 'x']: 'desc' }`), so those three accept a `sortBy` but can never be reversed.
- **Update 2026-08-22 (TASK-068):** `GET /reconciliation/transactions` has been removed from this list — it now honours `sortOrder` and also gained `description` as a sort key. Three endpoints remain.
- **Why deferred:** Deliberate. Putting `sortOrder` on `PaginationQuerySchema` would have made all six endpoints advertise a parameter only two of them honour — which is precisely the silent-drop bug TASK-067 existed to fix (apps/web sent `sortOrder` for months while Zod stripped it). Opting in per module keeps "advertises it" and "respects it" the same set.
- **Impact if unaddressed:** Nothing breaks; those screens simply cannot offer ascending sort. The risk is a future contributor adding `sortOrder` to the base schema for convenience and reintroducing the silent drop on four routes.
- **Trigger condition:** When any of those three screens is wired to the shared `DataTable` pagination props — the same change that makes its sort headers server-driven.
- **Proposed resolution:** Per module: one `sortOrder: SortOrderSchema.optional()` line in the query schema, `sortOrder = 'desc'` in the service's destructure, and `sortOrder` in place of the literal in `orderBy`. Roughly three lines each; see `payables.service.ts` for the variant needed when a sort key lives on a relation.
- **Priority:** Low
- **Status:** Open

### DEBT-048 — Export button exports the current page, not the full result set

- **Date logged:** 2026-08-22
- **Found during:** TASK-067 (Tier 1 server-side pagination, Sales + Payables)
- **Description:** `DataTable`'s `ExportButton` builds its spreadsheet from `table.getFilteredRowModel().rows` — the rows the component currently holds. Under server pagination that is one page: the Payables export now covers 25 rows where it previously covered up to 50.
- **Why deferred:** Not a new correctness problem — the export was never the full set, it was whatever the hardcoded `limit` happened to fetch. Server pagination makes the limitation visible rather than creating it, and a correct fix needs a decision (client-side paging loop vs. a dedicated server export endpoint) that was out of scope.
- **Impact if unaddressed:** Someone exports "Utang Pemasok" for accounting and silently gets one page of it. The file gives no indication it is partial.
- **Trigger condition:** The first time an export is used for anything downstream of the screen — accounting, a report, a hand-off to a bookkeeper — or the first user report of a short spreadsheet.
- **Proposed resolution:** Either have the export button page the API to completion before building the workbook (simple, fine at v1 volumes), or add a server-side export endpoint that streams the full filtered set. Whichever is chosen, the button should state the row count it is about to export.
- **Priority:** Medium
- **Status:** **Resolved 2026-08-23 (TASK-073)** — the paging-loop option, per `docs/plannings/2026-08-23-full-export.md` (Option A, approved). `DataTable` gained an optional `exportAll` supplier and an `exportTotal`; six call sites (`PayablesTab`, `StockMovementsTable`, `BankTransactionsTable`, `AttendanceLogTable`, and the two `limit=50` expenses tabs from DEBT-055) now pass `fetchAllPages`, which walks the endpoint 100 rows at a time. The button label carries the real count (`Export (1.234)`), which is what makes a short spreadsheet impossible to ship silently. Past `EXPORT_ROW_CAP = 5000` it **refuses with a message rather than truncating** — truncating would have been the same defect with a bigger number. The seven tables that already hold their whole result set were deliberately not given `exportAll`; `TopProductsView` in particular, where `limit: 10` is the report's definition, is pinned by a test. Server-side export endpoints remain available as **DEBT-056** if the cap is ever hit.

### DEBT-047 — Sales History search only covers the visible page

- **Date logged:** 2026-08-22
- **Found during:** TASK-067 (Tier 1 server-side pagination, Sales + Payables)
- **Description:** `DataTable`'s toolbar search is a client-side column filter. Once Sales History moved to 25 rows per page, that search stopped being a history search and became a page search. The placeholder and aria-label were changed to "Cari di halaman ini..." so the UI does not overstate what it does, but the underlying capability is missing: there is no `search` field on `SaleQuerySchema`.
- **Update 2026-08-22 (TASK-068):** the same applies to `BankTransactionsTable`'s `searchColumns={['description']}` on the Reconciliation screen, which has been paginated server-side all along. Its placeholder was relabelled "Cari keterangan di halaman ini…" for the same reason. `ReconciliationQuerySchema` likewise has no `search` field.
- **Why deferred:** Explicit scope decision when TASK-067 was planned — filter scope was limited to backend filters that already existed. Adding server-side search is a new contract field plus a Prisma `OR`/`contains` clause, and it is worth doing once for several modules rather than piecemeal.
- **Impact if unaddressed:** A cashier looking for a specific order id has to page through history manually, or narrow by date first. The relabelled placeholder prevents the worse failure (believing an empty result means the sale does not exist), but the workflow is still poor.
- **Trigger condition:** The first request to "find a transaction by order number" or to find a bank transaction by its statement description, or when either list exceeds a few pages in normal use.
- **Proposed resolution:** Add `search: z.string().trim().optional()` to `SaleQuerySchema`, following the existing pattern in `SupplierQuerySchema`, and translate it in `SalesService.findAll` into an `OR` over the fields the toolbar currently filters (`id`, branch name, cashier name, account name). The same field is worth adding to `ReconciliationQuerySchema` (over `description`), `PayableQuerySchema` and `SupplierPurchaseQuerySchema` in the same pass.
- **Priority:** Medium
- **Status:** Resolved (2026-08-23, TASK-072) — `search` added to `SaleQuerySchema`, `ReconciliationQuerySchema`, `StockMovementQuerySchema` and `AttendanceQuerySchema`, translated into `OR` + `contains` + `mode: 'insensitive'` in the four services. `DataTable` gained a `serverSearch` prop; the four affected call sites dropped `searchColumns` and their "di halaman ini" placeholders. Four tables, not the two this entry names — Stock Movements and the Attendance log had the identical defect and share the same `data-table.tsx` change, which is what this entry's own "worth doing once for several modules" reasoning asked for. `PayableQuerySchema` and `SupplierPurchaseQuerySchema` were deliberately **not** included: neither screen has a search box at all, so adding one is a feature rather than a defect fix — see **DEBT-053**. Nine client-searched tables that load their whole set were left alone; client-side search is correct there.

### DEBT-046 — `pnpm audit` in CI is advisory only (`continue-on-error: true`)

- **Date logged:** 2026-08-22
- **Found during:** Phase 14 Workstream E (ops readiness checklist, E-12)
- **Description:** `.github/workflows/ci.yml`'s `pnpm audit` step (line 75-76) has `continue-on-error: true`, so a discovered advisory never fails the build — it only appears in the job log for a human to notice.
- **Why deferred:** Deliberate and already documented in the workflow itself, not an oversight found this phase. Re-flagged rather than changed: flipping it to fail the build is a CI-behavior change with its own blast radius (a transitive-only advisory with no available fix would then block every PR) and wasn't the subject of this verification pass.
- **Impact if unaddressed:** A direct dependency with a real, fixable advisory can sit unnoticed in CI output indefinitely — nothing forces anyone to look.
- **Trigger condition:** Before any external security claim is made about this project, or when a *direct* (not transitive) advisory appears with no available fix, whichever comes first.
- **Proposed resolution:** Either fail the build on advisories at or above a chosen severity (e.g. `pnpm audit --audit-level=high`) once the team is ready to treat that as a merge blocker, or add a scheduled (non-blocking) job that posts a summary instead of relying on someone reading PR CI logs.
- **Priority:** Low
- **Status:** Open

### DEBT-045 — Inventory Summary and reports resolved calendar-month boundaries differently (UTC vs WIB), a 7-hour disagreement

- **Date logged:** 2026-08-22
- **Found during:** Phase 14 (Verification & Hardening) Step 4 — `monthly-cycle.e2e-spec.ts` Stage 8 reproduced it empirically against a real July 2026 cycle before this entry was even written.
- **Description:** `apps/api/src/common/period.ts` (ADR-018, backing all `/reports/*`) resolved calendar ranges in Asia/Jakarta (UTC+7); `apps/api/src/modules/inventory/period.ts` (backing `/inventory/summary` and `/inventory/opening-stock`) resolved them in UTC. A sale in the last WIB hour of a month (e.g. `2026-08-01 00:30 WIB`, stored as `2026-07-31T17:30:00.000Z`) landed in *August* on every report but in *July* on the Inventory Summary — the same sale's revenue/COGS in one month, its stock consumption in the previous one.
- **Why deferred:** Not deferred — this was never previously logged at all, despite both files' own header comments instructing the other to defer to it. Logged here only because the Tech Debt Log triage found it undocumented, then resolved in the same pass.
- **Impact if unaddressed:** PRD §9's "one full monthly cycle end-to-end without manual data correction" criterion cannot be met while a single sale's COGS and stock-out disagree by construction — this is exactly the failure that success criterion exists to catch.
- **Trigger condition:** N/A — resolved in the same phase this was logged.
- **Proposed resolution:** See ADR-023.
- **Priority:** High
- **Status:** Resolved (2026-08-22, Phase 14 Gate 1) — ADR-023 written and approved: `inventory/period.ts` now delegates to `common/period.ts` for WIB boundaries, the single place a calendar-month boundary is computed. A follow-on bug this fix would otherwise have introduced was found and fixed in the same pass: writing the WIB-shifted instant into `OpeningStock.periodMonth` (`@db.Date`) would have stored one calendar day earlier than every existing row, orphaning the `(rawMaterialId, periodMonth)` unique key. Fixed via a decoupled `periodMonthDate` field, verified empirically (not assumed) to reproduce the pre-fix stored date exactly — no data migration needed. `apps/api/test/inventory.e2e-spec.ts`'s Case R and Case D-1 were updated to the new (correct) WIB-based expected values. Full e2e suite (13 suites / 247 tests at the time) verified green.

### DEBT-035 — Hybrid dark-mode theme triggering across `[data-theme='dark']` and `.dark` selectors

- **Date logged:** 2026-08-21
- **Found during:** TASK-061 (Standardize Shadcn Dark Mode Support)
- **Description:** Dark mode styling currently matches both `.dark` and `[data-theme='dark']` attribute scopes, with `AppShell` toggling both an attribute and a CSS class on its outer container.
- **Why deferred:** Allows backwards-compatibility with custom scoped containers while simultaneously supporting standard shadcn `dark:` tailwind variants without needing full migration to `next-themes` library.
- **Impact if unaddressed:** Dual styling hooks add slight redundancy to CSS bundle selectors, but no visual or functional issues.
- **Trigger condition:** When unifying the app shell to a full Next-Themes context or when implementing system-preference (`prefers-color-scheme`) auto-detection.
- **Proposed resolution:** Standardize on either pure `.dark` class or standard `next-themes` ThemeProvider across all layouts and modals.
- **Priority:** Low
- **Status:** Open
- **Re-flagged 2026-08-22 (Phase 14 gate):** Cosmetic; trigger is a `next-themes` migration, which has not started.

### DEBT-033 — E2E `resetDatabase()` helpers omit `Device`, breaking two suites on `devices_branch_id_fkey`

- **Date logged:** 2026-08-21
- **Found during:** TASK-056 (PDF import) — encountered while running the full e2e suite; **not caused by that task**, and left untouched to respect scope.
- **Description:** `allocation-sum.e2e-spec.ts` and `reconciliation-addendum.e2e-spec.ts` call a local `resetDatabase()` that deletes `branch` rows without first deleting `devices`. `Device` has a required FK to `Branch` (ADR-021), so once any `Device` row exists both suites fail in `beforeAll` with `Foreign key constraint violated on the constraint: devices_branch_id_fkey`. No e2e spec anywhere deletes `Device` rows (`grep -l "device.deleteMany" apps/api/test/*.ts` returns nothing).
- **Why deferred:** Out of scope for the task that found it, and the fix touches shared test fixtures that other in-flight branch work also edits — a conflict risk better taken deliberately than incidentally.
- **Impact if unaddressed:** 14 e2e tests fail permanently, so the suite cannot gate a merge. Worse, the failure is in setup rather than assertions, so it masks any real regression those two suites would otherwise catch.
- **Trigger condition:** Immediately — the suite is already red on this branch. Certainly before the Devices feature merges to `main`.
- **Proposed resolution:** Add `await prisma.attendanceRecord.deleteMany({}); await prisma.device.deleteMany({});` before the `branch.deleteMany()` in both helpers. Better: extract the duplicated `resetDatabase()` into one shared `test/reset-database.ts` so a new FK only has to be handled once — several specs currently carry near-identical copies.
- **Priority:** High
- **Status:** Resolved (2026-08-22, Phase 14 Step 1) — Extracted the shared, FK-safe `apps/api/test/reset-database.ts` (verified against the actual FK graph, not copied blind) and re-pointed `allocation-sum.e2e-spec.ts` and `reconciliation-addendum.e2e-spec.ts` at it, deleting their private copies. The other suites' own `resetDatabase()`/`cleanup()` helpers were deliberately left untouched (AGENTS.md strict scope) since they were not broken. Full e2e suite verified green (13 suites / 247 tests at the time) in both `db:seed → test:e2e` and `test:e2e → test:e2e` order.

### DEBT-032 — No end-to-end test parses a real PDF bank statement

- **Date logged:** 2026-08-21
- **Found during:** TASK-056 (PDF import)
- **Description:** `MandiriPdfParser` is unit-tested against extracted text geometry, and the HTTP route is e2e-tested for error paths (wrong container, non-PDF bytes, RBAC). Nothing exercises `pdf-parse` on a genuine PDF in CI. Real statements are the user's personal financial records and are git-ignored; an attempt to hand-generate a fixture PDF failed because the pdf.js bundled in `pdf-parse@1.1.4` rejects hand-written xref tables with "bad XRef entry" — including a spec-canonical minimal PDF — so the generator was removed rather than left as dead code.
- **Why deferred:** Correctness was verified manually and thoroughly against the real 57-transaction statement (every row parsed; amounts reconcile exactly from opening to stated closing balance), and closing the gap properly needs a PDF-writing dependency, which is an approval gate.
- **Impact if unaddressed:** A regression in `pdf-text.util.ts`'s renderer — the y-clustering tolerance or the x-gap join threshold — would not be caught by CI, only by a user's failed import. The unit tests feed synthetic items and would still pass.
- **Trigger condition:** A second bank parser is added (the renderer stops being single-use), or any change to the clustering/gap constants in `pdf-text.util.ts`.
- **Proposed resolution:** Add a dev-only PDF writer (`pdf-lib` generates spec-valid xref tables) and commit a small synthetic fixture with fake names and account numbers, laid out on the real column grid. Then assert the full `MandiriPdfParser.parse()` path and add a happy-path import + re-import dedup case to `concurrency.e2e-spec.ts`.
- **Priority:** Medium
- **Status:** Open
- **Re-flagged 2026-08-22 (Phase 14 gate):** Blocked on obtaining real sample statements (a hand-generated fixture PDF was already ruled out — see Description). No new information this phase.

### DEBT-034 — BCA PDF e-statement import is not implemented (no real sample available)

- **Date logged:** 2026-08-21
- **Found during:** TASK-056 (PDF import)
- **Description:** Only Mandiri PDF import exists (ADR-022). A genuine BCA PDF e-statement was never available to derive a parser from — `docs/e-statement/mutasi bca.pdf` turned out to be a **Bank Sultra** statement mislabeled by filename (tracked separately in DEBT-031), not an actual BCA export. BCA users are still CSV-only.
- **Why deferred:** Building `bank-sultra-pdf.parser.ts` from the mislabeled sample would have shipped a parser keyed `BCA_PDF` that silently mis-parses real BCA statements, which is worse than not having the format at all — a reconciliation import that returns plausible-looking wrong numbers is more dangerous than one that's simply unavailable. No real BCA PDF sample was on hand to verify against.
- **Impact if unaddressed:** BCA users must keep using CSV import (unaffected, still works); no regression, just a gap. If someone adds a `BCA_PDF` format key without a real sample to verify against, ADR-022's column-geometry approach (`mandiri-pdf.parser.ts`) makes it easy to accidentally ship on the Bank Sultra layout instead.
- **Trigger condition:** A real BCA PDF e-statement becomes available (redacted or not) to derive and verify the column layout against — same verification bar as Mandiri (§ADR-022: parse every row, reconcile opening→closing balance exactly).
- **Proposed resolution:** Once a genuine BCA sample exists: dump its geometry the same way `mandiri-pdf.parser.ts` was derived (extract positioned text runs, identify fixed column x-ranges, confirm balance reconciliation across all rows), add `BCA_PDF` to `BankImportFormatSchema`/`BANK_IMPORT_FORMATS`, and add a `bca-pdf.parser.ts` + spec. Do **not** reuse the Bank Sultra layout from DEBT-031 for this — they are different issuers with different table structures, confirmed by direct inspection.
- **Priority:** Low
- **Status:** Open
- **Re-flagged 2026-08-22 (Phase 14 gate):** Blocked on obtaining a real BCA PDF sample. No new information this phase.

### DEBT-031 — Mandiri PDF parser is tuned to one issuer and one sample

- **Date logged:** 2026-08-21
- **Found during:** TASK-056 (PDF import), updated in TASK-057
- **Description:** Two remaining limits from ADR-022. (a) The column x-ranges in `mandiri-pdf.parser.ts` were derived from a single real statement; a Mandiri layout change silently yields zero rows rather than an error. (b) `docs/e-statement/mutasi bca.pdf` is actually a **Bank Sultra** statement (`CR`/`DB` column, `Rp 5,044,800` amounts) and is unimplemented — its layout is recorded in ADR-022. Note: Password protection support was resolved in TASK-057 using `pdfjs-dist`.
- **Why deferred:** (a) is inherent to parsing a format nobody publishes a spec for. (b) was explicitly scoped out by the user. (c) needs `pdfjs-dist`/`unpdf`, both ESM-only and incompatible with this repo's `module: commonjs` build without a `new Function("import(...)")` hack.
- **Impact if unaddressed:** A layout change looks like an empty statement, not a failure — the most dangerous shape for a reconciliation feature, since a silently-missing transaction is invisible. Bank Sultra users have no import path. Every Mandiri import carries a manual unlock step.
- **Trigger condition:** An import returns `total: 0` for a file that visibly contains transactions; or a second bank needs importing; or users start reporting the unlock step as friction.
- **Proposed resolution:** For (a), treat `total: 0` on a valid PDF as a distinct warning in the UI rather than a bland success, and add a running-balance reconciliation check that warns when parsed amounts do not chain from opening to closing balance. For (b), add `BANK_SULTRA_PDF` using the layout in ADR-022. For (c), migrate the extractor to `unpdf` (its CJS build is compatible) and add an optional password field — deliberately kept out of the current UI.
- **Priority:** Medium
- **Status:** Open
- **Re-flagged 2026-08-22 (Phase 14 gate):** Blocked on obtaining real sample statements. No new information this phase.

### DEBT-030 — OWNER's POS branch selection is not persisted across visits

- **Date logged:** 2026-08-20
- **Found during:** TASK-051 (OWNER branch-selectable POS access)
- **Description:** `PosScreen.tsx`'s `selectedBranchId` state is seeded once from the `branchId` prop and otherwise lives only in component state — every fresh visit to `/sales` as OWNER resets to unselected, showing the "Pilih cabang untuk memulai transaksi" placeholder again even if they picked the same branch five minutes ago.
- **Why deferred:** Deliberate, not an oversight — put directly to the user via `AskUserQuestion` with three UX options (blocking picker screen, header dropdown with no persistence, persisted pill matching the DEBT-005 "Kemang · Terkunci" concept). The header-dropdown-without-persistence option was explicitly chosen, on the reasoning that OWNER POS use is expected to be occasional, not the daily cashier flow persistence would meaningfully help.
- **Impact if unaddressed:** A minor repeated-friction cost only — one extra dropdown pick per `/sales` visit for OWNER. No correctness or data impact; `branchId` is attribution-only (ADR-004).
- **Trigger condition:** OWNER reports this as a recurring annoyance, or POS becomes a regular (not occasional) OWNER workflow.
- **Proposed resolution:** Persist the last-picked branch in `localStorage` (or a small pill in the header showing the active branch, editable — closer to the DEBT-005 pattern), read on mount with the same SSR-safe guard `useMediaQuery.ts` already establishes for client-only state.
- **Priority:** Low
- **Status:** Open
- **Re-flagged 2026-08-22 (Phase 14 gate):** No report of recurring annoyance; POS still not a regular OWNER workflow. Trigger has not fired.

### DEBT-029 — Duplicate `useBranches` hook (`hooks/useBranches.ts` vs. inside `hooks/useExpenses.ts`)

- **Date logged:** 2026-08-20
- **Found during:** TASK-051 (OWNER branch-selectable POS access) — pre-existing, not introduced by this task
- **Description:** Two independent `useBranches()` implementations exist, both calling `GET /branches` but caching under different React Query keys: the canonical `apps/web/hooks/useBranches.ts` (`BRANCHES_QUERY_KEYS.branches`, also home to `useCreateBranch`/`useUpdateBranch`/`useDeleteBranch`) and a second one defined inside `apps/web/hooks/useExpenses.ts` (`EXPENSES_QUERY_KEYS.branches`), used by `ReportsClient.tsx`. TASK-051 used the canonical one for the new POS branch picker and left the duplicate untouched.
- **Why deferred:** Out of scope for TASK-051 (a POS access feature, not a hooks cleanup) — fixing it means finding and updating every `ReportsClient.tsx`-side consumer of the `useExpenses.ts` copy, which risks touching unrelated report-filtering behavior for no benefit to the task at hand.
- **Impact if unaddressed:** Two independent React Query cache entries for the same server data — a branch created/renamed/deleted invalidates only one of the two query keys depending on which mutation ran, so the other screen can show stale branch data until its own next refetch trigger.
- **Trigger condition:** A bug report of stale branch names/lists on the Reports page after a branch is edited elsewhere, or the next time either file is touched for an unrelated reason.
- **Proposed resolution:** Delete the `useBranches` defined in `useExpenses.ts`, re-point `ReportsClient.tsx` at `hooks/useBranches.ts`, confirm the query key change doesn't break any test asserting on `EXPENSES_QUERY_KEYS.branches`.
- **Priority:** Low
- **Status:** Open
- **Re-flagged 2026-08-22 (Phase 14 gate):** An unrelated refactor; explicitly forbidden by AGENTS.md strict scope for this phase.

### DEBT-028 — `brand.primary` fill with white text fails WCAG 2.2 AA

- **Date logged:** 2026-08-20
- **Found during:** UI Revamp Phase 4 accessibility audit (TASK-050)
- **Description:** `--color-brand-primary` (`#00BFFF`) with `text-inverse`/`text-white` is used for every primary button fill (`buttonVariants.default` in `packages/ui/src/components/ui/button.tsx`, e.g. the POS "Bayar" CTA and the mobile order bar's "Lihat Pesanan" pill) and measures roughly **2.12:1** against white (computed by hand from the WCAG relative-luminance formula: `L(#00BFFF) ≈ 0.445`, `L(white) = 1.0`, ratio `= 1.05 / 0.495 ≈ 2.12`). AA requires 4.5:1 for normal text; DESIGN.md §42 requires AA specifically for "brand-colored buttons."
- **Why deferred:** Fixing it means either a darker brand shade for text-bearing fills or dark text on the existing fill — a DESIGN.md §9 token decision, not a component-level edit, and out of this phase's scope (no schema/token-authority change without a decision).
- **Impact if unaddressed:** The single most load-bearing button in the product (POS "Bayar") is under the AA contrast floor for low-vision users; a border/underline is not present as a non-color fallback.
- **Trigger condition:** Before any accessibility-conformance claim is made externally, or when a token decision is next revisited (§9).
- **Proposed resolution:** Add a `--color-brand-primary-strong` token for text-bearing fills (buttons, filled badges) and keep `#00BFFF` for borders, indicators, and tints where the 4.5:1 text rule doesn't apply — or switch the fill to dark text. Either requires a DESIGN.md §9 decision before implementation.
- **Priority:** Medium
- **Status:** Open

### DEBT-027 — POS order panel omits customer, tax, and the §24.3 dropdown

- **Date logged:** 2026-08-20
- **Found during:** UI Revamp Phase 3 (POS Order Panel & Transaction Flow)
- **Description:** Three deviations from DESIGN.md's order-panel spec. (1) §18.1's "Type or Select Customer" combobox is not built — no `Customer` model exists anywhere in `schema.prisma`, and `CreateSaleSchema` has no customer field. (2) §24.2's Service Tax row is not built — `Sale.totalAmount` is Σ `SaleItem.lineTotal` with no tax column (ADR-015 decision 1, DEBT-004). (3) §24.3 specifies a dropdown for the payment method; a segmented tile control (`PaymentMethodPicker`) was kept instead — §26 requires the payment path to stay visible, §43 forbids depending on precise pointer positioning, there are only a handful of `Account` rows, and converting would mean rewriting the selection step ~15 POS tests depend on (`fireEvent.click(getByTestId('payment-method-<id>'))`).
- **Why deferred:** (1) and (2) would render UI promising behaviour the system does not have — DEBT-004's standing judgement against fabricated fields. (3) is a deliberate form-factor deviation, not deferred work; §24.3's placement (directly above the CTA) and visible label are still honoured.
- **Impact if unaddressed:** None currently for (3) — fully functional as built. For (1)/(2): sales cannot be attributed to a named customer, and the summary block cannot show a tax line even if the business later needs one, without a schema change first.
- **Trigger condition:** (1) the owner asks to attach customers to sales; (2) tax or member discounts are decided — per DEBT-004 these must be decided together, since either changes the meaning of every reported total; (3) the payment method list grows past roughly eight accounts, at which point a fixed 2-column grid (the layout as of 2026-08-20, replacing an earlier horizontally-scrolling row that visibly overflowed the panel's fixed width — see the same day's overflow fix) starts requiring vertical scroll of its own.
- **Proposed resolution:** (1)/(2) require a schema-approval gate (new `Customer` model / tax column) before any frontend work. (3) would mean swapping `PaymentMethodPicker`'s tiles for a Radix `Select` and rewriting the ~15 dependent test assertions to open the select before clicking an item.
- **Priority:** Low
- **Status:** Open
- **Re-flagged 2026-08-22 (Phase 14 gate):** POS/UI gaps blocked on schema decisions or explicitly-approved deviations. No new information this phase.

**Addendum (unrelated to the three deviations above, logged in the same task):** `cart.reducer.ts`'s `DECREMENT` action still removes a line at `quantity <= 1`, citing an earlier reading of §25 in its own comment. The new `QuantityStepper` disables the decrement button at quantity 1 instead of touching that tested reducer, so the remove-at-1 branch is now unreachable from the UI (removal happens only via the row's trash icon) and the reducer's comment cites a superseded reading of §25. Left as-is deliberately — `cart.reducer.test.ts` still exercises that branch directly. Trigger to clean up: the next time `cart.reducer.ts` is touched for an unrelated reason, delete the dead branch and correct the comment.

### DEBT-043 — Cashier branch context absent from the topbar

> **ID note:** logged as DEBT-026, renumbered 2026-08-22 to resolve a collision with the Phase 2 entry of the same number (POS filter row buckets).

- **Date logged:** 2026-08-20
- **Found during:** TASK-047 (UI Revamp Phase 1: App Shell & Modern Sidebar Navigation)
- **Description:** DESIGN.md §17 requires the cashier's topbar to read a branch identifier such as `Kemang · Terkunci`. `UserResponseSchema` (`packages/api-contracts/src/user.schema.ts`) carries `branchId` but no branch name, and `GET /branches` is OWNER-only, so a KASIR session has no way to resolve its own `branchId` to a display name. Only the Owner/Admin half of §17 ("Semua Cabang") was implemented in `Topbar.tsx`.
- **Why deferred:** Resolving it requires adding a field to the auth/session API contract (ADR-010), which is outside the scope of a frontend-shell-only phase and needs its own approval per AGENTS.md governance.
- **Impact if unaddressed:** A KASIR's topbar has no branch confirmation, which the design intends as a lightweight "you're locked to this branch" reassurance — cosmetic, not a security or correctness gap (branch scoping is enforced server-side by `BranchScopeGuard`, not by this label).
- **Trigger condition:** When the next phase touching `Topbar.tsx`, the auth session contract, or KASIR-facing UX picks this up, or when a user/QA pass flags the missing branch label.
- **Proposed resolution:** Add `branchName: string | null` to `UserResponseSchema`, populate it in the users/auth mapper (a simple join on `Branch.name`), and render it in `Topbar.tsx` for `variant="default"` when `user.role === 'KASIR'`.
- **Priority:** Low
- **Status:** Open
- **Re-flagged 2026-08-22 (Phase 14 gate):** Still cosmetic-only; no QA/user report has flagged the missing label.

### DEBT-042 — Unpaginated Leave Requests List in All-Employees View

> **ID note:** logged as DEBT-014, renumbered 2026-08-22 to resolve a collision with the Phase 6 entry of the same number (OpeningStock unitPrice immutability).

- **Date logged:** 2026-08-20
- **Found during:** TASK-046 (All Employees Leave History View in Leave Requests Page)
- **Description:** `GET /leave-requests` and `useAllLeaveRequests` return the entire list of leave requests in a single unpaginated array, filtered optionally by status and user.
- **Why deferred:** In small-to-medium retail operations with single-tenant branch staff (v1 PRD scope), total annual leave requests per store remain under a few hundred records, well within single-query memory and network limits.
- **Impact if unaddressed:** At higher transaction scale over multiple years with large staff counts, loading the full array could increase payload size and DOM node rendering overhead in the history table.
- **Trigger condition:** When total historical leave requests exceed 500 records or table loading latency exceeds 300ms.
- **Proposed resolution:** Introduce cursor or offset pagination in `LeaveRequestListQuerySchema` and `LeaveRequestsService.findAll`, utilizing TanStack Table / React Query infinite query pagination on the frontend.
- **Priority:** Low
- **Status:** Resolved (2026-08-22, TASK-071) — `LeaveRequestListQuerySchema` gained `page`/`limit`/`sortBy`/`sortOrder` plus an `overlapsFrom`/`overlapsTo` window; `findAll` pages and counts server-side and returns `{ data, meta }`. `OwnerReviewQueue` pages both of its tables, and its pending badge now reads `meta.total` rather than the current page's length. Offset paging, not the cursor/infinite-query option this entry proposed — offset matches the shared `PaginationMetaSchema` every other paged list in the app already uses, and the footer needs a page count.
- **Re-flagged 2026-08-22 (Phase 14 gate):** Well under 500 historical requests; trigger has not fired. Paid off later the same day anyway: the same contract change was needed to bound the attendance calendar's leave query, which was fetching every approved request in company history to shade one month.

### DEBT-041 — Accordion animation keyframes omitted and static TypeScript help content

> **ID note:** logged as DEBT-013, renumbered 2026-08-22 to resolve a collision with the Phase 6 entry of the same number (no closing-stock snapshots).

- **Date logged:** 2026-08-20
- **Found during:** TASK-044 (Phase 13: Help / Documentation Page)
- **Description:** 
  1. `AccordionContent` in `packages/ui/src/components/ui/accordion.tsx` renders show/hide transitions with instantaneous snapping rather than smooth open/close height animations because `tailwindcss-animate` keyframes (`accordion-down` / `accordion-up`) are not configured in Tailwind setup.
  2. Help documentation is authored as a static TypeScript array in `apps/web/lib/help-content.ts` rather than a full MDX / markdown rendering pipeline.
- **Why deferred:** 
  1. Adding `tailwindcss-animate` or heavy CSS animation plugins is out of scope and requires dependency additions. Radix UI accessibility and state toggling work seamlessly without animation.
  2. Content is authored directly by developers and typed checks prevent schema regressions without adding markdown-rendering dependencies (`contentlayer`, `next-mdx-remote`, etc.).
- **Impact if unaddressed:**
  - Minor visual lack of accordion expanding transition animation.
  - Adding rich formatting (images, video embeds, complex markdown tables) to help guides requires JSX changes rather than writing markdown.
- **Trigger condition:**
  - When design guidelines mandate animated accordion collapsible states across design systems or non-technical administrators need to edit help articles via CMS/Markdown.
- **Proposed resolution:**
  - Configure standard CSS keyframe animations for Radix accordion content heights in `globals.css`.
  - Introduce MDX rendering if help guides scale into a full knowledge base.
- **Priority:** Low
- **Status:** Open
- **Re-flagged 2026-08-22 (Phase 14 gate):** Neither trigger has fired.

---

### DEBT-040 — Attendance & Leave calendar matrix client-side cross-referencing

> **ID note:** logged as DEBT-012, renumbered 2026-08-22 to resolve a collision with the Phase 8a entry of the same number (packages/ui undefined color tokens, already Resolved).

- **Date logged:** 2026-08-20
- **Found during:** TASK-043 (Attendance Monthly Calendar & Leave Matrix)
- **Description:** `AttendanceCalendarMatrix` fetches all cashiers (`useUsers`), attendance records (`useAttendanceRecords`), and approved leaves (`useAllLeaveRequests`) separately, then maps attendance status per day (1..31) on the client side.
- **Why deferred:** Number of active cashiers per business in v1 is small (2–10 cashiers) and date math in memory is instantaneous (<2ms).
- **Impact if unaddressed:** If cashier count grows to hundreds or thousands across dozens of franchises, fetching all records and mapping client-side could cause unnecessary data over-fetching.
- **Trigger condition:** When store cashier staff count exceeds 50 users or matrix rendering experiences noticeable lag on month change.
- **Proposed resolution:** Create a dedicated backend aggregation endpoint (e.g. `GET /devices/attendance/matrix?year=2026&month=8`) returning the pre-calculated daily matrix status per user directly from a single SQL query.
- **Priority:** Low
- **Status:** Open
- **Re-flagged 2026-08-22 (Phase 14 gate):** Cashier count still small; trigger (>50 users) has not fired.

---

### DEBT-039 — Dashboard branch profitability queries fan-out client-side via `useQueries`

> **ID note:** logged as DEBT-011, renumbered 2026-08-22 to resolve a collision with the Phase 8a entry of the same number (topbar static branch label).

- **Date logged:** 2026-08-20
- **Found during:** TASK-041 (Branch Profitability Card)
- **Description:** `BranchProfitabilityCard` executes one HTTP request per retail branch to `/reports/profit-loss?branchId=...` using TanStack `useQueries` in parallel rather than requesting a single aggregated multi-branch endpoint.
- **Why deferred:** Business scope in v1 consists of 2–3 physical branches; the overhead of 2–3 lightweight parallel requests is negligible (<50ms).
- **Impact if unaddressed:** If the number of physical branches grows to dozens, client dashboard initial load will trigger dozens of parallel HTTP requests.
- **Trigger condition:** When active store branch count exceeds 5 branches or backend report latency increases on dashboard load.
- **Proposed resolution:** Introduce an aggregated multi-branch endpoint (e.g. `GET /reports/profit-loss/branches`) in `apps/api/src/modules/reports` returning all branch P&L summaries in a single SQL query.
- **Priority:** Low
- **Status:** Open
- **Re-flagged 2026-08-22 (Phase 14 gate):** Still 3 branches; trigger (>5 branches) has not fired.

---

### DEBT-038 — Physical Device Cookie Extraction / DevTools Cloning

> **ID note:** logged as DEBT-010, renumbered 2026-08-22 to resolve a collision with the Phase 5 entry of the same number (no void/refund path for a Sale).

- **Date logged:** 2026-08-19
- **Found during:** Phase 11 (TASK-035: Attendance & Device Tracking, ADR-021)
- **Description:** Device identification relies on a long-lived HttpOnly signed cookie (`ohmypos_device`). An employee with physical access and technical familiarity could inspect browser storage / network requests on the store tablet and copy the signed cookie onto a personal device to pass the attendance check.
- **Why deferred:** Acceptable residual risk for v1 in typical retail operations. Browser fingerprinting is unreliable and brittle across browser updates; hardware-bound WebAuthn / client certificate enrollment adds massive operational complexity for store tablet setup.
- **Impact if unaddressed:** A tech-savvy employee could bypass attendance violation logging from their personal phone.
- **Trigger condition:** Evidence of employee spoofing attendance via copied device cookies or request for hardware-level device attestation.
- **Proposed resolution:** Implement WebAuthn / hardware-backed device keys (FIDO2 / passkey enrollment) or a dedicated installed wrapper app with secure enclave binding.
- **Priority:** Low
- **Status:** Open
- **Re-flagged 2026-08-22 (Phase 14 gate):** No evidence of employee spoofing reported; trigger has not fired.

---

### DEBT-037 — Cloudinary direct upload vs server-side proxy

> **ID note:** logged as DEBT-009, renumbered 2026-08-22 to resolve a collision with the Phase 5 entry of the same number (sale price override has no role restriction).

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

### DEBT-036 — Thermal printer ESC/POS command integration for receipts

> **ID note:** logged as DEBT-008, renumbered 2026-08-22 to resolve a collision with the Phase 5 entry of the same number (raw-material lock batching).

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
- **Measured (2026-08-22, Phase 14 Workstream C — replaces the Phase 7 fixture-scale numbers above):** Two disposable volume tiers, seeded via `apps/api/prisma/seed-volume.ts` into a throwaway `ohmypos_volume` database (3 branches, ~120 sales/day/branch): **T1** = 12 months / 131,836 sales / 329,408 `sale_items` / 603,692 `stock_movements`; **T2** = 36 months / 395,022 sales / 986,384 `sale_items` / 1,808,816 `stock_movements`. All five Dashboard-3 endpoints measured at T2 over 20 warm HTTP requests each (first request discarded as cold-cache), plus `EXPLAIN (ANALYZE, BUFFERS)` on the underlying query:

  | Endpoint | 1-day p50/p95 | 1-month p50/p95 | 1-year p50/p95 | 1-month plan | 1-year plan |
  |---|---|---|---|---|---|
  | profit-loss | 8/13 ms | 42/61 ms | 312/400 ms | Index Scan (`sales_sold_at_idx`) → Index Scan (`sale_items_sale_id_idx`) | switches to Parallel Seq Scan on `sale_items` + Hash Join (planner's correct choice once the range covers ~⅓ of the table) |
  | product-profit / top-products (shared query) | 7/18 ms | 33/40 ms | 122–320/132–2746 ms* | same Index Scan pair, plus `Seq Scan on products` (6-row table, irrelevant) | same Seq-Scan-+-Hash-Join switch on `sale_items`, 170 ms execution |
  | income-by-payment-method | 5/6 ms | 10/23 ms | 34/63 ms | Index Scan (`ledger_entries_entry_date_idx`) | Index Scan |
  | daily-income | 7/10 ms | 40/42 ms | 288/720 ms | Index Scan | Index Scan |

  *top-products' one 2.75 s sample was a single non-reproducible outlier (5 immediate re-runs: 122–321 ms) — almost certainly GC/scheduler jitter, not a query-plan issue; the plan for that exact request was never re-captured, so it's noted rather than discarded.

  **Verdict — HOLD for all five Dashboard-3 endpoints.** Applying System Design §11's rule literally: no report exceeds 1 s at a one-year range (worst case 720 ms, daily-income), and at the one-month range every query resolves via an index (`sales_sold_at_idx`, `sale_items_sale_id_idx`, `ledger_entries_entry_date_idx`) — the "Seq Scan on `sale_items`/`ledger_entries` at one-month" trigger does not fire. The Parallel Seq Scan Postgres switches to on `sale_items` at the one-year range is the planner correctly preferring a scan + hash join over ~131K individual index probes once the range covers a large fraction of the table — expected behavior, not a defect, and still well under the 1 s budget. See ADR-008's 2026-08-22 reaffirmation note.

  `cash-balance` (unbounded lower date bound by design — PRD requires balance-as-of-a-date) and `GET /inventory/summary` (DEBT-013) were measured separately since neither has a meaningful "range" dimension; see DEBT-013 below for the inventory number. `cash-balance` at T2: 128/342 ms, `EXPLAIN` confirms a `Parallel Seq Scan on ledger_entries` (expected — it must sum every entry before the as-of date) but stays well under 1 s at the current ~400K-row table size.
- **Proposed resolution:** Introduce materialized views or a dedicated read-model table for the report queries, refreshed on a schedule or on write. **Not proposed for action now** — the verdict above is HOLD, so this stays a documented option for a future re-measurement, not a change to make today.
- **Priority:** Medium
- **Status:** Open — re-affirmed HOLD 2026-08-22 on measured T1/T2 volume (see ADR-008). Re-open this entry (and re-run the Workstream C measurement) once real production volume approaches T2 (~36 months of 3-branch history) or any single report is observed exceeding 1 s in practice.

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
- **Status:** Resolved (2026-08-22, Phase 14 Workstream D) — Closing permanently on the tax/discount/order-type portion, which was fully and finally decided by ADR-015 (Phase 5 planning) and confirmed unbuilt-by-design again at UI Revamp Phase 2 (DESIGN.md §21.2's discount tag): none get schema support in v1, `Sale.totalAmount = Σ SaleItem.lineTotal`, and discounts are expressed entirely through the existing per-line price override (`unitPriceAtSale` + `isPriceOverridden`). This portion of the entry was aging as "Partially resolved" alongside three unrelated items that were never touched by ADR-015 at all — those are split out to **DEBT-044** below so a genuinely-closed decision stops being tracked next to genuinely-open ones.

### DEBT-044 — SKU/barcode scanning, expense approval state, and cashier shift remain unbuilt (split from DEBT-004)

- **Date logged:** 2026-08-22
- **Found during:** Phase 14 Workstream D triage — split out of DEBT-004, whose tax/discount/order-type portion closed permanently (ADR-015) while these three items were never addressed by that ADR or any later phase.
- **Description:** The approved mockup (`OhMyPos App.dc.html`) still renders three things ERD v3 has no field for: SKU and barcode scanning on products, an expense/purchase approval state ("menunggu persetujuan · perlu ditinjau" — distinct from `SupplierPurchase.paymentStatus`'s `PAID`/`UNPAID`/`PARTIALLY_PAID`, which has no review step), and a cashier shift ("Shift #4192 · dibuka 08:12"). Shift management is an explicit PRD §3 non-goal.
- **Why deferred:** Each needs its own schema-approval gate and none has been requested by the business owner. Rendering them as static UI would promise behaviour the system does not have (the same standing judgement DEBT-004 already made for tax/discount).
- **Impact if unaddressed:** Three silent expectation gaps against the approved mockup. No correctness impact — nothing currently promises this behaviour in the shipped UI.
- **Trigger condition:** The business owner asks for barcode scanning, a purchase-approval workflow, or shift tracking — independently, since the three are unrelated and there is no reason to bundle them.
- **Proposed resolution:** Take each through its own schema-approval gate when requested: (1) `Product.sku`/`Product.barcode` plus a scan-to-add POS flow; (2) a `SupplierPurchase` or `Payable` review-state field distinct from `paymentStatus`; (3) a `Shift` model plus open/close UI, which PRD §3 would need to un-deprecate first.
- **Priority:** Low
- **Status:** Open

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
- **Re-flagged 2026-08-22 (Phase 14 gate):** Still no second write path to `PayableSettlement`. Workstream B's B4 (30-way concurrent settlement against one payable) now provides direct evidence the service-layer `FOR UPDATE` lock alone holds under real contention: exactly 15 succeeded, 15 returned 409, `remainingBalance` reached exactly `0.00`, and zero 5xx occurred across repeated runs. Trigger unchanged — reopen only if a second write path is added.

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
- **Re-flagged 2026-08-22 (Phase 14 gate):** Now has a measured number, which this entry previously lacked entirely. Workstream B's B2 (50-way oversubscription on one material) captured per-request latency under real lock contention: p50=75ms, p95=173ms, max=183ms for 50 concurrent sale requests. The lock-acquisition phase is not separated from total request time in this measurement, so it is an upper bound, not an isolated figure — but at this magnitude it is nowhere near "a meaningful share of sale latency" at the trigger's stated bar. Trigger unchanged.

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
- **Re-flagged 2026-08-22 (Phase 14 gate):** Blocked on a business-policy answer from the owner, not on engineering. No new information this phase.

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
- **Re-flagged 2026-08-22 (Phase 14 gate):** Trigger ("branch-scoped views for Owner/Admin exist") has not fired.

### DEBT-016 — Report rows are unpaginated

- **Area:** `apps/api/src/modules/reports` (Dashboard 3)
- **What:** `GET /reports/product-profit` returns one row per product sold in the range with no pagination, and `GET /reports/daily-income` one row per day (bounded at 366 by `MAX_REPORT_RANGE_DAYS`).
- **Why it was accepted:** at v1 scale the product catalogue is a café menu — tens of rows. The frontend renders the whole set as one table plus one chart, so paginating it would complicate both sides for no benefit today.
- **Trigger to fix:** the product catalogue exceeding ~500 active products, or a product-profit response exceeding ~1 MB.
- **Fix when triggered:** additive query parameters (`page`, `limit`) on the product-profit endpoint reusing `PaginationQuerySchema` — not a redesign.
- **Status:** Open
- **Re-flagged 2026-08-22 (Phase 14 gate):** Catalogue is still tens of products; trigger (~500) has not fired.

### DEBT-013 — No closing-stock snapshots — query-time calculation scale boundary

- **Date logged:** 2026-08-17
- **Found during:** Phase 6 (Inventory planning §13.4)
- **Description:** Inventory Summary (`GET /inventory/summary?period=YYYY-MM`) computes opening, in, out, and closing quantities entirely at query time via `groupBy` over `StockMovement` (ADR-008). There is no stored `closingStock` table or snapshot column.
- **Why deferred:** Query-time computation is correct by construction (no cache invalidation or out-of-sync snapshot anomalies). At v1 transaction volume for a single small multi-branch business (~5,000 movements/month), indexed aggregation runs well under 20ms.
- **Impact if unaddressed:** At higher volume (e.g. multi-year history, >50,000 movements), multi-period report queries will scan larger index ranges.
- **Trigger condition:** `GET /inventory/summary` p95 response time exceeds 250ms under production volume.
- **Measured (2026-08-22, Phase 14 Workstream C):** Against the same T2 volume tier as DEBT-001 (36 months, 1,808,816 `stock_movements`), `GET /inventory/summary?period=2026-08` (the latest month — the worst case, since the "opening balance" sub-query has no lower date bound and must scan every movement before the period): HTTP p50 = 222 ms, p95 = 768 ms over 20 warm requests. `EXPLAIN (ANALYZE, BUFFERS)` on the opening-balance sub-query alone (`SELECT raw_material_id, direction, SUM(quantity) FROM stock_movements WHERE movement_date < ... GROUP BY raw_material_id, direction`) shows a **`Parallel Seq Scan` on `stock_movements`**, 391 ms execution — expected, since the query is unbounded by design (ADR-008), not a missing index. **This entry's own trigger (p95 > 250 ms) has fired** at T2 volume, though System Design §11's global report trigger (>1 s at a one-year-equivalent range) has not — the two thresholds disagree on purpose (this entry was written with a stricter, inventory-specific budget). Growth is linear in total historical `stock_movements` row count with no upper bound (unlike the Dashboard-3 reports, which are bounded by the selected date range), so this will keep growing release over release even if nothing else changes — re-measure whenever the seeded volume grows past T2, not just once.
- **Proposed resolution:** Introduce a monthly closing snapshot table populated on period close or asynchronously computed read-model. **Not proposed for action now** — 768 ms p95 is tolerable for a back-office report and still under System Design §11's 1 s global budget; flagging for awareness given the entry's own tighter 250 ms threshold has technically fired, not requesting a schema change.
- **Priority:** Low → **Medium** (raised 2026-08-22: the entry's own trigger has now measurably fired, even though the global report budget has not)
- **Status:** Open — re-flagged 2026-08-22 (Phase 14 Workstream C) with measured T2 numbers, superseding the "~5,000 movements/month, well under 20ms" estimate in this entry's own "Why deferred" line above (now stale — see the 391 ms/768 ms measurement instead).

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
- **Re-flagged 2026-08-22 (Phase 14 gate):** Blocked on whether retrospective valuation is ever wanted. No new information this phase.

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
- **Re-flagged 2026-08-22 (Phase 14 gate):** Requires an ADR revisiting ADR-004; no business driver has emerged.

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
- **Re-flagged 2026-08-22 (Phase 14 gate):** POS/UI gaps blocked on schema decisions or explicitly-approved deviations. No new information this phase.
- **Priority:** Low
- **Status:** Partially resolved (2026-08-20, UI Revamp Phase 2) — (1) the §22 filter row now exists, bound to availability buckets rather than menu categories; see **DEBT-026**. (2), (3) (pre-existing — `Product.photoUrl` already rendered before this phase, unaffected by DEBT-018's original wording), and (4) remain **Open**.

### DEBT-019 — `NEXT_PUBLIC_API_BASE_URL` fallback port disagrees with the actual API port

- **Date logged:** 2026-08-17
- **Found during:** Phase 8c (TASK-017), while verifying the POS against the running stack
- **Description:** `apps/web/lib/api.ts` falls back to `http://localhost:4013/api/v1` when `NEXT_PUBLIC_API_BASE_URL` is unset, but `apps/api/.env` sets `PORT=4015`, and `.env.local`, `.env.example` and `.agents/skills/e2e-playwright/SKILL.md` all say 4015. Frontend test mocks also hardcode 4013.
- **Why deferred:** Not touched in this task — `.env.local` is present in a working checkout, so the fallback never fires and fixing it was outside the phase's scope (AGENTS.md: edit only files strictly required).
- **Impact if unaddressed:** A developer who clones without `.env.local` gets connection failures against a port nothing listens on, with no error pointing at the cause.
- **Trigger condition:** Anyone setting up the repo without copying `.env.example`, or CI running the web app without the env var.
- **Proposed resolution:** Change the fallback in `lib/api.ts` to 4015 and update the three test mocks that assert 4013. One-line change plus test fixture updates.
- **Priority:** Low
- **Status:** Resolved (2026-08-22, Phase 14 Workstream D) — Standardized on 4015 everywhere; the actual scope was larger than this entry's original wording (`lib/api.ts` had already been fixed to 4015 by the time this was picked up). Fixed: `apps/api/src/main.ts`'s fallback, `docker-compose.yml` (`PORT`, `ports`, `NEXT_PUBLIC_API_BASE_URL`), `apps/api/Dockerfile` and `Dockerfile.dev` `EXPOSE`, `.github/workflows/ci.yml`'s e2e job `PORT`, `README.md`'s port table, and all 16 frontend test mocks hardcoding `http://localhost:4013/api/v1`. Verified with the full frontend suite (49 files / 328 tests, all passing).

### DEBT-020 — The e2e suite and `pnpm dev` share one database, and `db:seed` cannot restore it

- **Date logged:** 2026-08-17
- **Found during:** Phase 8c (TASK-017) — the dev database was found empty after running the api e2e suite
- **Description:** `apps/api/test/*.e2e-spec.ts` run their `cleanup()` against the same Postgres database `pnpm dev` uses, so running the e2e suite wipes local development data. AGENTS.md points at `pnpm --filter api db:seed` to "reset synthetic data", but the seed's `rawMaterial.upsert` (and others) use `update: {}` — on an existing row it changes nothing, so it recreates missing rows but cannot restore a `currentStock` that drifted. Only `prisma migrate reset` truly resets.
- **Why deferred:** Out of scope for a frontend phase, and it needs a decision about how test isolation should work rather than a quick patch.
- **Impact if unaddressed:** Anyone running `test:e2e` silently loses their dev data and then follows a documented recovery step that does not fully recover it.
- **Trigger condition:** Any developer running the e2e suite while relying on local dev data — i.e. routinely.
- **Proposed resolution:** Point the e2e suite at a separate database via a `DATABASE_URL` override in `test/setup-e2e.ts` or a dedicated `.env.test`. Separately, correct AGENTS.md's claim about `db:seed`, or make the seed genuinely idempotent-restoring for the fixture fields.
- **Priority:** Medium
- **Status:** Resolved (2026-08-22, Phase 14 Gate 2) — `apps/api/test/setup-e2e.ts` now loads a dedicated `.env.test` (git-ignored, `.env.test.example` checked in) pointing at a separate `ohmypos_e2e` database, created and migrated once via the one-time `createdb` step documented in `.env.test.example`'s header. `pnpm dev`'s database is no longer touched by `test:e2e` at all, which was the actual harm this entry described — the `db:seed`-cannot-fully-restore-drift observation stands but is now a minor, unrelated note rather than a routine data-loss trap. AGENTS.md §8 left as-is; it already only claims `db:seed` "reset[s] synthetic data," which is accurate for the common case (missing/deleted rows) even though it doesn't repair a drifted `currentStock` on an existing row.

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
- **Re-flagged 2026-08-22 (Phase 14 gate):** Real gap, but it is feature work, not verification — out of scope for this phase (AGENTS.md strict scope).

### DEBT-022 — No Zod schema for the `Allocation`-with-`ledgerEntry` composed response

- **Date logged:** 2026-08-18
- **Found during:** Phase 8j (TASK-022 / Frontend Reconciliation Screen)
- **Description:** `GET /allocations/transaction/:txnId` includes the related `ledgerEntry` on every row (`allocation.controller.ts:57` → `allocation.service.ts:174`), but `AllocationResponseSchema` (`packages/api-contracts/src/allocation.schema.ts`) does not describe that composed shape. `apps/web/hooks/useReconciliation.ts` expresses it as a hand-composed intersection type (`AllocationWithLedgerEntry = AllocationResponse & { ledgerEntry: LedgerEntryResponse }`) instead of a schema-derived type, which is an exception to AGENTS.md rule 9 ("Zod schemas drive both API validation and TS types... do not manually type request/response objects if a Zod schema exists").
- **Why deferred:** Adding a proper `AllocationWithLedgerEntrySchema` is a `packages/api-contracts` change, which needs the corresponding controller/service response to actually conform to it on the API side too — an API-contracts change requiring updates on both `apps/api` and `apps/web` in the same PR (ADR-010) — out of scope for a frontend-only phase.
- **Impact if unaddressed:** The composed shape can silently drift from what the controller actually returns (e.g. a future field added to the include) without a compile-time or runtime check catching it — the intersection type is asserted, not validated.
- **Trigger condition:** Any other screen needs the same `Allocation`-with-`ledgerEntry` shape (duplicating the intersection type), or the `allocation.controller.ts` response shape changes.
- **Proposed resolution:** Add `AllocationWithLedgerEntrySchema` to `packages/api-contracts/src/allocation.schema.ts` (composing `AllocationResponseSchema` and `LedgerEntryResponseSchema`) and use the inferred type on both `apps/api`'s controller return type and `apps/web/hooks/useReconciliation.ts`.
- **Priority:** Low
- **Status:** Resolved (2026-08-22, Phase 14 Workstream D) — Added `AllocationWithLedgerEntrySchema` (`AllocationResponseSchema.extend({ ledgerEntry: LedgerEntryResponseSchema })`) to `packages/api-contracts/src/allocation.schema.ts`. `apps/web/hooks/useReconciliation.ts` now imports the inferred `AllocationWithLedgerEntry` type instead of hand-composing the intersection. The backend side (`allocation.service.ts`'s `findByTransaction`) was deliberately left returning the raw Prisma object unchanged — every other method in that service (and the equivalent pattern across the rest of `apps/api`) already relies on NestJS's default Decimal→string JSON serialization rather than an explicit per-endpoint mapper; adding one only here would be inconsistent with that established pattern for a Low-priority, non-functional gap. Verified with `tsc --noEmit` on both packages and the full frontend suite (49 files / 328 tests).

### DEBT-023 — Seed script writes KASIR rows with `branchId: null`, bypassing the role/branch invariant

- **Date logged:** 2026-08-18
- **Found during:** TASK-024 (Phase 9 manual browser smoke test) — the Users table showed "—" in the Cabang column for both seeded KASIR accounts.
- **Description:** `apps/api/prisma/seed.ts` inserts KASIR users via `prisma.user.createMany` directly against Prisma, not through `UsersService.create()`. That bypasses `assertRoleBranchConsistent` entirely, so the two seeded KASIR accounts (`kasir@ohmypos.local`, `qa.kasir@ohmypos.local`) ended up with `branchId: null` in the local dev database — a state `UsersService`/`packages/api-contracts` treat as invalid everywhere a real request goes through the service layer (ADR-011 §2).
- **Why deferred:** Discovered incidentally while smoke-testing Phase 9's new Users UI, not something Phase 9 was scoped to fix — the seed script is shared infrastructure outside this task's file list, and fixing it means deciding whether the seed should hardcode a branch id or create one first, which is a small design choice better made deliberately than as a drive-by edit.
- **Impact if unaddressed:** Anyone running `db:seed` gets KASIR accounts that can log in (auth doesn't check this) but are invisible to any future branch-scoped reporting/filtering that assumes every KASIR has a branch — a state that could otherwise only be reached by a bug, now reachable by just seeding fresh.
- **Trigger condition:** Next time `seed.ts` is touched for any reason, or before any task that relies on seeded KASIR accounts already having a valid branch assignment.
- **Proposed resolution:** Have `seed.ts` create (or look up) a branch before creating its KASIR rows and assign `branchId` to it, so the seed itself satisfies the same invariant the service layer enforces — or route seed user-creation through `UsersService` instead of `prisma.user.createMany` directly, which would catch this class of drift automatically in the future.
- **Priority:** Low
- **Status:** Resolved (2026-08-22, Phase 14 Workstream D triage) — Verified against current `apps/api/prisma/seed.ts`: KASIR rows are created via `prisma.user.upsert` (not `createMany`) with `branchId: branches[0].id` set in both the `create` and `update` branches, and `qa.kasir@ohmypos.local` no longer exists in the seed at all. The fix landed in an untracked prior task; this entry is closed on verification, not on new work.

### DEBT-024 — Export → download never verified in a browser

- **Date logged:** 2026-08-20
- **Found during:** TASK-045 (Export XLSX Buttons)
- **Description:** All 8 new Export buttons were verified by unit test (`lib/export.test.ts`, workbook structure only) and, for 3 of the 8 page areas (Expenses, Reconciliation, Attendance), by fetching SSR HTML through a direct API-login + curl session to confirm the button actually renders in the DOM. Nobody has clicked Export in a live browser and confirmed a `.xlsx` file actually downloads and opens with the correct columns/values — the Claude-in-Chrome browser extension wasn't connected in the session this was built in, so the MCP Playwright/browser verification workflow AGENTS.md §6 calls for wasn't run.
- **Why deferred:** Tooling unavailability in that session, not a scoping decision.
- **Impact if unaddressed:** A runtime-only issue (e.g. `exceljs`'s browser build failing to resolve under this Next.js version, a Blob/anchor download quirk in a specific browser) would ship undetected.
- **Trigger condition:** Next session where a browser (Claude-in-Chrome or manual) is available — do one click-through per page area (Reports, Expenses, Inventory, Reconciliation, Devices/Attendance) and confirm the file downloads and opens with correct data.
- **Proposed resolution:** Run the standard `.agents/skills/e2e-playwright/SKILL.md` workflow against each Export button once, capture a screenshot/confirmation, and mark this entry Resolved.
- **Priority:** Medium — doesn't touch money/stock correctness (Playbook §10), but it's a shipped user-facing feature with zero live verification.
- **Status:** Re-flagged, still Open (2026-08-22, Phase 14 Workstream D). A Claude-in-Chrome session **was** connected this time, and login was attempted repeatedly against both the Turbopack dev server and a `next build && node .next/standalone/apps/web/server.js` production build; every attempt failed with "Failed to fetch." At the time, this was **incorrectly** attributed to the browser automation tool's own sandboxing (the reasoning: `curl` to the same endpoint succeeded instantly and consistently, so the app must be fine). That theory was wrong — the user hit the exact same "Failed to fetch" independently in their own normal browser shortly after, which `curl` could never have caught because `curl` doesn't run CORS preflight at all. **Real root cause found:** `apps/api/src/main.ts`'s `enableCors({ allowedHeaders: [...] })` listed only `Content-Type` and `Authorization` — it never included `x-correlation-id`, the header `apps/web/lib/api.ts`'s `doFetch` has sent on every request since this same Phase 14 session's E-8 change. Every real browser (and, it turns out, the Claude-in-Chrome tab too — not a sandboxing artifact) correctly blocked the request at the CORS preflight stage. Fixed by adding `'x-correlation-id'` to `allowedHeaders`; see `ERR-021`. This entry stays Open (not Resolved) — the CORS fix unblocks login, but the actual Export→download click-through this entry asks for has still not been run.
- **Status 2026-08-23 (TASK-073): Resolved in substance, with one honest caveat.** A Claude-in-Chrome session was connected, login succeeded (the ERR-021 CORS fix holds), and Export was clicked in a live browser on three screens. The runtime risks this entry was opened for are now **disproven**: `exceljs` resolves and runs in the browser under this Next.js version, and the workbook it produces is a real, valid file — captured at the `Blob` boundary, **26,344 bytes, magic bytes `PK`** (a `.xlsx` is a ZIP container), correct spreadsheetml MIME type.
  - **Evidence is stronger than "it opened in Excel":** the sheet XML was inflated in-page via `DecompressionStream` and its rows counted. `pergerakan-stok` produced **595 `<row>` elements = 1 header + 594 data rows**, matching `meta.total` = 594 exactly, against a screen showing 10. `utang-pemasok` produced **31 data rows** against 10 on screen — literally the scenario this entry's sibling DEBT-048 described. `laba-rugi` came out named `laba-rugi_2026-01-01_sd_2026-01-31.xlsx`, closing DEBT-025 in a real browser.
  - **The caveat, stated plainly: no file ever reached the Downloads folder.** The `<a download>` click is suppressed in the automated tab. This was *not* assumed — the 2026-08-22 mistake on this very entry was blaming the tool for what turned out to be a real CORS bug, so the opposite error was actively guarded against: a **bare `Blob` + `<a download>` probe containing no application code at all** was dispatched and likewise produced no file. The block is therefore in the automation environment, not in `lib/export.ts`. Everything up to and including the valid workbook in memory is proven; the final OS-level hand-off is the one link still unwitnessed.
  - **What is left, and it is small:** one human click of Export in an ordinary (non-automated) Chrome window, confirming the file lands and opens. Everything that could plausibly have been broken in code has been shown to work.

### DEBT-025 — Export filenames use the export-time date, not the report's selected date range

- **Date logged:** 2026-08-20
- **Found during:** TASK-045 (Export XLSX Buttons)
- **Description:** The 5 Reports views (`ProfitLossView`, `DailyIncomeView`, `TopProductsView`, `ProductProfitView`, `IncomeByPaymentMethodView`) name their exported file `<report>_<today's date>.xlsx` rather than reflecting the `startDate`/`endDate` the user actually filtered by — e.g. exporting January 2026 data on 2026-08-20 downloads `laba-per-produk_2026-08-20.xlsx`, not something naming the January range.
- **Why deferred:** `ReportsClient.tsx` owns the `startDate`/`endDate` state; the 5 leaf view components don't currently receive them as props. Threading them through purely to build a filename string felt like scope creep beyond the approved plan, which only committed to adding the buttons.
- **Impact if unaddressed:** The exported filename is misleading about which period the data covers — a minor but real UX gap for a feature whose entire purpose is producing a file someone else (accountant, payroll) will open later without the on-screen context.
- **Trigger condition:** Next time any of these 5 view components are touched for another reason, or if a user reports confusion about export filenames.
- **Proposed resolution:** Add a `filters: ReportFilters` (or `startDate`/`endDate`) prop to the 5 view components, sourced from `ReportsClient`'s existing state, and interpolate it into `exportFilename` in place of `new Date().toISOString().slice(0, 10)`.
- **Priority:** Low
- **Re-flagged 2026-08-22 (Phase 14 gate):** Feature polish, out of scope for verification (AGENTS.md strict scope).
- **Status:** **Resolved 2026-08-23 (TASK-073)** — exactly as proposed. A shared `rangeSuffix(startDate, endDate)` in `apps/web/lib/export.ts` returns `2026-01-01_sd_2026-01-31`, collapses a single-day range to one date, and falls back to today when there is no range. `ReportsClient` now threads `filters` into all five views (`TopProductsView` already had it), and `StockMovementsClient` and `AttendanceLogTable` use their own date filters the same way. `PayablesTab` and `BankTransactionsTable` deliberately keep the export-time date: neither screen has a date-range filter, and a payable is a state of today rather than a range. `AttendanceCalendarMatrix` was already correct and was not touched. One further defect was found and fixed while doing this: `ProfitLossView`'s export callback omitted the range from its `useCallback` deps, so changing the range and exporting wrote the *previous* range into the filename.

### DEBT-026 — POS filter row buckets by availability, not menu category

- **Date logged:** 2026-08-20
- **Found during:** UI Revamp Phase 2 (POS Product Discovery & Filter Cards)
- **Description:** DESIGN.md §22 illustrates the POS filter row with menu categories (Foods, Beverage). `Product` has no category column, so the row was implemented with availability buckets (Semua Produk / Siap Dibuat / Stok Habis / Tanpa Resep, computed by `lib/pos/product-filters.ts` from the cart-aware headroom in `availability.ts`, ADR-013) using the same bordered-card anatomy §22 specifies. Approved deviation, 2026-08-20.
- **Why deferred:** Not deferred — a substitution, not an omission. See DEBT-018 for the prior state (row simply absent) and DEBT-004 for the standing rule against rendering UI that promises absent behaviour.
- **Impact if unaddressed:** None currently — the row is fully functional against real data, just labeled by availability rather than by menu category.
- **Trigger condition:** The owner asks for menu categories.
- **Proposed resolution:** Add `Product.category` (or a `ProductCategory` table) through the schema-approval gate; `CategoryFilterRow` already takes `{ id, label, count }[]` and needs no change, only a different `countByBucket` source in `product-filters.ts`.
- **Priority:** Low
- **Status:** Open
- **Re-flagged 2026-08-22 (Phase 14 gate):** Trigger ("the owner asks for menu categories") has not fired.

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