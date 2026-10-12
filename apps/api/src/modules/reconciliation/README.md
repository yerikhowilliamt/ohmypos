# Reconciliation (with Matching and Allocation)

**Owner modules:** `reconciliation` (read side), `matching` (candidate proposals), `allocation` (linking money); `import` feeds them
**Related:** PRD §5.7 · ERD §6, §7 · ADR-001, ADR-008, ADR-011, ADR-012, ADR-025 · Playbook §7 · DEF-A3, DEF-A17, DEF-QA-02, DEF-QA-03, TASK-083, TASK-084

All three modules were ported from Kasync (ADR-001, ADR-012) with the multi-tenant `userId` scoping removed (ERD §7). **All endpoints are `ADMIN`/`OWNER` only**, set at controller level so reads are covered too (ADR-011): a cashier has no reason to see how bank money was allocated across branches.

## Flow

```
bank statement ──import──▶ BankTransaction (UNRESOLVED)
                                 │
                 POST /matching/propose ──▶ candidates, status PENDING_REVIEW
                                 │
           POST /allocations ──▶ Allocation(bankTxn ↔ ledgerEntry, amountPortion)
                                 │   (trg_sync_transaction_status updates the status)
                                 ▼
             PARTIALLY_ALLOCATED / MATCHED
```

`TransactionStatus` has four values (`UNRESOLVED`, `PENDING_REVIEW`, `PARTIALLY_ALLOCATED`, `MATCHED`), and `TransactionType` is `INFLOW`/`OUTFLOW`. These are Kasync's literal names, because the SQL triggers write those literals. **Do not rename them** (ADR-012, AGENTS.md).

## Matching (`modules/matching`)

| Endpoint | Effect |
|---|---|
| `POST /matching/propose` | Runs the engine over `UNRESOLVED` transactions (optionally one account) and moves the proposed ones to `PENDING_REVIEW` |
| `POST /matching/reset` | Returns every `PENDING_REVIEW` row for an account to `UNRESOLVED` |
| `POST /matching/reject/:bankTransactionId` | "Abaikan": returns **one** `PENDING_REVIEW` transaction to `UNRESOLVED` |

### `MatchingEngine` (pure, ported verbatim)

Three passes over bank transactions and ledger entries of the **same type**:

| Pass | Rule | Confidence |
|---|---|---|
| Exact | Same amount, same day | 1.0 |
| Fuzzy | Same amount, within `dateToleranceDays` (default 3) | `1.0 − 0.1 × days` |
| Aggregation | 2 to `maxAggregationSubsetSize` (default 4) transactions summing to one entry | `0.85 − 0.05 × maxDays` |

- Transactions taken by an exact match are skipped by the later passes.
- Results are sorted by confidence and capped at `maxCandidates` (20).
- **Aggregation is combinatorial**, so it is bounded three ways:
  1. **Arithmetic pre-filter** (TASK-084): skip an entry whose amount lies outside `[sum of the two smallest, sum of the N largest]` transactions, since no subset can match it. This removes most of the cost on real data.
  2. **Per-entry pool cap:** at most 20 transactions are combined per entry. If pools routinely exceed 20, narrow the date window rather than raise the cap.
  3. **Global subset budget** of 2,000,000. When it runs out, the response carries `truncated: true`, and **the UI must say so** (DEF-A17): "we stopped searching" and "there are no other candidates" are different statements.

### `MatchingService.proposeMatches`

- **Concurrency (DEF-QA-03):** it locks this call's `UNRESOLVED` rows with `FOR UPDATE SKIP LOCKED` before reading them. Otherwise two admins opening Reconciliation at once compute candidates against the same rows, and one reviewer's queue silently contains transactions the other just proposed against.
- **The lock query must include `tenant_id`.** Without it, one tenant's Reconciliation page would lock every tenant's `UNRESOLVED` rows for the length of the transaction (raw SQL bypasses the tenant extension).
- **Bounded ledger window (TASK-084):** it loads at most 5,000 ledger entries, ordered by `entryDate`, within the transactions' date range ± tolerance. The window used to be unbounded, so one old unreconciled transaction pulled a year of entries into memory and into subset enumeration.

## Allocation (`modules/allocation`)

| Endpoint | Effect |
|---|---|
| `POST /allocations` | Create one or many allocations (single-item and multi-item request shapes are flattened) |
| `POST /allocations/:id/revoke` | Revoke an allocation |
| `GET /allocations/transaction/:txnId`, `GET /allocations/ledger-entry/:ledgerEntryId` | List allocations |

### The sum caps (enforced twice, on purpose)

| Cap | Application check | Database trigger |
|---|---|---|
| Σ active allocations ≤ bank transaction amount | `AllocationService.create` (clear 400) | `trg_check_allocation_sum` (`init` migration) |
| Σ active allocations ≤ ledger entry amount (DEF-A3) | `AllocationService.create` | `trg_check_ledger_allocation_sum` (`20260823120100_…`) |

The application check gives the caller a readable 400. **The trigger closes the check-then-act race under concurrency.** Removing either half is not a simplification. A trigger rejection (`P0001`) is mapped to 400 `AllocationExceededError` by the global filter (see `common/README.md`).

### Locking

- `create`: lock the **bank transaction** row first (`FOR UPDATE`, as the trigger does), then each **ledger entry**. Reversing this order lets two concurrent allocations over swapped (transaction, entry) pairs deadlock (`40P01`, TASK-083).
- `revoke` (DEF-QA-02): lock **the same parent rows in the same order** before touching the allocation. Otherwise a concurrent `create` reads the sum mid-revoke and over- or under-counts, and the matching order means the two can never deadlock.
- All lock queries include `tenant_id` and compare `TEXT` ids. **No `::uuid` cast**: Postgres rejects `text = uuid`.
- **Idempotency:** items whose `idempotencyKey` already exists are resolved first and excluded from the cap, so a replay is not double-counted.

## Reconciliation read side (`modules/reconciliation`)

| Endpoint | Returns |
|---|---|
| `GET /reconciliation/transactions` | Paginated bank transactions with filters (`totalPages` is at least 1, like every paginated service) |
| `GET /reconciliation/summary` | Dashboard: bank vs ledger totals and `variance` |

Computed at query time (ADR-008).

- The **keyword search** is applied to the list only, never inside `buildWhereClause`. The summary derives both sides of `variance` from that clause, and the keyword can only match bank descriptions; narrowing just the bank side would produce a wrong `variance` that still looks official.
- The **balance ignores the status filter**, so it always reflects the full bank position (unchanged from Kasync).

## Testing

| Layer | File | Covers |
|---|---|---|
| Unit | `matching/matching-engine.spec.ts` | Exact, fuzzy, aggregation, tolerance, confidence |
| E2E | `test/allocation-sum.e2e-spec.ts` | Cumulative overflow, revoke/reallocate, direction mismatch, idempotency, decimal precision |
| E2E | `test/concurrency.e2e-spec.ts` | Import dedup (P0-3) |
| E2E | `test/reconciliation-addendum.e2e-spec.ts` | Read side, proposals, reject/reset |
