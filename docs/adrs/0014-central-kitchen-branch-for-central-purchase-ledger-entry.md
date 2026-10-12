# ADR-014: Central kitchen branch for central-purchase ledger entry attribution

**Status:** Accepted — **amended 2026-08-29 (TASK-120), see the Amendment section below.** The decision stands; how the row is identified and what it is called both changed.

**Context:** ERD v3 §3 and ADR-004 establish that `SupplierPurchase.branchId` is nullable, where `branchId = null` is the canonical marker for a "central purchase" (bought centrally by the business for raw materials/packaging). However, `LedgerEntry.branchId` is a required (`NOT NULL`) column inherited from Kasync's schema baseline (ADR-012).

A central purchase paid up front (`paymentStatus = PAID`) or settled later via a `PayableSettlement` must create an expense `LedgerEntry`. Because `LedgerEntry.branchId` is `NOT NULL`, the entry requires a branch to attribute the movement to.

**Decision:**
1. **`SupplierPurchase.branchId = null` remains the canonical and only way to record a central purchase.** The API never accepts a central branch ID from the client for `SupplierPurchase`.
2. **Seed a system branch named `Pusat (Dapur Sentral)`.** When generating a `LedgerEntry` from a central purchase or central payable settlement, the service resolves the branch ID for `Pusat (Dapur Sentral)` and assigns it to `LedgerEntry.branchId`.
3. **`LedgerEntry.branchId` remains `NOT NULL`**, preserving the ported table schema baseline (ADR-012) and ensuring all financial entries remain allocatable and attributable in reconciliation.

**Consequences:**
- (+) Preserves ADR-012: no modifications to the ported `LedgerEntry` schema structure.
- (+) Reflects real-world business operation: the central kitchen is an actual physical location (PRD §8.1).
- (+) Reconciliation and split-allocation work without special-case null-branch handling.
- (−) Two representations of "central" exist (`SupplierPurchase.branchId = null` vs `LedgerEntry.branchId = <Pusat>`). Mitigated two ways: the attribution is generated only inside system-entry creation (`resolveLedgerBranchId`), and `SupplierPurchasesService.create` rejects a purchase whose `branchId` resolves to `Pusat (Dapur Sentral)` with `CentralBranchNotAssignableException` (400). The rejection is enforced, not merely documented — a purchase attributed to `Pusat` directly would report `isCentral: false` while being central, which is quietly wrong in every branch-grouped report. Covered by Case 28 in `test/purchasing-payables.e2e-spec.ts`.
- (−) Database seed becomes load-bearing for central ledger entry creation; missing seed yields an explicit 500 error directing developer/admin to run `db:seed`.

**Amendment (2026-08-29, TASK-120) — the row is identified by a flag, and renamed:**

Two things in the original decision turned out to be wrong in practice.

1. **Point 2 said the service "resolves the branch ID for `Pusat (Dapur Sentral)`" — by name.** That made the row's NAME load-bearing, and nothing guarded it. Renaming the row broke no foreign key, so `PATCH /branches/:id` returned 200; only the *next* central purchase failed, with a 503 that named nothing and pointed at nothing. `Branch.isSystem` (migration `20260828201617_add_branch_system_and_main_store`, partial unique index `branches_single_system`) is now the lookup key. `resolveLedgerBranchId` uses `findFirst({ where: { isSystem: true } })`, and the two rejection sites compare `branch.isSystem` rather than the name. The row's label is now free data.

2. **The name itself was wrong.** "(+) Reflects real-world business operation: the central kitchen is an actual physical location (PRD §8.1)" does not hold for every business on this product — the Owner who raised it has no central kitchen at all. The row is a **scope** ("not tied to any one store"), not a place, and naming it like a flagship store made it read as one: it appeared in the Cabang list with Edit and Delete buttons while being absent from the POS branch picker, which is precisely how the confusion was reported. It is now **`Umum`**, and the corresponding UI control reads "Umum" rather than "Pusat".

Consequently the row is hidden from the Cabang page and from both cashier branch pickers (ERR-038), while remaining visible in reports — where its cost genuinely belongs (ADR-023). It is protected from rename and delete by `SystemBranchProtectedException`.

The last original consequence — "missing seed yields an explicit 500" — was true and worse than it read: the production bootstrap never created the row at all, so a real installation failed its first sale (ERR-037). `ensureSystemRefs` is now the single writer, shared by the bootstrap script and both seeds.

**Alternatives considered:**
- *Make `LedgerEntry.branchId` nullable*: rejected — changes ported table baseline (ADR-012), complicates query-time reporting aggregations with null buckets, and alters `BranchScopeGuard` semantics.
- *Require client to provide a separate ledger branch ID for central purchases*: rejected — confuses clients and leaks internal accounting rules into the public API.
