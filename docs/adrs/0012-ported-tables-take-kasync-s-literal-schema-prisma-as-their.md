# ADR-012: Ported tables take Kasync's literal `schema.prisma` as their baseline

**Status:** Accepted

**Context:** ERD v2 §7 left an explicit open item: its ported-entity field definitions were written from Kasync's documented ADRs/ERD, not from Kasync's actual schema file, and needed cross-checking before implementation. That cross-check has now been done against `../kasync/prisma/schema.prisma` and every file in `../kasync/prisma/migrations/`.

The differences turned out to be material rather than cosmetic. Three of them are load-bearing:

- Kasync's `TransactionStatus` has four values (`UNRESOLVED`, `PENDING_REVIEW`, `PARTIALLY_ALLOCATED`, `MATCHED`); ERD v2 listed three different ones. The `trg_sync_transaction_status` trigger writes those literals directly, and `PENDING_REVIEW` is the state `MatchingService` moves transactions into when it proposes a match.
- Kasync uses a single shared `TransactionType {INFLOW, OUTFLOW}` enum for both `BankTransaction` and `LedgerEntry`, and both `AllocationService.create` and `MatchingEngine` compare the two directly (`bankTransaction.type !== ledgerEntry.type` is a rejection). ERD v2 specified `enum(INCOME, EXPENSE)` for `LedgerEntry` only, which would break that comparison.
- `BankTransaction.externalRef`/`dedupHash` (with their two unique constraints) and `Allocation.idempotencyKey` are absent from ERD v2 entirely, but carry the CSV import de-duplication and the idempotent allocation-creation behaviour respectively.

Separately, every ported Kasync table carries a `userId` foreign key with user-scoped unique constraints, and every ported service method takes a `userId` scoping parameter — a multi-tenancy layer ADR-011 already decided OhMyPos does not have.

**Decision:**

1. **For the seven ported tables, Kasync's literal schema is the baseline**, and ERD v2's ported-entity definitions are corrected to match it (ERD v3). OhMyPos-specific requirements are layered on top of that baseline rather than replacing it.
2. **`TransactionType {INFLOW, OUTFLOW}` is retained** as the single shared direction enum, used by `BankTransaction`, `LedgerEntry`, and `Category.type`. The Indonesian-language product vocabulary (pemasukan/pengeluaran) maps to it at the presentation layer, not in the schema.
3. **`TransactionStatus`'s four values are retained verbatim**, so Kasync's triggers port without being re-derived.
4. **Kasync fields that carry behaviour are retained**: `BankTransaction.type`, `externalRef`, `dedupHash`, `importedAt`; `Allocation.idempotencyKey`, `revokedAt`; and their unique constraints. `Allocation` keeps `createdAt` only — it has no `updatedAt`.
5. **The multi-tenant `userId` FK is dropped** from `Account`, `Category`, `Branch`, and `LedgerEntry`, and every ported service loses its `userId` scoping parameter (ADR-011 — single business, no tenant isolation).
6. **OhMyPos additions layered on top:** `LedgerEntry.accountId` (required), `sourceType`, `sourceId`; `Account.openingBalance`; `Category.type`; `Branch.address`; `createdAt`/`updatedAt` on `Category` and `Branch`; `User.isActive`.
7. **Decimal precision:** monetary values use `Decimal(18, 2)`, matching Kasync. Quantity values use `Decimal(18, 4)` — 2 decimal places cannot represent realistic recipe quantities in kg or liter.

**Consequences:**

- Kasync's allocation-sum trigger, its transaction-status sync trigger, its import de-duplication, and its allocation idempotency all port across unchanged — which is what System Design §6.5 assumes when it says the reconciliation invariant is enforced "the same way, unchanged."
- ERD v3 becomes trustworthy as an implementation target: any field it marks as new really is absent from Kasync, and anything it doesn't mark really can be copied.
- (−) `LedgerEntry.categoryId` stays **required** (Kasync's shape), so the seed must provide system categories for the entries `Sale` and `PayableSettlement` generate automatically — a sale cannot create an uncategorised ledger entry.
- (−) The codebase says `INFLOW`/`OUTFLOW` while the product speaks pemasukan/pengeluaran, leaving a translation step in the UI layer. Logged as DEBT-003 rather than hidden.
- (−) Porting is now explicitly an adaptation, not a copy: stripping `userId` touches every method of every ported service. This raises Phase 1's effort estimate and means Kasync's ported tests need rewriting, not just re-pointing.

**Alternatives considered:**

- _ERD v2's definitions win; adapt Kasync's code to them_: rejected — the three-value `TransactionStatus` would force `trg_sync_transaction_status` to be rewritten rather than copied verbatim, and dropping `externalRef`/`dedupHash`/`idempotencyKey` would silently delete import de-duplication and allocation idempotency along with the fields.
- _Two separate direction enums (`INFLOW/OUTFLOW` for bank, `INCOME/EXPENSE` for ledger) with a mapping layer_: rejected — semantically tidier, but it inserts a conversion into every bank↔ledger comparison, which is the single most correctness-critical path in the reconciliation engine.
