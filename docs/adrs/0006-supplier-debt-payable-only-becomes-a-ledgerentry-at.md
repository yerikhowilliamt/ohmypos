# ADR-006: Supplier debt (`Payable`) only becomes a `LedgerEntry` at settlement, not at purchase

**Status:** Accepted

**Context:** Raw material purchases can be paid immediately or bought on credit (utang). Recording an expense `LedgerEntry` at purchase time for unpaid purchases would show cash leaving the business before it actually has.

**Decision:** An unpaid `SupplierPurchase` increments stock immediately (the goods have arrived) and creates/increments a `Payable` balance, but does **not** create an expense `LedgerEntry`. A `LedgerEntry` is created only when a `PayableSettlement` records an actual payment.

**Consequences:**

- Cash-based reports (P&L, daily income, reconciliation) always reflect money that has actually moved, matching the reconciliation module's purpose.
- Stock and financial state can be briefly "out of sync" from a naive perspective (stock is already up, but no expense is recorded yet) — this is intentional and must be understood by anyone building reports against these tables.

**Alternatives considered:**

- _Record the expense LedgerEntry at purchase time regardless of payment status_: rejected — distorts cash-based reporting and would make the "Reconciliation" module reconcile against numbers that don't correspond to real bank activity.
