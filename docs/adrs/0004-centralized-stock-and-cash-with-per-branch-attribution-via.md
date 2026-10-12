# ADR-004: Centralized stock and cash, with per-branch attribution via `branchId`

**Status:** Accepted

**Context:** The business owner confirmed (PRD Section 8): raw material stock is centralized at one central kitchen, cash settles to one central account, and menu/pricing is identical across branches. However, cash arriving in the shared account is sometimes hard to attribute back to the branch that generated it — the core problem the reconciliation module exists to solve.

**Decision:** `RawMaterial.currentStock` and `Account` remain single, unpartitioned pools — no per-branch stock or per-branch account tables. `branchId` is still recorded on transactional records (`Sale`, `LedgerEntry`, `SupplierPurchase`) purely for attribution and reporting, not as a data-partitioning key.

**Consequences:**

- Simpler schema than a fully general per-branch model — no need to reconcile stock or cash _across_ branches, only to attribute shared totals back to their source.
- The `Allocation` module (ported from Kasync) becomes the mechanism for resolving the cross-branch cash-mixing problem: one bank deposit can be split-allocated across multiple branch-tagged `LedgerEntry` records.
- If the business later opens branches with independent stock or banking (a real possibility for a growing multi-branch business), this is a schema migration, not a config toggle — accepted as a reasonable v1 trade-off given the confirmed current policy.

**Alternatives considered:**

- _Per-branch stock and per-branch account tables from day one_: rejected — the business owner explicitly confirmed the current policy is centralized; building for a hypothetical future policy now would add schema and query complexity with no present-day payoff.
