# OhMyPos — Adversarial QA Review

**Date:** 2026-08-17
**Target:** `apps/api` @ `feat/phase-7-reporting` (e367be8)
**Scope:** `apps/api`, `packages/api-contracts`, schema & migrations (`apps/web` not assessed)
**Method:** Static read + live exploitation against a running API instance and Postgres 16
**Existing tests at time of review:** 299 passing (129 unit, 170 e2e) — all green

## Verdict

**Reject for production.** Three Critical and three High defects, all confirmed by live exploitation. None are caught by the existing test suite. The concurrency and money-arithmetic foundations are strong enough that this is a perimeter problem, not a rewrite.

Every claim below is tagged **Verified** (reproduced against a running system), **Failed** (the system did the wrong thing under test), or **Not Verified** (identified by reading code, not exercised live).

---

## Section 1 — What could not be broken

Worth stating first, because it changes how the defect list should be read. The parts of this system that matter most in a financial application held under direct attack.

| Attack | Result | Evidence |
|---|---|---|
| Oversubscribed concurrent sales — 20 simultaneous sales, 10 units each, against stock for only 98 units | **Held** | 9 × 201, 11 × 409. Gula went 24.5000 → 2.0000, exactly 9 × 10 × 0.25. No negative stock, no lost update, no deadlock. |
| Concurrent double-settlement — 8 simultaneous full settlements of one Rp 40,000 payable | **Held** | 1 × 201, 7 × 409. `remaining_balance` = 0.00, `SUM(settlements)` = 60000.00 = `original_amount`. |
| Cross-branch access as KASIR — sell at another branch, omit `branchId` to escape scoping | **Held** | 403 on both. `BranchScopeGuard` fails closed on a missing value — the Express 5 `req.query` getter trap is explicitly handled. |
| Report injection & range abuse — `rankBy` SQL injection, 2193-day range, `2026-02-30`, non-UUID branch | **Held** | 400 on every one. `PRODUCT_ORDER_BY` is a fragment lookup, not interpolation; every value is a bound parameter. |
| Sale input abuse — zero/negative quantity, negative price, 51 line items, central-branch sale, recipeless product | **Held** | 400/400/400/400/409. Zod boundaries and ADR-014/ADR-013 service rules all fire correctly. |
| Login brute force — 15 rapid wrong-password attempts | **Held** | 10 × 401 then 429. Per-route throttle is tighter than the global default; dummy-hash compare is a well-formed bcrypt string, so timing is constant. |
| Reports RBAC — ADMIN and KASIR against all five report endpoints | **Held** | 403 / 403 / 401 anon. Phase 7 is the best-guarded module in the repo. |

The ADR-007 / ADR-016 lock discipline is not decorative — it is load-bearing and it works. `lockRawMaterialsInIdOrder` as the single lock-ordering chokepoint, and payables' lock-before-read ordering, are both correctly implemented.

---

## Section 2 — Defect register

### DEF-001 — Critical — AuthZ / privilege escalation
**Six controllers ship with no role guard, so a cashier is effectively an administrator.**

`BranchesController`, `AccountsController`, `CategoriesController`, `MatchingController`, `ReconciliationController` and `ImportController` carry zero `@Roles` and zero `@UseGuards`. `RoleGuard` allows any authenticated role when the decorator is absent, so all 19 endpoints on these controllers are open to `KASIR`.

This directly contradicts ADR-011 §6 and the AGENTS.md troubleshooting entry *"a non-`ADMIN`/`OWNER` can perform reconciliation matching → `RoleGuard` missing"*. It is that exact bug, shipped.

```
KASIR → POST /branches                 201  (created "QA-PWN-Branch")
KASIR → POST /accounts                 201  (openingBalance 999,999,999)
KASIR → POST /categories               201
KASIR → POST /matching/propose         200
KASIR → POST /matching/reset           200  ← mutates BankTransaction.status
KASIR → POST /import/csv/:accountId    200  {"imported":1}
KASIR → DELETE /branches/:id           200
KASIR → POST /users                    403  ← correctly guarded
KASIR → POST /allocations              403  ← correctly guarded
```

- **Repro:** Log in as `kasir@ohmypos.local`; issue any request above with the session cookie.
- **Expected:** 403 Forbidden on all of them (ADR-011 §5/§6; System Design v4 §5 limits ADMIN to master-data + reconciliation, KASIR to branch-scoped POS only).
- **Actual:** 200/201 on all seven.
- **Impact:** A cashier can invent payment accounts with arbitrary opening balances, forge bank statement rows, reset reconciliation state, and delete branches. Kas Awal (PRD §5.1) is writable by the least-trusted role in the system.
- **Evidence:** `branches.controller.ts` (no guards, all 5 routes), `accounts.controller.ts`, `categories.controller.ts`, `matching.controller.ts:11,21`, `reconciliation.controller.ts`, `import.controller.ts:30`
- **Status:** Verified — exploited live.

### DEF-002 — Critical — Data integrity / referential
**Deleting a branch silently nulls every cashier assigned to it, permanently bricking those accounts.**

`User.branch` is declared as an optional relation with no `onDelete`. Prisma's default for an optional relation is `SetNull`, so `users_branch_id_fkey` is the only branch foreign key in the schema that is not `RESTRICT`:

```
tbl                | on_delete
-------------------+-----------
ledger_entries     | RESTRICT
supplier_purchases | RESTRICT
stock_movements    | RESTRICT
sales              | RESTRICT
users              | SET NULL   ← the outlier
```

Because SET NULL raises no foreign-key violation, the `P2003` handler in `BranchesService.remove` never fires and the delete returns 200. The cashier is now a `KASIR` with `branchId = null`, which ADR-011 §2 declares impossible. `BranchScopeGuard` then correctly refuses every branch-scoped request they make — so the account fails safe, but is unusable, with no error anywhere pointing at the cause.

Worse, the documented recovery path does not recover it. `prisma/seed.ts` uses `upsert` with `update: {}`, so re-running `pnpm --filter api db:seed` leaves the broken row untouched. Confirmed: after re-seeding, `kasir@ohmypos.local` still has `branch_id = NULL`. Repair requires manual SQL.

- **Repro:** 1. `POST /branches`. 2. `POST /users` with `role: KASIR` on that branch. 3. `DELETE /branches/:id` → 200. 4. `GET /users/:id` → `branchId: null`. 5. Log in as that cashier → `GET /sales` → 403 *"This cashier account has no branch assigned"*. 6. Re-seed → still null.
- **Expected:** 400, matching the existing message *"Cannot delete branch referenced by…"*, since staff are assigned to it.
- **Actual:** 200, and an unrecoverable invariant violation.
- **Impact:** One master-data delete disables every cashier at that outlet mid-shift. Combined with DEF-001, any cashier can trigger it against any branch.
- **Evidence:** `schema.prisma:296`, `branches.service.ts` `remove()`, live `pg_constraint` dump above.
- **Status:** Verified — reproduced end to end, including the failed recovery.

### DEF-003 — Critical — Money correctness / import
**The BCA parser maps every unrecognised transaction code to OUTFLOW, inverting income.**

`BcaCsvParser` resolves direction with `typeStr === 'CR' ? INFLOW : OUTFLOW`. There is no validation and no rejection path — any code that is not the exact literal `CR` becomes an outflow. A bank that writes `CREDIT`, or a row with an empty type column, silently reverses sign.

```
Input CSV                                  Stored
03/08/2026,GAJI MASUK,7000000.00,CREDIT →  7000000.00  OUTFLOW  ← should be INFLOW
04/08/2026,ENTRI KOSONG,250000.00,     →   250000.00  OUTFLOW  ← should be rejected
```

A Rp 7,000,000 inflow booked as an outflow is a Rp 14,000,000 swing in the reconciliation variance. The import returns `200 {"imported":2,"skipped":0}` — there is no signal at all that anything went wrong.

The Mandiri parser is not affected: it reads separate inflow/outflow columns and `continue`s when neither is positive. The defect is specific to BCA's single-column format.

- **Expected:** An unrecognised type code is a malformed row — skip it and report it, as the parser already does for a bad date or unparseable amount.
- **Actual:** Silently coerced to OUTFLOW and persisted.
- **Impact:** Corrupts `actualBankBalance` and therefore every reconciliation variance, invisibly and permanently.
- **Evidence:** `parsers/bca-csv.parser.ts:52-54`
- **Status:** Failed — reproduced live.

### DEF-004 — High — Money correctness / data loss
**Import dedup hashes content, not identity, so genuinely distinct transactions are silently dropped.**

`dedupHash = sha256(date_description_amount_type)`, and `externalRef` is hardcoded `null` for BCA — so the `(accountId, externalRef)` unique constraint never engages (Postgres treats NULLs as distinct). Dedup rests entirely on the content hash, and `createMany({ skipDuplicates: true })` discards collisions without comment.

Two real, separate cash deposits of the same amount on the same day with the same narration are indistinguishable from a re-import. The second one vanishes:

```
02/08/2026,SETORAN TUNAI,0000,500000.00,CR
02/08/2026,SETORAN TUNAI,0000,500000.00,CR
→ 200 {"imported":1,"skipped":1,"total":2}
→ SELECT COUNT(*), SUM(amount) → 1 row, 500000.00   (Rp 500,000 lost)
```

The operator sees `skipped: 1`, which reads exactly like the benign "you already imported this statement" case. Nothing distinguishes the two.

- **Impact:** Under-reported bank income with no audit trail. Duplicate same-day, same-amount deposits are routine in a cash-heavy F&B business, so this is a likely occurrence, not a corner case.
- **Evidence:** `bca-csv.parser.ts:56-66`, `import.service.ts:44-55`, `schema.prisma:235-236`
- **Status:** Verified — reproduced live.

### DEF-005 — High — Data integrity / validation
**Negative bank amounts are accepted, corrupting balances and permanently blocking allocation.**

The parser runs `new Decimal(rawAmount)` with no sign check, and `BankTransaction.amount` has no non-negative constraint. A row with `-900000.00` stores as a negative OUTFLOW, which *adds* to `actualBankBalance` because the summary computes `SUM(INFLOW) − SUM(OUTFLOW)`.

It also makes the row permanently unreconcilable: `check_allocation_sum()` tests `(total_allocated + NEW.amount_portion) > txn_amount`, and `AllocationService` separately rejects any `amountPortion <= 0`. With a negative `txn_amount`, every legal allocation exceeds the cap. The row can never be matched and never be cleared.

Combined with DEF-003 and DEF-004, driving the dashboard to a headline figure wrong by **Rp 12,450,000** on four CSV rows, with every request returning 200:

```
Ground truth from CSVs:  IN 7,500,000 − OUT 900,000 =  +6,600,000
Dashboard reported:      actualBankBalance          =  −5,850,000
                         variance                   =  −5,560,000
```

- **Evidence:** `bca-csv.parser.ts:44-50`, `reconciliation.service.ts` `getDashboardSummary`, `migrations/20260814191153_init/migration.sql:171-195`
- **Status:** Verified — reproduced live; balance figure captured from the API response.

### DEF-006 — High — Testing (meta)
**The RBAC e2e suite covers two of the eight controllers that need it, and passes anyway.**

`auth-rbac.e2e-spec.ts` has 24 tests across four `describe` blocks. Its `RoleGuard` coverage tests only `/users` and `/allocations`. Every controller in DEF-001 is untested — including `/matching`, which sits inside a block literally titled *"reconciliation is ADMIN/OWNER only (ADR-011 §6)"* while only exercising `/allocations`.

Related structural gaps in the suite:

- **No service-layer tests.** All 129 unit tests target pure calculators and rule functions. Every one of the 21 services has no unit test; they are reachable only through e2e. The pyramid is bimodal — pure functions and full HTTP, nothing between.
- **The import parsers have no tests at all.** Neither `bca-csv.parser.ts` nor `mandiri-csv.parser.ts` has a spec, which is precisely why DEF-003/004/005 survived. This is untested code that decides the sign of money.
- **No concurrency tests.** ADR-007 and ADR-016 are the repo's most consequential decisions and the suite never races anything. The behaviour is correct — verified live — but that correctness is unprotected against regression.

> **The headline finding:** 299 tests pass. All of them passed while a cashier could delete branches, and while a four-row CSV could put the reconciliation dashboard off by Rp 12.45M. A green suite is currently evidence that the tested paths work — it is not evidence that the system is safe.

- **Evidence:** `test/auth-rbac.e2e-spec.ts:187-276`; `find src/modules -name "*.service.ts"` vs sibling specs (21 services, 0 specs)
- **Status:** Verified — suite run and read.

### DEF-007 — Medium — API / error handling
**`sortBy` is an unvalidated string passed straight into Prisma `orderBy`, returning 500 on every list endpoint.**

`PaginationQuerySchema` declares `sortBy: z.string().optional()` with no enum, and five services spread it directly into `orderBy: { [sortBy ?? default]: 'desc' }`. Any value that is not a scalar column on that model throws a Prisma validation error, which the catch-all filter converts to a generic 500.

```
GET /sales?sortBy=nonexistentField  → 500
GET /sales?sortBy=user              → 500   (a relation, not a scalar)
GET /sales?sortBy=                  → 500   ← empty string; the realistic accident
GET /sales?sortBy=__proto__         → 200   (silently unsorted)
Same 500 on /payables, /suppliers, /ledger-entries, /supplier-purchases
```

Not an injection vector — Prisma parameterises and the value never reaches SQL. It is an availability and correctness problem: a frontend that sends an empty sort parameter takes down five list views, and `__proto__` silently returns unsorted data while reporting success.

- **Expected:** 400 with a field-level message, from a `z.enum` of sortable columns per endpoint.
- **Evidence:** `pagination.schema.ts:7`; `sales.service.ts:277`, `payables.service.ts:153`, `suppliers.service.ts:72`, `ledger-entries.service.ts:94`, `supplier-purchases.service.ts:240`
- **Status:** Verified — reproduced on all five.

### DEF-008 — Medium — Business logic / reporting
**`soldAt` is unbounded, so a sale can be dated a century out and silently leave the books.**

`CreateSaleSchema.soldAt` is `DateTimeString` with no range refinement, and `SalesService.create` passes it through to both `Sale.soldAt` and the income `LedgerEntry.entryDate`. A sale dated `2126-01-01` is accepted with 201.

It consumes stock immediately but appears in no current-period report, so revenue and COGS separate: the inventory moved, the income did not. The symmetric case is worse — a backdated sale silently rewrites a P&L period the owner has already reviewed and acted on. There is no concept of a closed period anywhere in the system.

- **Expected:** Reject a `soldAt` materially in the future; require an explicit role or reason to backdate beyond a short window.
- **Actual:** `201 Created`, stock decremented, ledger entry dated 2126.
- **Evidence:** `sale.schema.ts` (`soldAt: DateTimeString`), `sales.service.ts:183-203`
- **Status:** Verified — reproduced live.

### DEF-009 — Low — Auth / session & state
**Four smaller issues in session handling and reconciliation state.**

- **Logout can silently fail to revoke.** `AuthService.logout` wraps its update in `try {} catch {}` with an empty body and returns success regardless. If the write fails, cookies clear client-side while the access token stays valid server-side for up to `JWT_EXPIRES_IN` (default 1 day). A logout that reports success must have revoked. *(Static — not induced live.)*
- **Concurrent refresh causes spurious logouts.** `refreshTokens` has no lock; two tabs refreshing together both pass `bcrypt.compare`, both write `refreshTokenHash`, and the loser's freshly issued token is already dead. There is also no reuse detection, so a stolen refresh token is not distinguishable from this race.
- **`PENDING_REVIEW` is silently destroyed.** `sync_transaction_status()` recomputes status from the allocation sum on every allocation write, and maps `total_allocated = 0 → UNRESOLVED`. Revoking the only allocation on a transaction the matching engine had proposed discards the proposal with no record.
- **Inconsistent transaction timeouts.** `SalesService.create` and `OpeningStockService.upsert` both set `timeout: 15000` with a documented rationale about lock queueing; `PayablesService.settle` takes the same class of lock on the same kind of contended row and uses Prisma's 5s default. Under contention it will surface a queued settlement as a P2028 → 500.

- **Evidence:** `auth.service.ts` `logout()`/`refreshTokens()`, `migration.sql:205-231`, `payables.service.ts:35` vs `sales.service.ts:243`
- **Status:** Not Verified — identified by code reading; not exercised live.

---

## Section 3 — Quality risk matrix

| Dimension | Risk | Max severity | Confidence | Findings |
|---|---|---|---|---|
| Security / AuthZ | Critical | Critical | High | DEF-001 — 19 endpoints open to KASIR, exploited live |
| Data integrity | Critical | Critical | High | DEF-002 unrecoverable FK cascade; DEF-005 negative amounts |
| Integration (bank import) | Critical | Critical | High | DEF-003 sign inversion, DEF-004 silent drops, zero tests |
| Testing (meta) | High | High | High | DEF-006 — green suite, unguarded perimeter |
| Business logic | Medium | Medium | High | DEF-008 unbounded dates; core sale/HPP/COGS rules correct |
| API contract & errors | Medium | Medium | High | DEF-007 — 500s from trivial input on 5 endpoints |
| Functional (core domain) | Low | Low | High | Sales, stock, payables, reports all behaved correctly under attack |
| Concurrency | Low | Low | High | Empirically verified on both stock and money paths |
| Reliability | Medium | Medium | Medium | DEF-007, DEF-009 timeout asymmetry; no sustained-load data |
| Performance | Low | Unknown | Low | **Not empirically verified** — no load tooling; query-time reports (ADR-008) untested at volume |

---

## Section 4 — Production readiness

Passing tests are not sufficient evidence, and in this repository they are actively misleading — the suite is green while three Critical defects are live.

- **Not ready — authorization.** The role model is designed correctly in the ADRs and implemented correctly in `RoleGuard`. It is simply not applied to a third of the controllers. This is a wiring failure, not a design failure, which is why it is both severe and cheap to fix.
- **Not ready — bank import.** Untested code that determines the sign and survival of money. Reconciliation cannot be trusted until DEF-003/004/005 are fixed and the parsers have tests.
- **Not ready — referential integrity.** One schema line (DEF-002) admits an unrecoverable state that the documented reset procedure cannot repair.
- **Ready — transactional core.** Sales, stock movements, payables and HPP snapshotting are correct, well-reasoned and verified under concurrency.
- **Ready — reporting.** Phase 7 is the strongest module: bound parameters throughout, fragment-lookup ORDER BY, correct double timezone conversion, complete input validation, correct OWNER-only guards.
- **Unknown — performance.** Not empirically verified. No load-testing tooling was available. ADR-008 already flags query-time reports as needing revisiting at real volume; that remains open.
- **Out of scope — frontend.** `apps/web` is 22 files with 2 test files (Phase 8a infrastructure only) and was not assessed. DEF-001 means frontend route hiding is currently the *only* thing standing between a cashier and master data.

---

## Section 5 — Final QA verdict

| Score | Value | Reasoning |
|---|---|---|
| Functional quality | 7.0 / 10 | Core domain logic is genuinely strong and survived every functional attack. Marked down for DEF-008 and the import path's logic errors. |
| Test coverage quality | 4.5 / 10 | 299 tests that pass while three Critical defects are live. Excellent boundary tests on pure functions; zero service tests, zero parser tests, zero concurrency tests, RBAC coverage at 2 of 8 controllers. |
| Reliability confidence | 6.0 / 10 | Fails closed in the right places and shuts down gracefully. Marked down for trivial-input 500s and the payables timeout asymmetry. |
| Security testing confidence | 3.0 / 10 | Confirmed privilege escalation on 19 endpoints. Credit where due: cookies are HttpOnly + SameSite=strict, login throttling works, timing-safe compare is correct, no injection found anywhere. |
| Data integrity confidence | 5.0 / 10 | Transactional boundaries are exemplary. Undermined by one FK default admitting an unrecoverable state and an import path that loses and inverts money. |
| Concurrency safety confidence | 9.0 / 10 | The strongest area. Ordered locking, lock-before-read, and atomic increments all verified under real contention on both stock and money. Held back from higher only because no test protects it from regression. |
| **Overall QA confidence** | **5.5 / 10** | A well-architected core with an unguarded perimeter. The defects are concentrated, well-understood, and mostly cheap to fix — but they are live and severe. |

| Question | Answer |
|---|---|
| Are there Critical defects? | **Yes** — three (DEF-001, 002, 003), all verified live. |
| Are there High-severity defects? | **Yes** — three (DEF-004, 005, 006). |
| Are critical flows sufficiently tested? | **Mostly, for the domain core.** No for authorization, bank import, and concurrency. |
| Is the test suite trustworthy? | **No.** Well-written where it exists, but its green status does not correlate with system safety. |
| Recommendation | **Reject.** Re-review after DEF-001 through DEF-006 are fixed with regression tests attached. |

---

## Section 6 — What "99.99" would actually require

The honest score today is **5.5 / 10**. In priority order, this is what would earn a higher one:

1. **Guard the six controllers.** Add `@UseGuards(RoleGuard)` + explicit `@Roles(...)` to branches, accounts, categories, matching, reconciliation, import. Then add a table-driven e2e test that enumerates *every* registered route and asserts an expected status per role — so an unguarded controller fails CI by construction rather than by someone remembering to write a test.
2. **Change `users_branch_id_fkey` to `RESTRICT`** (needs a migration, and therefore approval per AGENTS.md governance). Add a service-level pre-check so the 400 carries a message naming the assigned staff. Add a repair path for existing NULL rows — the seed's `update: {}` will not do it.
3. **Rewrite BCA direction resolution** to an explicit allowlist (`CR`/`DB`, case-insensitive, trimmed), skipping and reporting anything else. Reject negative amounts in both parsers. Add a `CHECK (amount >= 0)` on `bank_transactions`.
4. **Give the parsers a real spec suite** — fixture CSVs covering both banks, every type code, malformed dates, thousands separators, negative and zero amounts, unicode narrations, CRLF, BOM, empty file. This is the single highest-value test file that does not currently exist.
5. **Fix dedup identity.** Include the statement's running balance or a row ordinal in the hash, or carry a real `externalRef` where the bank provides one. Report duplicates as an explicit list of dropped rows, not an anonymous count.
6. **Constrain `sortBy`** to a per-endpoint `z.enum` in `packages/api-contracts` — one change, five endpoints fixed, and it keeps the contract as the single source of truth per ADR-010.
7. **Bound `soldAt`** and decide explicitly whether backdating is permitted, by whom, and how far.
8. **Add service-layer tests** for the transactional services, and commit the two concurrency harnesses used in this review as regression tests so ADR-007/ADR-016 stay protected.
9. **Make `pnpm audit` blocking** in CI, or gate it on severity — `continue-on-error: true` means no dependency advisory can ever fail a build.
10. **Then produce load evidence** for the query-time reports (ADR-008) at 12 months of realistic transaction volume. Until that exists, performance stays Unknown and no score above ~9 is defensible.

---

## Section 7 — Test plan for a human QA engineer

Executable scenarios, not principles. P0 must pass before any production consideration.

### P0-1 — Full role × route authorization matrix
1. Enumerate every registered route from the Nest router (or the Swagger doc at `/docs`).
2. For each of `KASIR`, `ADMIN`, `OWNER`, and unauthenticated, issue a minimal valid request.
3. Assert the observed status against a checked-in expectation table derived from ADR-011 and System Design v4 §5.
4. Confirm KASIR receives 403 on all of `/branches`, `/accounts`, `/categories`, `/matching/*`, `/reconciliation/*`, `/import/*`.
5. Confirm ADMIN receives 403 on `/reports/*` and `/users`, and 200 on master data and reconciliation.
6. Assert the route count in the test equals the router's route count, so a new unguarded controller fails the test automatically.

### P0-2 — Branch deletion with dependent staff
1. Create branch B. Create a `KASIR` assigned to B.
2. `DELETE /branches/B`. Assert **400**, and that the message names the blocking staff.
3. Assert the user still has `branchId = B`.
4. Log in as the cashier; `GET /sales?branchId=B` → 200.
5. Repeat with a branch carrying sales, ledger entries, purchases and stock movements — each must also 400.
6. Query `pg_constraint` and assert `users_branch_id_fkey.confdeltype = 'r'`.

### P0-3 — Bank import fidelity
1. Import a BCA CSV containing `CR`, `DB`, `CREDIT`, `cr`, empty, and a garbage type code.
2. Assert `CR`/`cr` → INFLOW, `DB` → OUTFLOW, and every other code is *rejected and reported*, never coerced.
3. Import a row with a negative amount. Assert rejection; assert the DB CHECK constraint also rejects a direct insert.
4. Import two genuinely distinct same-day, same-amount, same-narration deposits. Assert **both** persist and `SUM(amount)` equals the CSV total.
5. Re-import the identical file. Assert zero new rows and a response that lists which rows were treated as duplicates.
6. Assert `actualBankBalance` equals the balance computed by hand from the CSV.
7. Repeat steps 1–6 against the Mandiri format.

### P0-4 — Concurrency regression (commit as a permanent test)
1. Set one raw material to stock sufficient for exactly N units.
2. Fire 3N concurrent sales of 1 unit each via `Promise.all`.
3. Assert exactly N return 201 and 2N return 409.
4. Assert `currentStock` is exactly 0 and never negative at any point.
5. Assert `COUNT(stock_movements)` = N and `COUNT(sales)` = N — no orphan movement from a rolled-back sale.
6. Assert `SUM(ledger_entries WHERE source_type='SALE')` equals `SUM(sales.total_amount)`.
7. Repeat with two products sharing materials in opposite id order; assert zero deadlocks (no 500s).
8. Repeat for payables: 8 concurrent full settlements → exactly 1 success, `remaining_balance = 0`, `SUM(settlements) = original_amount`.

### P1-1 — List-endpoint parameter fuzzing
1. For each of `/sales`, `/payables`, `/suppliers`, `/ledger-entries`, `/supplier-purchases`:
2. Send `sortBy` as empty, unknown field, a relation name, `__proto__`, and a 10KB string.
3. Assert **400** every time — never 500, never a silently unsorted 200.
4. Send `page=0`, `page=-1`, `page=1e99`, `limit=0`, `limit=101`. Assert 400.
5. Send `startDate` after `endDate`. Assert 400.

### P1-2 — Sale date boundaries and report agreement
1. Create a sale dated one year in the future. Assert 400.
2. Create a sale dated in a prior closed month. Assert the system's documented backdating policy applies.
3. Create a sale at `23:59:59.999+07:00` on day D; assert it appears in D's `daily-income` bucket and not D+1's.
4. Create one at `00:00:00.000+07:00` on D+1; assert the mirror.
5. Assert `profit-loss.salesRevenue` equals `SUM(sales.total_amount)` for the same range and branch.
6. Assert `profit-loss.cogs` equals `SUM(hpp_at_sale × quantity)` computed independently.
7. Change a raw material's `unitCost`, re-run the report, and assert the historical figures are byte-identical (ADR-005).

### P1-3 — Session revocation
1. Log in; capture the access cookie. Log out. Assert the old cookie returns 401 on the next request.
2. Log in twice in the same second; log out once; assert both sessions are dead (probes the documented 1s `iat` resolution).
3. Refresh from two clients simultaneously with the same refresh token; assert the outcome is deliberate and documented, not an arbitrary loser.
4. Deactivate a user mid-session; assert the very next request is 401.
5. Change a password; assert every prior session is dead.
6. Force a DB failure during logout; assert the response is *not* a success (DEF-009).

### P2-1 — Reconciliation state machine
1. Propose a match; assert status `PENDING_REVIEW`.
2. Allocate partially; assert `PARTIALLY_ALLOCATED`. Allocate the remainder; assert `MATCHED`.
3. Revoke the only allocation on a previously `PENDING_REVIEW` transaction; assert the resulting status is intentional and the proposal is not silently lost.
4. Replay an allocation with the same `idempotencyKey`; assert no duplicate row and no change to the sum.
5. Attempt to allocate an INFLOW to an OUTFLOW ledger entry; assert 400.

### P2-2 — Report performance at volume
1. Seed 12 months of realistic data — ~80k sale items across two branches.
2. Run all five reports at 1-day, 1-month, and 366-day ranges; record p50/p95 latency.
3. `EXPLAIN ANALYZE` each; confirm the `(branch_id, sold_at)` and `(branch_id, entry_date)` indexes are used and no sequential scan appears.
4. Run 20 concurrent report requests during active sale traffic; assert reports never block writes.
5. Record the numbers — ADR-008 explicitly defers this decision until real volume is known, so this is the evidence that reopens it.

---

## Method and limits

Findings were produced by reading the source and then exploiting a running instance (API on `:4013`, Postgres 16 on `:5433`). Concurrency was tested with real parallel HTTP requests, not reasoned about. Performance was **not** measured — no load tooling was available and no numbers are estimated. `apps/web` was not assessed.

**Side effects.** No project source files were modified during this review. The development database was written to during testing (test branches, accounts, categories, sales, and bank rows) and re-seeded afterwards via the documented `pnpm --filter api db:seed`. Two artifacts survive that re-seed and need manual cleanup:
- the user `qa.kasir@ohmypos.local`
- `kasir@ohmypos.local` still carrying `branch_id = NULL` from the DEF-002 reproduction
