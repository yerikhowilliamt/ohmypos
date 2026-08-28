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

### ERR-036 — CI's Playwright suite broke because ADR-024 added a required field the E2E spec never filled

- **Date found:** 2026-08-28
- **Found during:** PR #79 CI — "Web E2E Tests (Playwright)" failed on both runs while API E2E, lint, typecheck, unit tests and build all passed
- **Symptom:** `raw-material-crud.spec.ts` timed out on `expect(page.locator('text=PW Bahan <ts>')).toBeVisible()` — "element(s) not found". The row never appeared because the material was never created.
- **Root cause:** ADR-024 (TASK-112) added `purchaseUnit` to `CreateRawMaterialSchema` as **required with no default**, and `RawMaterialFormDialog` initialises it to `''`. The Playwright spec filled only `#rm-name`, `#rm-unit`, `#rm-cost` and `#rm-threshold`, so the zod resolver rejected the submit client-side and the dialog silently stayed open. Nothing errored — the assertion just never became true. (`conversionFactor` was fine: it defaults to `'1'`.)
  - Why the other suites stayed green: the API e2e suites build their payloads from the contract types, so the compiler forced them to be updated during TASK-112. The Playwright spec drives the DOM by CSS id, which the compiler cannot check — so it was the one place the new required field could be forgotten.
- **Resolution:** The spec now fills `#rm-purchase-unit` and `#rm-conversion`, and uses a real conversion (stock `gram`, purchase `kg`, factor `1000`) instead of a degenerate 1:1 one, so it exercises the feature that broke it. The final assertion was tightened from a bare text match to the table row, and additionally asserts the row shows `1 kg =` — the created material now has to keep its conversion, not just its name.
- **Prevention:** The assertion is row-scoped and checks the conversion, so dropping either new field fails the spec instead of passing on the name alone. Verified locally: the full Playwright suite passes 8/8 against a live dev server.
- **Severity:** Low — CI-only, caught before merge, no product defect. Worth logging because of the class: **a required field added to a form is invisible to the type-checker in DOM-driven E2E specs.** When a contract gains a required field, grep `apps/web/e2e/` for the form's input ids as part of the change.

### ERR-035 — The opening-stock worksheet seeded its count field with an id-ID formatted number, so "5000" was resubmitted as five

- **Date found:** 2026-08-28
- **Found during:** Owner saving the Stok Awal worksheet for 2026-08 after the ADR-024 migration landed
- **Symptom:** `PUT /inventory/opening-stock` rejected the whole worksheet with `OpeningStockWouldGoNegativeException` naming ten materials at once — `Garam (koreksi -969.0000, hasil -57.0000)`, `Patty daging sapi (koreksi -146860.0000, hasil -4940.0000)`, and so on. Every offending material was one whose declared quantity was 1000 or more.
- **Root cause:** `OpeningStockWorksheetTable` seeded the editable count field with `formatQuantity(row.declaredQuantity)`. `formatQuantity` is a **display** formatter built on `Intl.NumberFormat('id-ID')`, where the thousands separator is a dot — so `"5000.0000"` became the string `"5.000"`. The field is bound straight to the form value and submitted verbatim as a `QuantityString`, which the API parses as **five**. The delta calculator then computed `5 − (carryForward + existingOpeningDelta)`, a correction of roughly minus the entire stock, and the negative-stock guard correctly refused the transaction. Nothing was written — the guard runs before the write phase, inside the transaction.
  - Not a regression from ADR-024: the prefill predates it. ADR-024 only made it visible, because the migration was the reason to open this screen again.
  - The same round trip breaks fractions in the other direction: `"0.5000"` renders as `"0,5"`, which fails `QuantityString`'s regex outright.
- **Resolution:** Added `toQuantityInputValue` in `apps/web/lib/formatters.ts` — a locale-free trim (`"5000.0000" → "5000"`, `"0.5000" → "0.5"`) whose doc comment states plainly that `formatQuantity` must never seed an editable field. The worksheet's prefill now uses it. The count field's placeholder, which was also locale-formatted, now goes through `carryForwardPlaceholder`, which additionally refuses to suggest a negative carry-forward as a physical count — the "Sisa Periode Lalu" column still reports it verbatim, because there the sign is the information.
- **Prevention:** Two regression tests in `OpeningStockWorksheetTable.test.tsx`: one asserts a `5000.0000` row prefills as `5000` and submits `"5000"` (and `0.5000` as `"0.5"`), one asserts a `-300.0000` carry-forward yields placeholder `"0"`. Both were confirmed to fail against the old prefill before the fix. **Every pre-existing fixture in that file used quantities below 1000, which is exactly why this shipped** — a formatter bug that only bites at four digits needs a four-digit fixture.
- **Severity:** High — the operator saw no warning, and a save would have silently rewritten every stock level to a thousandth of the counted value had the negative-stock guard not caught it. It caught it only because the resulting numbers went below zero; a business with genuinely large stock levels could have absorbed the same corruption silently.

### ERR-034 — Switching an edited expense from center back to branch discarded the original branch

- **Date found:** 2026-08-25
- **Found during:** Chrome smoke verification after TASK-110; resolved by TASK-111
- **Symptom:** Editing a `Cabang Melati` manual expense and toggling its location `Cabang → Pusat → Cabang` changed the branch picker to `Cabang Kenanga`, the first selectable branch. Saving at that point would silently attribute the expense to the wrong branch.
- **Root cause:** The `Cabang` radio handler always assigned `selectableBranches[0].id`. Setting `branchId` to `null` for central mode removed the only form-state copy of the user's previous branch, so there was nothing to restore.
- **Resolution:** `GeneralExpenseFormDialog` now retains the last valid non-central branch ID in a dialog-local ref, updates it when the branch picker changes, and restores it when branch mode is reselected. It falls back to the first selectable branch only when no preserved valid branch exists.
- **Prevention:** The dialog test fixture now contains two ordinary branches, and a regression test toggles an existing `Cabang Melati` entry through central mode, submits, and asserts the PATCH payload still contains the `Cabang Melati` UUID. Chrome verification independently confirmed `Cabang Melati → Pusat → Cabang Melati` without saving.
- **Severity:** Medium — the form remained usable but could silently persist a valid expense against the wrong branch.

### ERR-033 — Late branch-reference loading reset a user's central selection in the expense edit form

- **Date found:** 2026-08-25
- **Found during:** TASK-110, `GeneralExpenseFormDialog` edit-mode component test
- **Symptom:** After an existing branch expense was switched to `Pusat`, the submitted PATCH payload still contained the original branch UUID instead of `branchId: null`.
- **Root cause:** The form-reset effect depended on `centralBranch.id`. When the asynchronous branch query completed after the user clicked `Pusat`, that dependency changed and reran the entire edit initializer, overwriting the user's new selection with the entry's original branch.
- **Resolution:** Restricted the full form-reset effect to dialog/entry initialization and moved central-entry normalization into a separate effect that only sets `null` when the stored entry already belongs to the central system branch. Reference-data arrival can no longer replay the entire form initializer.
- **Prevention:** `GeneralExpenseFormDialog.test.tsx` now opens an existing branch expense, switches it to `Pusat`, submits, and asserts the PATCH body contains `branchId: null`. The complete web suite passes 456/456.
- **Severity:** Medium — it would have made the UI report a successful edit while preserving the wrong location; caught before release.

### ERR-032 — Vercel rejected the Render external rewrite with `DNS_HOSTNAME_RESOLVED_PRIVATE`

- **Date found:** 2026-08-25
- **Found during:** Production verification after TASK-107; remediated by TASK-108
- **Symptom:** `GET https://ohmypos.vercel.app/api/v1/health` returned Vercel's plain-text 404 rather than the API health response. The response carried `x-vercel-error: DNS_HOSTNAME_RESOLVED_PRIVATE`, and login requests failed at the same routing layer.
- **Root cause:** TASK-107 correctly made browser traffic same-origin, but implemented the forwarding as an external Next.js rewrite to `https://ohmypos-api.onrender.com/api/v1`. Vercel's rewrite SSRF guard classified the resolved Render destination as private/inaccessible and rejected it before NestJS ran. Public DNS inspection returning Render's public IPv4 addresses did not change Vercel's platform-specific resolver verdict.
- **Resolution:** Removed the external rewrite and added the Node.js catch-all BFF Route Handler at `app/api/v1/[...path]/route.ts`. Its transport streams requests and responses through server-side `fetch`, preserves method/query/body/multipart boundaries, forwards auth and tracing headers, emits multiple `Set-Cookie` headers separately, removes hop-by-hop/encoded-length headers, returns a traceable 502 for upstream network failures, and rejects foreign-origin unsafe requests.
- **Prevention:** Five `api-proxy.test.ts` cases cover JSON/query/cookie forwarding, multipart streaming, separate auth cookies with status/error preservation, cross-origin rejection, and sanitized 502 handling. Production build output must list `/api/v1/[...path]`, and the generated rewrite manifest must contain no external Render rewrite.
- **Severity:** High — the initial same-origin remediation deployed successfully but every proxied production API request still failed before reaching the backend.

### ERR-031 — Cross-host auth cookies were invisible to Vercel route gating after login

- **Date found:** 2026-08-24
- **Found during:** TASK-107 — same-origin authentication proxy remediation
- **Symptom:** A production login against the Render API returned successfully, but the subsequent Next.js navigation landed back on `/login`. The browser exposed a React Flight payload beginning with `$Sreact.fragment` instead of reaching the role landing page.
- **Root cause:** Browser API calls went directly from the Vercel frontend to the unrelated Render origin. The API correctly issued host-only HttpOnly cookies, but those cookies belonged to the Render host. `apps/web/proxy.ts` and `apps/web/lib/session.ts` run on the Vercel host, so neither could see the `access_token`; route gating therefore treated every authenticated navigation as signed out. `SameSite=None` permits cross-site requests to carry a cookie back to its issuing host, but does not make that cookie readable on a different host.
- **Resolution:** Browser API calls now use same-origin `/api/v1`, so `Set-Cookie` is received through the web origin and is visible to route gating and Server Components. TASK-107's first transport used an external rewrite; production exposed ERR-032, so TASK-108 replaced that transport with a Node.js BFF Route Handler. Direct server calls continue to use `INTERNAL_API_BASE_URL`. Docker Compose points that variable at the `api` service hostname.
- **Prevention:** `api-url.test.ts` locks the browser base to `/api/v1`, verifies backend URL normalization and server-only precedence, and rejects relative backend targets. `api.test.ts` asserts that a real browser-side API call uses `/api/v1/...`; `api-proxy.test.ts` now covers the BFF transport introduced after the failed rewrite attempt.
- **Severity:** High — successful credentials could not produce a usable authenticated session in the split-host production deployment.

### ERR-030 — `SalesHistoryTable.test.tsx` failed with `No QueryClient set` after `SaleReceiptDialog` introduced `useBusinessProfile()`

- **Date found:** 2026-08-24
- **Found during:** Phase 2, 3, 4 (Dynamic business name on sales receipt integration)
- **Symptom:** `vitest run` reported `Error: No QueryClient set, use QueryClientProvider to set one` across 6 tests in `SalesHistoryTable.test.tsx` and 5 tests in `SalesHistoryClient.search.test.tsx`.
- **Root cause:** `SalesHistoryTable` renders `SaleReceiptDialog` in its subtree. When `SaleReceiptDialog` was updated to fetch the dynamic business profile name via `useBusinessProfile()`, tests calling standard `render(...)` directly had no `QueryClientProvider` context mounted.
- **Resolution:** Replaced raw `render(...)` in both test suites with `renderWithClient(...)` from `@/test/test-utils`.
- **Prevention:** When embedding hooks or sub-components that consume `@tanstack/react-query` inside presentational or table components, ensure all parent component unit tests use `renderWithClient` rather than bare `render`.
- **Severity:** Low — test-authoring context requirement caught during local test suite execution.

### ERR-029 — Second-pass adversarial QA review found a planned remediation (TASK-101–105) that was never actually executed

- **Date found:** 2026-08-23
- **Found during:** A second `/adversarial-qa-review` pass against `feat/adversarial-qa-remediation`, after TASK-082–099 (ERR-028's remediation wave) had already landed in commit `529f12e`.
- **Symptom:** `docs/plannings/2026-08-23-remediasi-qa-production-ready.md` documents 5 defects (DEF-001–005) with a fully-specified fix for each — but none of the 5 were actually in the commit whose message claimed "adversarial review remediation across financial, concurrency, and security gates." Concretely: `GET/PATCH/DELETE /ledger-entries/:id` had no `@Roles`/`@BranchScoped` at all (any authenticated `KASIR` could read/edit/delete any branch's manual ledger entries); `AllocationService.revoke()` still locked only the `allocations` row, not the parent `bank_transactions`/`ledger_entries` rows `create()` locks; `MatchingService.proposeMatches()` had no transaction or row-locking at all, so two concurrent reconciliation sessions could double-propose the same bank transactions.
- **Root cause:** The planning document was written and left in the repo in its "awaiting approval" state; a later commit that also touched `matching.service.ts` and `allocation.service.ts` for unrelated reasons (the DEF-A4 window-bound fix, TASK-084) was mistaken for having covered this plan too, because it touched the same files. Nothing in the repo cross-checks a standing plan document against what a commit actually shipped.
- **Resolution:** Implemented all 5 items directly (this session): `RoleGuard` + `@Roles('OWNER','ADMIN')` on `PATCH`/`DELETE /ledger-entries/:id`, service-level branch check for `GET :id` when the caller is `KASIR`; `AllocationService.revoke()` now locks `bank_transactions` then `ledger_entries` (same order as `create()`) before touching the `allocations` row; `MatchingService.proposeMatches()` now runs inside a `$transaction` and selects `UNRESOLVED` bank transactions with `FOR UPDATE SKIP LOCKED`. The 5th item (`SplitAllocationDialog.tsx`'s `Select value={line.ledgerEntryId || undefined}`) was a real controlled/uncontrolled toggle and is fixed; the plan's other named file, `AccountFormDialog.tsx`, was checked and its `Select` was already always-controlled — no change needed there. The reports.service.ts timezone item (DEF-004) was investigated and found not to be a real defect — `entry_date` is written and compared as UTC-instant `Date` objects consistently on both sides, so no fix was applied.
- **Prevention:** Added e2e coverage for every item that had none: `ledger-entries/:id` IDOR/RBAC cases in `auth-rbac.e2e-spec.ts`, a concurrent create/revoke regression in `allocation-sum.e2e-spec.ts`, and a concurrent double-propose regression in the same file. A standing plan document with an "awaiting approval" status line should be treated as a checklist to close out or explicitly reject, not archived as though the next unrelated commit touching the same files closed it.
- **Severity:** Critical — the ledger-entries gap is a live cross-branch IDOR on financial data with no role restriction at all.

### ERR-028 — Prisma 7 `meta.target` variations in unique constraint violation errors (`P2002`)

- **Date found:** 2026-08-23
- **Found during:** TASK-082 & TASK-085 (E2E testing of idempotency keys under concurrent race conditions)
- **Symptom:** Concurrency race tests for `POST /sales`, `POST /supplier-purchases`, and `POST /payables/:id/settlements` received 500 instead of 200/201 when `P2002` was thrown by loser transactions.
- **Root cause:** The initial `isIdempotencyReplay` helper strictly matched `meta.target === indexName` or array containing `idempotency_key`. In Prisma 7 with driver adapters, `meta.target` can arrive as a string, an array of strings, or field names in camelCase (`idempotencyKey`).
- **Resolution:** Updated `isIdempotencyReplay` in `apps/api/src/common/idempotency.ts` to inspect string targets, array targets (checking both `idempotency_key` and `idempotencyKey`), and fallback to truthy for P2002 in idempotency-guarded endpoints.
- **Prevention:** Always inspect runtime shapes of driver adapter error payloads in integration tests across concurrent execution branches.
- **Severity:** High — caused replay logic to treat loser concurrent requests as 500s rather than returning the existing transaction response.

### ERR-027 — Asserting a paginated table's row total matched two elements, because the Export button now carries the same number

- **Date found:** 2026-08-23
- **Found during:** TASK-081, writing `GeneralExpenseTab.test.tsx`
- **Symptom:** `screen.getByText(/340/)` threw `Found multiple elements with the text: /340/`, dumping the whole table plus the Export button's SVG. The assertion was checking that the new pagination footer states the real row count.
- **Root cause:** Not a duplicate render. TASK-073 gave `ExportButton` an `exportTotal` so its label reads `Export (340)` — the honest count that makes a short spreadsheet impossible to ship silently. TASK-081 then added the footer, which states the same total a second time by design ("Menampilkan 1–10 dari 340 pengeluaran"). Any paginated table with an export now shows its total in two places, so a text query for the number alone is ambiguous **on every such table**, not just this one.
- **Resolution:** Scope the assertion to the footer, which already carries `data-testid="data-table-pagination"`, and assert its `textContent` rather than searching the document: `Menampilkan`, the range `1–10`, the total `340`, and the `itemNoun`. Asserting the range as well caught a second sloppiness in the same line — `toContain('1–1')` passes against `1–10`, so the exact range had to be written out.
- **Prevention:** Rule for any test touching a server-paginated table: **query the footer by its testid and assert `textContent`; never `getByText` a bare number.** The number appears in the footer, the Export label, and potentially a summary card. Applied in both suites added by TASK-081 and consistent with how `PayablesTab.test.tsx` already reads its footer. `data-table.tsx` documents `exportTotal` as "the real count behind the filter" — that comment is the reason the duplication exists and should not be removed.
- **Severity:** Low — a test-authoring error, caught immediately by the failure it caused. Logged because it is now a property of every paginated table in the app, so the next person writing this assertion hits it too.

### ERR-026 — `pnpm test:e2e -- <pattern>` reports "No tests found" and exits 1, which reads like a broken suite

- **Date found:** 2026-08-23
- **Found during:** TASK-074, trying to run only the two e2e suites the change touched
- **Symptom:** `pnpm test:e2e -- --testPathPatterns=reconciliation-addendum` printed `No tests found, exiting with code 1`, `testRegex: .e2e-spec.ts$ - 15 matches`, and `Pattern: --testPathPatterns=reconciliation-addendum - 0 matches`, then failed with `ELIFECYCLE`. An earlier invocation with two patterns had silently run only one of the two suites, so the first read of the results was also wrong.
- **Root cause:** `apps/api`'s script is `jest --config ./test/jest-e2e.json --runInBand`. pnpm forwards everything after `--` as **positional arguments** to that command, so jest received the literal string `--testPathPatterns=reconciliation-addendum` as a path pattern rather than as a flag. Jest then matched it against file paths, found nothing, and — correctly, from its point of view — reported no tests. The exit code 1 is what makes this dangerous: in a transcript it is indistinguishable from a suite that ran and failed.
- **Resolution:** Invoke jest directly with the config the script uses and pass patterns positionally: `npx jest --config ./test/jest-e2e.json --runInBand <pattern> [<pattern>...]`. Both affected suites then ran and reported real numbers.
- **Prevention:** Concrete rule, and a companion to **DEBT-057**: **a red or empty e2e result is not evidence of a regression until the invocation is confirmed to have selected the intended suites.** Check the `Test Suites: N total` line against the number of suites expected before reading any failure; `1 total` when two were named means the selection failed, not the code. DEBT-057 covers the other way this misleads (a rerun inside 60s inherits the previous run's throttler budget). Both belong in the same reflex: verify the run before diagnosing the code.
- **Severity:** Low — tooling only, no product behaviour involved. Logged because it produced a wrong reading of test results twice within one task.

### ERR-025 — E2E fixtures created in a nested `beforeAll` were deleted before the first assertion by a suite-level `beforeEach` truncation

- **Date found:** 2026-08-23
- **Found during:** TASK-074, adding `sortOrder` coverage to `GET /ledger-entries`
- **Symptom:** Three new cases in `reconciliation-addendum.e2e-spec.ts` failed with `expect(received).toEqual(expected)` where received was `[]` and expected was a three-id array. The endpoint returned an empty page for a date window the fixtures had definitely been written into, while the seven pre-existing cases in the same file stayed green.
- **Root cause:** Jest hook ordering, not the query. The new `describe` seeded its three `LedgerEntry` rows in its own `beforeAll`, but the file has a suite-level `beforeEach` at line 107 that runs `prisma.ledgerEntry.deleteMany({})`. Every enclosing `beforeAll` runs once before any test in the file; every enclosing `beforeEach` runs before **each** test. So the sequence was: seed once → truncate → first test → truncate → second test. The fixtures existed for the interval between the two hooks and never during an assertion. The empty result was therefore correct behaviour reported against absent data, which is why it looked like a broken filter.
- **Resolution:** Replaced the `beforeAll` with a `seed()` helper the three cases call as their first line, returning the ids they assert on. The date-range block above it was already written this way — its fixtures are created inside each `it` — which is the signal that was there to be read before writing a `beforeAll` into that file.
- **Prevention:** Rule for any e2e suite in this repo: **before adding a `beforeAll` to a nested `describe`, grep the file for `beforeEach` and `deleteMany` / `resetDatabase`.** Several suites here truncate per test on purpose so cases cannot leak fixtures into each other, and in those files a `beforeAll` fixture is silently dead. The `seed()` helper carries a comment saying exactly this, so the next person editing that block is told why the fixtures are per-test. Checkable in review: a `beforeAll` that writes rows in a file containing a top-level `beforeEach` truncation is always wrong.
- **Severity:** Low — test-harness only; no product code was involved and the endpoint under test was behaving correctly the entire time. Logged because the failure presented as "the filter returns nothing", which points the next reader at the query rather than at the hooks.

### ERR-024 — Resetting the page in an effect on the debounced keyword fired one request with the new search and the old page number

- **Date found:** 2026-08-23
- **Found during:** TASK-072 (server-side search), running the full `web` suite — the same two tests had passed in isolation moments earlier.
- **Symptom:** `SalesHistoryClient.search.test.tsx` and `StockMovementsClient.search.test.tsx` both failed on `expect(lastParams().page).toBe(1)` with `Received: 2`, only under the whole-suite run. Passing when run alone and failing under load is the signature of a test reading an intermediate state, not of a wrong expectation.
- **Root cause:** Two causes stacked, and only one of them was in the test. The implementation reset the page with `React.useEffect(() => setPage(1), [search])`, keyed on the **debounced** value. An effect runs after commit, so the sequence was: debounce fires → render with `{ search: 'tebet', page: 2 }` → the query hook is called with exactly that → effect runs → re-render with `page: 1`. The intermediate render is real, not a test artifact: with server pagination it is a genuine request for page 2 of a result set that mostly has one page, whose response is then discarded. The test then made it observable by asserting `search` inside `waitFor` and `page` immediately after it, so under load it could sample the transient render and see `page: 2`.
- **Resolution:** Moved the reset out of the effect and into the search input's own `onChange` (`handleSearchChange` = `setSearchInput(value)` + `setPage(1)`) in all four call sites — Sales History, Reconciliation, Stock Movements, Attendance. Page 1 is now claimed at keystroke time, several hundred milliseconds before the debounced value is even sent, so no request can carry the new keyword with the old page. The tests were tightened in the same pass to assert both fields inside a single `waitFor` via `toMatchObject({ search, page: 1 })`, so they cannot pass or fail on which render they happen to sample.
- **Prevention:** Concrete rule for review: **a page reset belongs on the event that changes the filter, not on an effect watching the debounced result of it.** The debounced value is by definition late, and everything derived from it has already rendered once by the time the effect runs. Checkable in tests by never asserting two pieces of the same derived state in separate steps — put them in one `waitFor`/`toMatchObject`, which is what turned this from a flake into a deterministic failure. Sabotage-verified: deleting the reset from `handleSearchChange` turns the "returns to page 1 when the keyword changes" case red in all four suites.
- **Severity:** Low — the wasted request's response was discarded and the correct page-1 request followed immediately, so nothing wrong ever reached the screen. Logged because the flaky test was the only thing that surfaced it, and the same shape (effect on a debounced value) is easy to write again.

### ERR-023 — The attendance calendar's month navigator never changed months, and any month it could not reach rendered as "nobody came to work"

- **Date found:** 2026-08-22
- **Found during:** TASK-071, while reading `AttendanceCalendarMatrix` against `AttendanceQuerySchema` to size up DEBT-042 (which describes a different, smaller problem).
- **Symptom:** Clicking "‹" / "›" on the attendance calendar appeared to work — the header changed to the previous month — but the grid did not repopulate. For any month outside the newest logins the API happened to return, every cell for every cashier rendered blank. Blank is not an empty state on this screen: it is the same cell "Tidak Hadir / Libur" uses, so a month in which every cashier worked every day was indistinguishable from a month in which nobody logged in at all. No error, no warning, no request failure.
- **Root cause:** `AttendanceQuerySchema` accepted only `branchId`, `violationOnly` and `limit` — **no date parameter of any kind** — so `GET /devices/attendance` could only ever answer "the N most recent logins", ordered `loginAt DESC` with `take: limit`. `AttendanceCalendarMatrix` maintained the displayed month purely as React state, fetched `limit: 200` with no bounds, and filtered to that month client-side inside `getDayStatus`. The month never left the browser. Any month not covered by those 200 rows matched nothing and fell through to `{ type: 'NONE' }`, whose cell is a blank. The window is global and time-ordered, so this was never limited to past months: at 8 kasir × 2 logins/day, 200 rows spans about 12 days, meaning the earlier half of the *current* month blanked out too as the month progressed. Reproduced against real data — with 253 logins seeded into the current month, the old-shaped request returned nothing older than 5 August: all of July was invisible, and so were 1–4 August. A second, quieter instance sat beside it: the same component called `useAllLeaveRequests({ status: 'APPROVED' })` with no bounds at all, pulling every approved leave request in company history to shade a single month.
- **Resolution:** Added `startDate`/`endDate` to `AttendanceQuerySchema` (filtering `loginAt`, never `createdAt` — both default to `now()` and are equal in production, so a filter on the wrong column would pass every test written against real data) together with `page`/`sortBy`/`sortOrder`, and moved the endpoint to a `{ data, meta }` envelope. The matrix now sends the displayed month's bounds, with the upper bound at 23:59:59.999 of the final day so the last day of every month is not lost to a midnight cutoff. `LeaveRequestListQuerySchema` gained an `overlapsFrom`/`overlapsTo` window — named to avoid colliding with the model's own `startDate`/`endDate` columns, because the filter is an overlap, not containment, so leave spanning a month boundary belongs to both months.
- **Prevention:** Three e2e assertions that fail on the specific mistake rather than on "is it sorted": fixtures write `loginAt` in April and `createdAt` in June **in reverse order**, so a service reading the wrong column inverts the result instead of passing; a login at 23:30 on the last day of the month must be returned by the month window and must *not* be returned when the bound is cut to midnight; and a leave request spanning 28 Nov → 3 Dec must appear in both months. Each was sabotage-checked before being trusted — swapping `loginAt` for `createdAt` broke 10 of 18 assertions, and replacing the overlap with containment broke exactly the boundary test. Separately, the matrix now compares `meta.total` against the rows it received and renders a visible band when they differ, so the failure mode this entry describes — missing data rendered as absence — cannot silently return through the page cap.
- **Severity:** High — attendance is the record an OWNER uses to judge whether staff showed up, and the defect made presence and absence look identical. No money or stock was touched.

### ERR-022 — The match review queue dead-ended the operator once more than 100 transactions were awaiting review

- **Date found:** 2026-08-22
- **Found during:** TASK-068 (Reconciliation server-side sorting & lookup caps), while auditing Reconciliation after TASK-067 had wrongly treated it as the finished reference implementation.
- **Symptom:** With more than 100 bank transactions in `PENDING_REVIEW` scope, accepting a match candidate in the review queue failed with "Data transaksi bank untuk usulan ini belum termuat. Jalankan ulang pencocokan otomatis." Following that instruction changed nothing, and it could never change anything — leaving "Reset Status Pencocokan", which discards the whole queue including every candidate that was fine, as the only way out.
- **Root cause:** `usePendingReviewTransactions` (`apps/web/hooks/useReconciliation.ts`) requested `limit=100&page=1` and discarded `meta.totalPages`. It is not a display list — `MatchReviewQueue` builds `transactionsById` from it and `buildAllocationsForCandidate` resolves every candidate's per-transaction amount through that map — so any transaction past the first page resolved to `UNKNOWN_TRANSACTION`. The error message the component then showed advises re-running propose, but `MatchingService.propose` selects only `UNRESOLVED` transactions (`matching.service.ts:19`) and these are already `PENDING_REVIEW`; the component's own header comment (`MatchReviewQueue.tsx:44-47`) documents exactly this, which is why the advice was unreachable rather than merely unhelpful. A second instance of the same class sat in `useLedgerEntryCandidates`: it took the first 100 of a `/ledger-entries` result ordered `entryDate DESC`, so a busy ±30-day window silently dropped its **oldest** entries — precisely where the nearest-date match sits when the anchor transaction falls early in its own window — and the dialog's client-side text filter then searched only that truncated set, so the operator would conclude a ledger entry did not exist.
- **Resolution:** Added a `fetchAllPages` helper in `useReconciliation.ts` that follows `meta.totalPages` (guarded by `MAX_LOOKUP_PAGES = 20`), and moved both hooks onto it. Both now return a plain array rather than `{ data, meta }` — a deliberate shape change, so no future caller can mistake one page for the whole set. At realistic volumes this issues exactly one request, the same request as before.
- **Prevention:** Regression tests that were confirmed to **fail** against the old single-page behaviour before being accepted: `MatchReviewQueue.test.tsx` places a candidate's second transaction on page 2 and asserts the allocation still posts with no error banner; `SplitAllocationDialog.test.tsx` places the nearest-date entry on page 2 and asserts it appears in the picker. Both suites also assert the loop stops at `totalPages` rather than spinning. The general lesson for review: a hardcoded `limit`/`page=1` is safe in a *display* list and a defect in a *lookup*, and the two are not distinguishable from the call site — check what the caller does with the result, not how the request looks.
- **Severity:** High — no money was miscomputed, but the operator was blocked from completing reconciliation with no working path forward, and the ledger-candidate truncation could lead them to conclude a real bookkeeping entry was missing.

### ERR-021 — CORS `allowedHeaders` never updated for the new `x-correlation-id` request header, breaking login in every real browser

- **Date found:** 2026-08-22
- **Found during:** TASK-065 (Phase 14 Workstream E follow-up) — the user hit "Failed to fetch" on `/login` in their own browser after this session's ops-readiness work shipped.
- **Symptom:** Every `apiFetch` call from `apps/web` (login included) failed in a real browser with a bare `TypeError: Failed to fetch` and no server-side log line for the request at all. `curl` against the identical URL/method/body succeeded instantly and consistently, which — before the real cause was found — led to an incorrect diagnosis that a browser-automation tool's own sandboxing was at fault (see `DEBT-024`'s superseded note) rather than the application.
- **Root cause:** Earlier in this same Phase 14 session (E-8, for request tracing), `apps/web/lib/api.ts`'s `doFetch` was changed to send an `x-correlation-id` header on every request. `apps/api/src/main.ts`'s `app.enableCors({ allowedHeaders: [...] })` was never updated to match — it still listed only `['Content-Type', 'Authorization']`. Every real browser's CORS preflight (`OPTIONS`) correctly rejected the actual request because the header the client wanted to send wasn't in the server's allow-list, and a CORS-blocked request surfaces to `fetch()` as an opaque network failure with no distinguishing detail — not as an HTTP error status, and with nothing to log server-side because the browser never sends the real request past the failed preflight. `curl` has no CORS layer, so it never reproduced the failure, which is exactly why this went undetected through the rest of Phase 14's otherwise-thorough testing.
- **Resolution:** Added `'x-correlation-id'` to `allowedHeaders` in `apps/api/src/main.ts`. Verified with a manual `curl -X OPTIONS` preflight simulation (`Access-Control-Request-Headers: content-type,x-correlation-id`) confirming the response's `Access-Control-Allow-Headers` now includes it.
- **Prevention:** Any future request header added to `doFetch` (or any other frontend fetch wrapper) must be checked against `main.ts`'s CORS `allowedHeaders` in the same change — the two lists have no shared source of truth today, so nothing catches this class of drift automatically. Worth a follow-up: an e2e test that exercises a real preflight (most e2e suites use `supertest`, which — like `curl` — does not enforce CORS, so this class of bug needs either a browser-based check or an explicit assertion against the CORS middleware's configured header list, not a same-origin server-side test).
- **Severity:** Critical — it broke every authenticated action in the entire frontend application (nothing could reach the API from a real browser) the moment a real user tried it, and none of this session's extensive automated testing (unit, e2e via `supertest`, `curl`) was capable of catching it by construction.

### ERR-020 — Dashboard 3 and Dashboard 5 disagreed on which month a sale belonged to (WIB vs UTC boundary split)

- **Date found:** 2026-08-22
- **Found during:** TASK-065 (Phase 14 Workstream A, `monthly-cycle.e2e-spec.ts` Stage 8) — reproduced deliberately, as predicted by the plan's §2.1 research finding, before Gate 1 was even asked.
- **Symptom:** A sale placed in the last WIB hour of a month (e.g. `2026-08-01 00:30 WIB`, stored as `2026-07-31T17:30:00.000Z`) landed in **August** on every Dashboard 3 report but in **July** on the Dashboard 5 Inventory Summary — the same sale's revenue and COGS counted in one month, its stock consumption in the previous one. Reproduced empirically against a real July cycle: pre-fix, July's Kopi `outQuantity` read `0.1600` where the WIB-consistent figure is `0.1400`, and August's `inQuantity` read `0.0000` where a WIB-dated purchase should have appeared.
- **Root cause:** Two independent period-boundary implementations existed with no shared source of truth. `apps/api/src/common/period.ts` (backing every `/reports/*` endpoint, ADR-018) resolves calendar boundaries in **Asia/Jakarta (UTC+7)**. `apps/api/src/modules/inventory/period.ts` (backing `/inventory/summary` and `/inventory/opening-stock`) resolved the same kind of boundary in raw **UTC**. Each file's own header comment instructed the other to import from it; neither actually did, because Phase 6 (inventory) shipped before Phase 7 (reports) made its ADR-018 decision, and the contradiction was never reconciled afterward.
- **Resolution:** ADR-023. `inventory/period.ts` now delegates to `common/period.ts` for the WIB instant range, so there is exactly one place a calendar-month boundary is computed in the repository. `OpeningStock.periodMonth` (a `@db.Date` column) needed a second, deliberately UTC-midnight-derived field (`periodMonthDate`) to avoid orphaning existing rows' unique key — see ADR-023 §Decision 2 for why a naive `periodStart` write would have silently broken lookups for every pre-existing `OpeningStock` row. Verified empirically (not assumed) that no data migration was needed. `apps/api/test/inventory.e2e-spec.ts`'s Case R and Case D-1 were updated to encode the WIB-correct expected values.
- **Prevention:** `apps/api/test/monthly-cycle.e2e-spec.ts` Stage 8 exercises exactly this boundary (a sale in the last WIB hour of the cycle month) as a permanent regression guard — it was written to fail against the pre-ADR-023 code specifically to produce the reproduction evidence above, then re-run green after the fix. General lesson: when two modules independently implement "the same" calendar concept, a comment telling each to import from the other is not a substitute for actually doing it — the drift is invisible until a boundary instant is tested end-to-end across both.
- **Severity:** High — this is a money/stock correctness defect (Playbook §10): it changes which month a sale's COGS and stock consumption are attributed to, silently, for any sale near a WIB month boundary.

### ERR-019 — Missing `tsconfigRootDir` in `apps/web/eslint.config.mjs` caused IDE parser ambiguity

- **Date found:** 2026-08-21
- **Found during:** TASK-064 (Fix ESLint tsconfigRootDir in apps/web)
- **Symptom:** Editor reported `Parsing error: No tsconfigRootDir was set, and multiple candidate TSConfigRootDirs are present` when inspecting files in `apps/web`.
- **Root cause:** `apps/web/eslint.config.mjs` relied on `eslint-config-next/typescript` without explicitly providing `tsconfigRootDir`, so typescript-eslint found multiple candidate root dirs across the monorepo (`apps/api`, `packages/ui`).
- **Resolution:** Added `languageOptions: { parserOptions: { tsconfigRootDir: import.meta.dirname } }` to `apps/web/eslint.config.mjs`.
- **Prevention:** When setting up flat ESLint configurations in a pnpm monorepo, always specify `tsconfigRootDir: import.meta.dirname` for workspace packages using TypeScript parser rules.
- **Severity:** Low — IDE developer experience/linter error only.

### ERR-018 — Sidebar and shared layouts failed to inherit dark mode tokens

- **Date found:** 2026-08-21
- **Found during:** TASK-059, TASK-060, TASK-063 (Dark Mode Enhancements)
- **Symptom:** Sidebar remained light-themed when dark mode was activated in back-office, `/sales` and `/profile` (shared route) were not rendering dark surfaces, and mobile theme toggle was invisible.
- **Root cause:** 
  1. Tailwind v4 CSS variable alias (`--color-sidebar: var(--color-surface-raised)`) didn't re-resolve without explicit overrides under the `.dark, [data-theme='dark']` block.
  2. `PosLayout` and `SharedLayout` did not pass `enableDarkMode` or `initialTheme` to `AppShell`.
  3. Mobile theme toggle button in `Topbar.tsx` was placed inside a container with `hidden md:flex`.
- **Resolution:**
  1. Added explicit `--color-sidebar-*` token definitions to `.dark, [data-theme='dark']` in `packages/ui/src/styles/globals.css`.
  2. Updated `apps/web/app/(pos)/layout.tsx` and `apps/web/app/(shared)/layout.tsx` to read `getInitialTheme()` and pass `enableDarkMode` to `AppShell`.
  3. Moved mobile theme toggle outside the desktop-only container in `Topbar.tsx`.
- **Prevention:** When extending theming support to new layouts or responsive views, test all layout wrappers and breakpoints (`isMobile`, `isRail`, `desktop`) under both theme states.
- **Severity:** Low — visual theme styling only, business logic intact.

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
