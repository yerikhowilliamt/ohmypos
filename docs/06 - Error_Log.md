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

### ERR-004 — Phase 4's `Restrict` foreign keys broke two older e2e suites, but only on a seeded database

- **Date found:** 2026-08-16
- **Found during:** Review of TASK-006 (Phase 4) against `docs/plannings/phase-4-purchasing-payables.md`
- **Symptom:** `pnpm --filter api test:e2e` passed when run twice in a row, and failed with 35 failures across `auth-rbac.e2e-spec.ts` and `master-data.e2e-spec.ts` when run straight after `pnpm --filter api db:seed`. Both suites reported "Test suite failed to run" rather than an assertion failure, because the error was thrown in `beforeAll`. **This is the order CI uses**, so it would have failed on the next pipeline run despite passing locally.
- **Root cause:** Phase 4 added `onDelete: Restrict` foreign keys pointing at tables the older suites wipe unconditionally. `auth-rbac`'s `prisma.ledgerEntry.deleteMany({})` hit `supplier_purchases_ledger_entry_id_fkey`, and `master-data`'s `prisma.rawMaterial.deleteMany({})` hit `supplier_purchase_items_raw_material_id_fkey`. Neither suite is wrong about wanting a clean table, and the `Restrict` rules are deliberate (financial history must never disappear because a parent row was deleted) — the defect is that a new module added children to tables that pre-existing suites delete, without extending their cleanup. It hid because an unseeded database has no purchasing rows, and because each e2e run left the tables empty for the next one; only the seed re-created the blocking rows.
- **Resolution:** Both suites now delete the Phase 4 children (`payableSettlement` → `payable` → `supplierPurchaseItem` → `supplierPurchase` → `stockMovement`) before their existing wipe, with a comment naming the constraint and the ADR-backed reason the `Restrict` stays. No production code and no schema changed — the FK behaviour is correct as designed.
- **Prevention:** Verified in both orders explicitly: `db:seed` → `test:e2e` and `test:e2e` → `test:e2e`, 71/71 green in each. General lesson for Phase 5 onward: **a green e2e run proves nothing about cleanup ordering unless it is run against a seeded database.** Any phase that adds a table with a `Restrict` FK must extend every existing suite that wipes the referenced table in the same change — the failure surfaces as `beforeAll` dying, which reads like an unrelated infrastructure problem rather than a data-model one.
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

_(Add the next entry above this line, following the template.)_