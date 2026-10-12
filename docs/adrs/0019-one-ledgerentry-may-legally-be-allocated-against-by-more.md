# ADR-019: One `LedgerEntry` may legally be allocated against by more than one `BankTransaction` — accepted as a v1 risk, not enforced

**Status:** Accepted

**Context:** While planning the frontend Reconciliation screen (the Phase 8h reconciliation plan, §1.6), a scope note assumed the backend prevents double-allocating the same `LedgerEntry` "per whatever uniqueness rule the backend enforces." Reading `AllocationService.create` and the migration SQL shows there is no such rule. The only uniqueness constraint on `Allocation` is `(bankTransactionId, idempotencyKey)` (ERD §6). `AllocationService.create` and `trg_check_allocation_sum` both cap the sum of `ACTIVE` allocations **per `BankTransaction`** — they never sum allocations per `ledgerEntryId`. So one `LedgerEntry` can legally receive allocations from several different `BankTransaction`s, and can legally be over-allocated relative to its own `amount`, with nothing server-side noticing.

This is a real gap: a ledger entry could be "settled" twice by two unrelated bank transactions, which is not the reconciliation invariant the module is meant to guarantee. It surfaced only now because the frontend screen is the first thing to expose a ledger-entry picker where an operator could actually trigger it.

**Decision:**

1. **This is accepted as a known v1 risk, not fixed.** No new migration, no new trigger, no schema change.
2. **The frontend adds an advisory-only signal**: the Reconciliation screen's split-allocation ledger-entry picker (`SplitAllocationDialog`) marks entries that already carry an `ACTIVE` allocation, but does not disable them — disabling would invent a rule the server does not have, and the server remains the single source of truth for what is actually allowed (Playbook §7).
3. **Revisit once real reconciliation volume exists.** If double-allocation of a ledger entry is observed in practice (or an operator reports being confused by it), the fix is a `trg_check_ledger_entry_allocation_sum` trigger mirroring `trg_check_allocation_sum`, added via a normal schema-change proposal (AGENTS.md governance gate).

**Consequences:**

- (+) No migration, no new trigger, no change to the two-layer enforcement pattern (`Decimal` check + `FOR UPDATE` trigger) that ADR-007 established for the invariant that *is* enforced.
- (+) The frontend does not lie about server behavior — it shows information, never a false guarantee.
- (−) A `LedgerEntry` can be double-settled by two different `BankTransaction`s with no server-side error. An operator relying on the advisory marker alone, or scripting around the API directly, can still do this.
- (−) The gap is silent: nothing logs or alerts when it happens. Detecting it today requires a manual query (`GROUP BY "ledgerEntryId" HAVING SUM(...) > entry.amount` over `ACTIVE` allocations).

**Alternatives considered:**

- *Add `trg_check_ledger_entry_allocation_sum` now, mirroring the existing trigger*: rejected for v1 — it's a migration for a gap with no observed incidence yet, and the existing trigger pattern (`FOR UPDATE` lock, `AFTER INSERT OR UPDATE OR DELETE`) needs to be re-derived correctly for the entry side rather than assumed identical (a `LedgerEntry` has no `sync_transaction_status`-equivalent status column to keep in sync). Worth doing the day it's actually needed, not speculatively.
- *Service-level `Decimal` check only, no trigger*: rejected — without a `FOR UPDATE` lock on the ledger entry, two concurrent allocation requests could each read a stale sum and both pass, recreating the exact race ADR-007 fixed for the bank-transaction side. A check that doesn't hold under concurrency is worse than an honestly-documented gap.
- *Block in the frontend by disabling already-allocated entries in the picker*: rejected — the frontend has no authority to invent a constraint the server doesn't enforce (Playbook §7); an operator using the API directly, or a future second screen, would bypass it entirely, and the UI would be asserting a guarantee that doesn't exist.
