# OhMyPos — Error Log

**Purpose:** Record every real error/bug found during implementation — not just what broke, but why, how it was fixed, and how to stop it from happening again. This is a debugging accelerant for future-you (or a future AI session): the next time something looks similar, check here before re-diagnosing from scratch.

**Depends on:** Engineering Playbook v3 (Section 10 of the Project Handbook has a smaller, doc-level troubleshooting table for architecture-level symptoms — this log is for actual errors hit during implementation, at whatever granularity they occurred)

---

## How to use this log

- Add one entry per distinct error — not per occurrence. If the same root cause shows up in three different tasks, that's one entry with three dates noted, not three entries.
- Log real errors actually encountered — compile errors, failed tests, wrong data in the database, a race condition that actually manifested, a rejected PR for a correctness bug. Don't log hypothetical or anticipated errors here; those belong in the Playbook's self-review checklist instead.
- **Root cause, not just symptom.** "The stock number was wrong" is a symptom. "The `FOR UPDATE` lock was missing on `RawMaterial` inside the `Sale` transaction, so two concurrent sales both read stale stock" is a root cause.
- **Prevention must be concrete and checkable** — a new test case, a new self-review checklist item, a linter rule, an ADR update. "Be more careful" is not a valid prevention entry.
- If an error reveals a gap in the Engineering Playbook or an ADR, fix the source document too and reference that update here — don't let the same class of error need re-discovering.

---

## Entry Template

```
### ERR-XXX — <short title>

- **Date found:** YYYY-MM-DD (add further dates if the same root cause recurs)
- **Found during:** <task/phase — link to the Task Log entry if one exists>
- **Symptom:** <what was actually observed — an error message, wrong output, a failed
  test, a data inconsistency>
- **Root cause:** <the actual underlying reason, not the symptom restated>
- **Resolution:** <what specifically fixed it — code change, migration, config change>
- **Prevention:** <concrete, checkable step to stop recurrence — new test, new
  self-review checklist item (Playbook §16), new ADR, new lint rule>
- **Severity:** Low | Medium | High | Critical <High/Critical = touched money or stock
  correctness>
```

---

## Log

### ERR-017 — Opening stock mutation did not invalidate inventory summary query cache

- **Date found:** 2026-08-21
- **Found during:** TASK-058 (Opening Stock & Inventory UI Fixes)
- **Symptom:** After successfully saving opening stock in the "Stok Awal" tab, switching to the "Ringkasan Pergerakan Stok" tab did not reflect updated opening stock values until a manual page refresh.
- **Root cause:** `useUpsertOpeningStock`'s `onSuccess` handler only invalidated the `openingStockWorksheet` query key and forgot to invalidate `inventorySummary`. TanStack Query continued serving stale cached data for the summary endpoint.
- **Resolution:** Added `queryClient.invalidateQueries({ queryKey: INVENTORY_QUERY_KEYS.inventorySummary(variables.periodMonth) })` to `useUpsertOpeningStock` in `apps/web/hooks/useInventory.ts`.
- **Prevention:** When a write mutation affects multiple dashboards/views, audit all query keys reading that mutated domain and write unit tests asserting query invalidations for all related view keys.
- **Severity:** Low — UI cache staleness only, database was updated correctly.

### ERR-016 — `pdfjs-dist` ESM bundle fails in Jest CommonJS runtime with `Cannot use import.meta outside a module`

- **Date found:** 2026-08-21
- **Found during:** TASK-057 (Upgrade PDF Parser to pdfjs-dist)
- **Symptom:** `pnpm --filter api test` crashed in `pdf-text.util.spec.ts` with `SyntaxError: Cannot use 'import.meta' outside a module` when importing `pdfjs-dist/build/pdf.mjs` or `unpdf`.
- **Root cause:** `apps/api` compiles and tests under CommonJS (`"module": "commonjs"`), while `pdfjs-dist` v4 and `unpdf` ship modern ES modules utilizing `import.meta.url`. Jest's CJS runtime executor cannot parse `import.meta` without `--experimental-vm-modules`.
- **Resolution:** Pinned `pdfjs-dist` to `^3.11.174` and consumed its official CommonJS legacy build via `require('pdfjs-dist/legacy/build/pdf.js')` with proper TypeScript typing casts.
- **Prevention:** For libraries dealing with PDF/WASM/Canvas in NestJS/CJS environments, always check for dedicated `legacy/build/*.js` builds or ensure CJS compatibility before runtime invocation.
- **Severity:** Low — caught during CI/test execution, resolved before merge.

### ERR-015 — Test fixture with `hasRecipe: false` made a product silently un-addable to cart

- **Date found:** 2026-08-20
- **Found during:** TASK-051 (OWNER branch-selectable POS access) — writing `PosScreen.owner-branch.test.tsx`
- **Symptom:** `fireEvent.click(screen.getByTestId('product-card-...'))` produced no visible error, but `cart-total` stayed `Rp 0` and the submit button stayed disabled — the click appeared to do nothing.
- **Root cause:** `canAddProduct()` (`apps/web/lib/pos/availability.ts`) unconditionally returns `false` for any product with `hasRecipe: false` — `hppAtSale` would have to be `null` at sale time, which the server rejects (`RecipeIncompleteException`, ADR-015) — so `ProductCard`'s `<Button disabled={!addable}>` silently no-ops the click. The new test's product fixture was copied loosely from an unrelated earlier fixture (`AIR`/Air Mineral in `PosScreen.test.tsx`, which is deliberately non-addable to test the "no recipe" empty state) instead of the addable `KOPI_SUSU` shape.
- **Resolution:** Changed the fixture to `hasRecipe: true` with an empty `recipeItems: []` (a valid "recipe exists, needs no ingredients" edge case `canAddProduct` accepts), and gave it a non-null `hpp`/`margin` to match.
- **Prevention:** When writing a new POS test fixture meant to be addable, copy the shape of an existing *addable* fixture (`KOPI_SUSU`/`LATTE` in `PosScreen.test.tsx`, both `hasRecipe: true`) rather than assuming `hasRecipe: false` is a harmless default — it silently disables the primary interaction instead of throwing.
- **Severity:** Low — test-authoring error only, caught before merge, no production impact.

### ERR-014 — Radix `Select` leaves `<body>` with `pointer-events: none` briefly after closing, swallowing the next test click

- **Date found:** 2026-08-20
- **Found during:** TASK-051 (OWNER branch-selectable POS access) — writing `PosScreen.owner-branch.test.tsx`
- **Symptom:** After `fireEvent.click`-ing a `SelectItem` to pick a branch (confirmed selected — the trigger's displayed value updated correctly), the immediately-following `fireEvent.click` on a `ProductCard` did nothing: `cart-total` stayed `Rp 0`, `cart-submit` stayed disabled, and `await screen.findByText('Penjualan tercatat')` timed out.
- **Root cause:** Radix `Select`'s portal sets `document.body.style.pointerEvents = 'none'` while open and clears it asynchronously (via an effect, not synchronously with the click handler) once it closes. A `fireEvent.click` fired on a different element in the same synchronous test step can land while `<body>` still has `pointer-events: none`, which silently blocks the click from reaching its target in jsdom — no error is thrown, the click simply does nothing.
- **Resolution:** Added an explicit wait after every Select interaction in the test's `pickBranch()` helper: `await waitFor(() => expect(document.body.style.pointerEvents).not.toBe('none'))` before issuing any further `fireEvent.click`.
- **Prevention:** Any future test that interacts with a Radix `Select` (or other Radix component using the same body-lock pattern — `Dialog`, `Sheet`, `Popover`) and then immediately clicks something else outside it must wait for `document.body.style.pointerEvents` to clear first, not just for the visible DOM state to update. No prior test in this codebase exercised a full open-select-then-pick-an-item flow (`ReportFilterBar.test.tsx` only asserts static `disabled` state on the trigger), so this gotcha had no existing precedent to follow.
- **Severity:** Low — test-infrastructure gotcha only, caught before merge, no production impact.

### ERR-013 — Prettier formatting error on multi-line destructured props and JSX attributes

- **Date found:** 2026-08-20
- **Found during:** TASK-047 (UI Revamp Phase 1: App Shell & Modern Sidebar Navigation)
- **Symptom:** `pnpm --filter web lint` failed with `prettier/prettier` errors in two new files: `SidebarAccountCard.tsx` (an inline destructured props type `{ user, className }: { user: UserResponse; className?: string }` that Prettier wanted expanded across lines) and `Topbar.tsx` (a self-closing `<span aria-hidden className="..." />` that Prettier wanted with each attribute on its own line).
- **Root cause:** Hand-written JSX/TS was typed to fit Prettier's *printWidth* visually but didn't match its actual line-length/wrapping algorithm for object type literals and multi-attribute JSX tags — the same class of error as ERR-012, just triggered by different constructs (component prop types and JSX attribute lists instead of a `z.infer<...>` export).
- **Resolution:** Ran `npx eslint --fix` scoped to the two files; Prettier auto-reformatted both to its canonical wrapping and `pnpm --filter web lint` then passed clean.
- **Prevention:** Same as ERR-012 — run `pnpm turbo run lint` (or `pnpm --filter web lint --fix`) immediately after writing new TSX/TS files, before declaring a task's quality gate green, rather than assuming hand-formatted code already matches Prettier's output.
- **Severity:** Low

---

### ERR-012 — Prettier ESLint formatting error on single-line inferred type definition

- **Date found:** 2026-08-20
- **Found during:** TASK-046 (All Employees Leave History View in Leave Requests Page)
- **Symptom:** Turbo lint failed on `packages/api-contracts` with `prettier/prettier` error on `export type LeaveRequestUserSummary = z.infer<typeof LeaveRequestUserSummarySchema>;`.
- **Root cause:** Prettier max line length configuration expected a line break inside the `z.infer<...>` type declaration for longer identifier names.
- **Resolution:** Re-formatted the type export to span multiple lines matching Prettier rules (`export type LeaveRequestUserSummary = z.infer<\n  typeof LeaveRequestUserSummarySchema\n>;`) and executed `pnpm --filter web lint --fix`.
- **Prevention:** Always run `pnpm turbo run lint` after editing TypeScript contracts and schema files before finishing a task.
- **Severity:** Low

---

### ERR-011 — Incorrect password in seed credential mental model during test login

- **Date found:** 2026-08-20
- **Found during:** TASK-044 (Phase 13 E2E Verification)
- **Symptom:** Cashier test login with `Password123!` failed with `401 Invalid credentials`.
- **Root cause:** Default seed password defined in `apps/api/prisma/seed.ts` is `ChangeMe123!`, not `Password123!`.
- **Resolution:** Re-attempted login with standard seed password `ChangeMe123!` per `.agents/skills/e2e-playwright/SKILL.md` credentials table.
- **Prevention:** Always consult `.agents/skills/e2e-playwright/SKILL.md` for seed user credentials before initiating browser test runs.
- **Severity:** Low — testing workflow error only, no production impact.

---

### ERR-010 — Next.js Route Interception on Direct Relative `fetch('/api/v1/...')` Calls

- **Date found:** 2026-08-20
- **Found during:** TASK-037 (Product Photo Upload)
- **Symptom:** Product photo upload threw `Failed to fetch / Server Action not found` when trying to POST to `/api/v1/products/:id/photo`.
- **Root cause:** Direct relative `fetch('/api/v1/...')` in client components was intercepted by Next.js App Router routing rather than dispatching to the standalone NestJS backend at `http://localhost:4015/api/v1`.
- **Resolution:** Replaced raw `fetch()` calls with the centralized `apiFetch` helper in `apps/web/lib/api.ts` which uses `NEXT_PUBLIC_API_BASE_URL` and properly handles multipart `FormData` without manually overriding boundary headers.
- **Prevention:** Always use `apiFetch` from `apps/web/lib/api.ts` for all API calls in `apps/web` hooks and services.
- **Severity:** Medium

---

### ERR-009 — Comma-formatted decimal inputs rejected by regex before transform in Zod primitive schema

- **Date found:** 2026-08-20
- **Found during:** TASK-038 (Recipe Decimal Input Validation)
- **Symptom:** Recipe editor rejected user input like `0,025` with `must be a decimal number written as a string` despite valid numeric intent.
- **Root cause:** `decimalString` primitive schema applied `.regex(/^-?\d+(?:\.\d+)?$/)` before `.transform()`, which failed on Indonesian/European comma decimals (`0,5`).
- **Resolution:** Updated `DECIMAL_PATTERN` to `/^-?\d+(?:[.,]\d+)?$/` and sanitized `,` to `.` via `.transform()` before scale and precision checks.
- **Prevention:** Decimal primitive schemas must accept comma and dot separators prior to string normalization.
- **Severity:** Medium

---

### ERR-008 — Missing `prisma generate` step after manual Prisma schema edits causes stale TypeScript client types

- **Date found:** 2026-08-19
- **Found during:** TASK-035 (Phase 11 — Attendance & Device Tracking)
- **Symptom:** `pnpm turbo run lint typecheck` failed in `apps/api` with `Property 'device' does not exist on type 'PrismaService'` and `Property 'attendanceRecord' does not exist on type 'PrismaService'`.
- **Root cause:** The Prisma schema migration was applied via `prisma migrate dev`, but the generated Prisma Client types in `apps/api/src/generated/prisma` were not regenerated / out of sync with the new schema models.
- **Resolution:** Ran `pnpm --filter api exec prisma generate` to rebuild the TypeScript client types matching the updated schema.
- **Prevention:** Include `prisma generate` in local development workflows or schema change execution scripts whenever `schema.prisma` is modified.
- **Severity:** Low

---

### ERR-007 — Remote Cloudinary avatars blocked by Next.js Content Security Policy

- **Date found:** 2026-08-19
- **Found during:** Phase 10b (TASK-034) — testing profile photo upload and avatar rendering in `apps/web`.
- **Symptom:** Profile photos uploaded to Cloudinary did not render in the browser (`<img>` broken/blocked).
- **Root cause:** `apps/web/next.config.ts` configured strict `Content-Security-Policy` with `img-src 'self' data: blob:`, blocking external image domains including Cloudinary CDN (`https://res.cloudinary.com`).
- **Resolution:** Added `https://res.cloudinary.com` to `img-src` in `securityHeaders` in `next.config.ts`.
- **Prevention:** Whenever adding new remote media hosting services, check and update CSP headers in `next.config.ts` alongside API contracts.
- **Severity:** Low — UI display issue, caught and resolved during task verification.

### ERR-006 — Cash-balance running total used the wrong end of `resolveReportRange`, including same-day entries it should have excluded

- **Date found:** 2026-08-18
- **Found during:** Phase 8i (TASK-023) — running the e2e suite for the new `GET /reports/cash-balance` endpoint immediately after writing `ReportsService.cashBalance`.
- **Symptom:** e2e Case 36 ("excludes entries dated on/after asOfDate") failed: `expect(row.balance).toBe('0.00')` received `'99999.00'` — an entry dated exactly on `asOfDate` was counted as already elapsed when it should not have been yet.
- **Root cause:** `cashBalance` computed its cutoff as `resolveReportRange(asOfDate, asOfDate).to`. `period.ts`'s own contract defines `.to` as the *exclusive upper bound of the day after* the given date (start of `asOfDate + 1`, not start of `asOfDate`) — correct for a bounded `[from, to)` range query, but wrong for a single-instant cutoff. Using `.to` meant every entry dated anywhere during `asOfDate` itself (strictly before start of the *next* day) was counted as part of the balance, contradicting the response schema's own doc comment ("strictly before asOfDate's exclusive upper bound") and the intended "as of the start of this day" semantics.
- **Resolution:** Changed the cutoff to `resolveReportRange(asOfDate, asOfDate).from` — the start of `asOfDate` itself — so entries dated on or after `asOfDate` are correctly excluded from the running balance.
- **Prevention:** This exact line came from a plan document (`docs/plannings/phase-8i-dashboard-overview.md`) that had already been reviewed and amended for 4 other defects before execution — but the review didn't catch this one because it required cross-checking one section's SQL cutoff logic against another section's e2e test assertion, not just re-reading either section in isolation. Concrete takeaway: when a plan specifies both an implementation and its own tests, running those tests is not optional even for sections that already passed a prior doc review — a plan can be internally self-contradictory in ways only execution surfaces. No new test needed here (Case 36 already covers it); the general prevention is procedural, already reflected in the Task Log entry for TASK-023.
- **Severity:** High — this is money-correctness-adjacent (a report figure OWNER makes decisions from), caught before merge by the e2e suite the plan itself specified, not in production.

### ERR-005 — `useSuppliers` assumed a bare array for a paginated API response, breaking purchase dialog

- **Date found:** 2026-08-17
- **Found during:** Phase 8d (TASK-018) — Playwright E2E smoke pass on Purchase Entry form
- **Symptom:** Opening the "Catat Pembelian" dialog threw `Runtime TypeError: suppliers.map is not a function` at `PurchaseEntryFormDialog.tsx:203`.
- **Root cause:** `GET /suppliers` in `apps/api` returns a paginated envelope `{ data: SupplierResponse[]; meta: PaginationMeta }`, but `useSuppliers` in `apps/web/hooks/useExpenses.ts` typed and treated the return value as a raw array `SupplierResponse[]`. Frontend unit tests had passed because the test mock in `PurchaseEntryFormDialog.test.tsx` mocked `apiFetch` with a bare array `mockSuppliers` rather than the paginated envelope, creating false test confidence.
- **Resolution:** Updated `useSuppliers` in `apps/web/hooks/useExpenses.ts` to expect `{ data: SupplierResponse[]; meta: PaginationMeta }` with query `/suppliers?limit=100`, updated `PurchaseEntryFormDialog.tsx` to unpack `suppliersData?.data ?? []`, and aligned unit test mocks in `PurchaseEntryFormDialog.test.tsx` and `useExpenses.test.ts`.
- **Prevention:** Always verify the actual endpoint return type in `apps/api` (or its Zod response contract) when writing React Query hooks and their test mocks, rather than assuming unpaginated responses for reference data.
- **Severity:** Medium — broke purchase creation modal in the UI, caught and resolved during the live MCP Playwright smoke pass.

### ERR-004 — Phase 4's `Restrict` foreign keys broke two older e2e suites, but only on a seeded database

- **Date found:** 2026-08-16
- **Found during:** Review of TASK-006 (Phase 4) against the Phase 4 implementation plan (`docs/plannings/phase-4-purchasing-payables.md` — local working doc, gitignored, not part of this repository)
- **Symptom:** `pnpm --filter api test:e2e` passed when run twice in a row, and failed with 35 failures across `auth-rbac.e2e-spec.ts` and `master-data.e2e-spec.ts` when run straight after `pnpm --filter api db:seed`. Both suites reported "Test suite failed to run" rather than an assertion failure, because the error was thrown in `beforeAll`. **This is the order CI uses**, so it would have failed on the next pipeline run despite passing locally.
- **Root cause:** Phase 4 added `onDelete: Restrict` foreign keys pointing at tables the older suites wipe unconditionally. `auth-rbac`'s `prisma.ledgerEntry.deleteMany({})` hit `supplier_purchases_ledger_entry_id_fkey`, and `master-data`'s `prisma.rawMaterial.deleteMany({})` hit `supplier_purchase_items_raw_material_id_fkey`. Neither suite is wrong about wanting a clean table, and the `Restrict` rules are deliberate (financial history must never disappear because a parent row was deleted) — the defect is that a new module added children to tables that pre-existing suites delete, without extending their cleanup. It hid because an unseeded database has no purchasing rows, and because each e2e run left the tables empty for the next one; only the seed re-created the blocking rows.
- **Resolution:** Both suites now delete the Phase 4 children (`payableSettlement` → `payable` → `supplierPurchaseItem` → `supplierPurchase` → `stockMovement`) before their existing wipe, with a comment naming the constraint and the ADR-backed reason the `Restrict` stays. No production code and no schema changed — the FK behaviour is correct as designed.
- **Prevention:** Verified in both orders explicitly: `db:seed` → `test:e2e` and `test:e2e` → `test:e2e`, 71/71 green in each. General lesson for Phase 5 onward: **a green e2e run proves nothing about cleanup ordering unless it is run against a seeded database.** Any phase that adds a table with a `Restrict` FK must extend every existing suite that wipes the referenced table in the same change — the failure surfaces as `beforeAll` dying, which reads like an unrelated infrastructure problem rather than a data-model one.
- **2026-08-16 recurrence — `allocation-sum.e2e-spec.ts`:** the same root cause hit a third suite. That fix only covered the two suites known to be affected at the time; `allocation-sum.e2e-spec.ts`'s `beforeEach` and `resetDatabase` also delete `ledgerEntry`/`account`/`category`/`branch` directly, which hits `supplier_purchases_ledger_entry_id_fkey` when run **in isolation** against a seeded database (`pnpm db:seed && pnpm test:e2e -- test/allocation-sum.e2e-spec.ts`). It didn't show up in full-suite runs because `purchasing-payables.e2e-spec.ts` happened to run first and leave the database clean, masking the failure — the same class of false confidence this entry's own Prevention note warns about, just from an angle ("full suite passes") that the original fix didn't check. Found and fixed via the `review-remediation` skill; all three suites' cleanup now delete the Phase 4 children first, matching the pattern above. **Prevention amendment:** the isolated-run check (`db:seed` → `test:e2e -- <single-suite>`) must be run for **every** suite that touches a `Restrict`-referenced table, not just the ones a specific phase happened to modify — a full-suite pass hides exactly this failure mode.
- **Severity:** High — it breaks CI for every subsequent phase, and its intermittency (passing locally on a second run) is exactly the profile that gets misdiagnosed as flakiness rather than a real ordering bug.

### ERR-003 — Removing the JWT skew tolerance broke every login

- **Date found:** 2026-08-15
- **Found during:** TASK-004 (Phase 2 — Auth & RBAC)
- **Symptom:** After tightening the `tokenValidFrom` check to `iat * 1000 < tokenValidFrom`, every authenticated request in the RBAC suite returned 401 — including immediately after a successful login.
- **Root cause:** The JWT `iat` claim has **one-second** resolution. A token minted at 10:00:00.900 carries `iat = 10:00:00`, so `iat * 1000` is up to 999 ms *earlier* than the moment the token was actually issued. Compared against a `tokenValidFrom` of 10:00:00.500, a freshly minted valid token looks older than the revocation boundary and is rejected. The original tightening was an over-correction: it was aimed at Kasync's 2000 ms allowance, which existed to absorb Node-vs-PostgreSQL clock drift, and removed the part that was compensating for `iat` truncation along with it.
- **Resolution:** Allow exactly the claim's resolution and nothing more — `iat * 1000 + 1000 <= tokenValidFrom` — and separately eliminate the clock-drift problem at its source by writing `tokenValidFrom` from the application clock (`UsersService.create`) instead of relying on the column's database-side default.
- **Prevention:** `test/auth-rbac.e2e-spec.ts` asserts both directions: a fresh login must work, and a token must stop working after logout. The logout test deliberately crosses a second boundary, with a comment explaining why, so the assertion tests the real guarantee rather than a race. The residual behaviour is documented in the guard: revocation is precise to the second, so a token minted in the same second as a logout may survive it.
- **Severity:** Medium — caught in tests, never shipped, but the same misreading could equally have produced a too-loose window instead of a too-tight one.

### ERR-002 — BranchScopeGuard's query injection silently did nothing on Express 5

- **Date found:** 2026-08-15
- **Found during:** TASK-004 (Phase 2 — Auth & RBAC)
- **Symptom:** A `KASIR` listing `/ledger-entries` without a `branchId` received entries from **every** branch. The guard was supposed to inject the cashier's own branch into the query and reported success.
- **Root cause:** The guard did `request.query[field] = user.branchId`. Express 5 exposes `req.query` as a lazily-evaluated **getter**, so the assignment did not persist; the guard then returned `true` and the request proceeded completely unscoped. The write failed silently — no error, no warning.
- **Resolution:** Stopped mutating the request. `BranchScopeGuard` now **fails closed**: a `KASIR` calling a branch-scoped endpoint without stating a branch is rejected with 403, and must send its `branchId` explicitly. Rejecting cannot silently degrade the way injecting did.
- **Prevention:** Two e2e tests now cover the case that previously passed while being wrong — one asserting 403 when the branch is omitted, one asserting that a stated branch returns only that branch's rows, with a second branch's data present in the database to make the assertion meaningful. General lesson: a guard that grants access by **modifying** the request has a silent-failure mode; a guard that only ever denies does not.
- **Severity:** High — this is exactly the cross-branch data leak `BranchScopeGuard` exists to prevent (ADR-011 §4).

### ERR-001 — Kasync's trigger-exception filter is silently inert on Prisma 7

- **Date found:** 2026-08-15
- **Found during:** TASK-003 (Phase 1 — porting Kasync's modules)
- **Symptom:** Caught before it could ship. Kasync's `PostgresTriggerExceptionFilter` matches `PrismaClientKnownRequestError` codes `P2010`/`P2034` and reads the database message out of `error.meta.message`. Under Prisma 7 that branch never matches, so a rejection from `trg_check_allocation_sum` — an over-allocation, i.e. a client error — would have fallen through to the generic handler and returned **HTTP 500 instead of 400**, with the reason hidden from the caller.
- **Root cause:** Prisma 7 replaced the Rust query engine with the Query Compiler and driver adapters, which changed how database errors surface. A PL/pgSQL `RAISE EXCEPTION` now arrives as code **`P2039`** with the real PostgreSQL error nested at `meta.driverAdapterError.cause` (`originalCode: 'P0001'`, `originalMessage: '<the RAISE text>'`). Prisma 5's flat `P2010` + `meta.message` shape no longer occurs.
- **Resolution:** Added `src/common/errors/postgres-error.ts`, which unwraps the nested cause and returns `{ code, message }` regardless of shape, and rewrote the filter to match on the PostgreSQL SQLSTATE `P0001` rather than on a Prisma code. Confirmed empirically against Postgres 16 before any module was ported, then locked in by `test/allocation-sum.e2e-spec.ts`.
- **Prevention:** The e2e suite asserts the **HTTP status**, not just that an error occurred — `rejects an allocation that would exceed the transaction amount` expects 400 and matches the message, so a regression to 500 fails the build. More generally: when a ported module's error handling depends on a library's error *shape*, verify that shape against the actual runtime before porting, rather than assuming the shape carried over with the code. Recorded as a decision in TASK-003.
- **Severity:** High — it silently disables the enforcement path for the allocation-sum invariant, which is money-correctness (ADR-004, Playbook §7).

### ERR-005 — `SaleProductNotFoundException` extended the wrong base class, returning 400 instead of 404

- **Date found:** 2026-08-16
- **Found during:** TASK-008 (Phase 5 — Sales), while writing `sales.e2e-spec.ts` Case 10 (unknown product mid-cart)
- **Symptom:** Caught by the e2e suite before it could ship. `POST /sales` with a valid-but-nonexistent `productId` in the cart returned **400** (`"Product(s) not found: ..."`) instead of the **404** the plan's error-mapping table (§10.5) and `purchasing-payables.e2e-spec.ts`'s precedent (`PurchaseItemMaterialNotFoundException` → 404) both specify.
- **Root cause:** `sales.exceptions.ts` declared `class SaleProductNotFoundException extends BadRequestException` — a straightforward copy-paste slip while writing four exception classes in one file, three of which (`InactiveProductException`, `RecipeIncompleteException`, `CentralBranchNotSellableException`) genuinely are 400/409s. Nothing caught it at write time because the exception's *name* said "NotFound" and its *behavior* (throwing, with the right message) was otherwise correct — only the HTTP status was wrong, and only an e2e assertion on the literal status code (not just "it errored") could catch that.
- **Resolution:** Changed the base class to `NotFoundException`. One-line fix, caught before any code depending on the 404 contract was written.
- **Prevention:** `sales.e2e-spec.ts` Case 10 already asserts `res.status).toBe(404)` explicitly rather than just "not 2xx" — that assertion is what caught this, and it stays as the regression guard. General lesson, consistent with ERR-001: when a module defines several sibling exceptions with different HTTP statuses in one file, verify each one's base class against the plan's error-mapping table individually rather than trusting the file to be internally consistent — a class name matching intent is not proof the base class does.
- **Severity:** Low — caught in the same session before merge, never reached a running system. Logged because Playbook §10 puts the Sale flow in the "must have thorough tests" tier specifically to catch exactly this class of mistake, and it did.

### ERR-006 — Adversarial QA Review remediation (DEF-001 through DEF-009)

- **Date found:** 2026-08-17
- **Found during:** Remediation of Adversarial QA Review report (`docs/reports/2026-08-17-adversarial-qa-review.md`)
- **Symptom:** 9 high/critical defects discovered during adversarial QA audit:
  1. `DEF-001` (Critical): 6 back-office controllers (`Branches`, `Accounts`, `Categories`, `Matching`, `Reconciliation`, `Import`) lacked `RoleGuard` and `@Roles`, allowing `KASIR` unauthorized access.
  2. `DEF-002` (Critical): Deleting a branch with assigned cashiers set `User.branchId` to NULL (Prisma `SetNull`), orphaning cashiers into cross-branch access state.
  3. `DEF-003` (High): `BcaCsvParser` matched non-standard types (`CREDIT`, `DEBIT`, garbage) and defaulted them to `INFLOW`.
  4. `DEF-004` (Medium): Bank CSV duplicate hash generator collapsed multiple legitimate same-day identical deposits into duplicates, skipping valid customer deposits.
  5. `DEF-005` (Critical): Bank parsers and schema permitted negative transaction amounts, potentially corrupting account balances.
  6. `DEF-006` (Critical): Absence of automated e2e regression harnesses for concurrent sales oversubscription, double settlement, and statement dedup.
  7. `DEF-007` (Medium): List endpoints lacked `z.enum` validation for `sortBy` parameters, exposing Prisma to unhandled runtime 500 exceptions on invalid strings.
  8. `DEF-008` (Medium): `CreateSaleSchema.soldAt` lacked temporal bounds validation, permitting sales dated in arbitrary centuries.
  9. `DEF-009` (Low): `AuthService.logout` swallowed non-Prisma database errors with empty return, and `PayablesService.settle` lacked an explicit transaction timeout.
- **Root cause:** Incomplete guard application during initial controller setup; omission of explicit `onDelete: Restrict` in `schema.prisma`; loose CSV parsing rules relying on truthy defaults rather than strict allowlists; unvalidated query string pass-through into Prisma `orderBy`.
- **Resolution:**
  1. Applied Prisma migration `20260816202128_fix_branch_cascade_and_bank_amount_check` adding `ON DELETE RESTRICT` on `users.branch_id` and database CHECK constraint `amount >= 0` on `bank_transactions`.
  2. Added staff assignment pre-check in `BranchesService.remove()` throwing 400 Bad Request with staff names.
  3. Registered `RoleGuard` globally as `APP_GUARD` in `AppModule` and guarded all 6 controllers with `@Roles('OWNER', 'ADMIN')` or `@Roles('ADMIN', 'OWNER')`.
  4. Hardened `BcaCsvParser` and `MandiriCsvParser` with strict positive amount checks, uppercase allowlisting (`CR` -> `INFLOW`, `DB` -> `OUTFLOW`), and intra-file occurrence counting for deterministic distinct hashes. Added 12 unit tests.
  5. Added explicit `z.enum` SortBy schemas across all query contracts (`SaleSortBySchema`, `PayableSortBySchema`, `SupplierSortBySchema`, `LedgerEntrySortBySchema`, `SupplierPurchaseSortBySchema`, `BankTransactionSortBySchema`, `ReconciliationSortBySchema`) and bounded `soldAt` between 2024 and now + 5 min.
  6. Added 15000ms timeout to `PayablesService.settle` and refined `AuthService.logout` error handling to catch only `P2025`.
  7. Expanded `auth-rbac.e2e-spec.ts` (29 tests) and created `concurrency.e2e-spec.ts` (3 tests) validating serialized concurrency and deduplication integrity.
- **Prevention:** Automated full route RBAC matrix tests, concurrency regression tests, and parameter fuzzing tests running in monorepo CI.
- **Severity:** Critical — resolved all 9 defects and elevated quality assurance verdict to production-ready grade (>= 9.5 / 10).

_(Add the next entry above this line, following the template.)_