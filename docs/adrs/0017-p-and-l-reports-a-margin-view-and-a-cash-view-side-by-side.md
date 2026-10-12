# ADR-017: P&L reports a margin view and a cash view side by side; material cost is never subtracted twice

**Status:** Accepted

**Context:** PRD §5.4 specifies a profit & loss report as "income − COGS − expenses". Taken literally against this schema, that double-counts raw material cost, because the same cost enters the books twice by design:

- ADR-005 records material cost as `SaleItem.hppAtSale`, recognised **when the product is sold**.
- ADR-006 records the same material cost as a `LedgerEntry` OUTFLOW, recognised **when the money leaves** — either at purchase (`sourceType = PURCHASE`) or at settlement (`sourceType = PAYABLE_SETTLEMENT`).

Subtracting COGS *and* all outflow deducts a sack of coffee beans once in the month it was bought and again in the month it was sold. The error is not a rounding artefact: it is the entire material spend of the period, and it biases profit downward in a way that looks plausible enough never to be questioned.

A second, quieter problem forced the same decision. Under ADR-014 every central purchase's ledger entry is attributed to `Pusat (Dapur Sentral)`. A purely cash-based per-branch P&L therefore shows every outlet with revenue and almost no material cost, and the central kitchen with cost and no revenue — which makes per-branch profit meaningless.

**Decision:**

1. **The headline figure is the margin view:** `netProfit = totalIncome − cogs − operatingExpenses`.
   - `totalIncome` = INFLOW entries, split on the response into `salesRevenue` (`sourceType = SALE`) and `otherIncome` (everything else).
   - `cogs` = `ROUND(Σ (SaleItem.hppAtSale × SaleItem.quantity), 2)` over sales in the period — the ADR-005 snapshot, never live `Product` HPP.
   - `operatingExpenses` = OUTFLOW entries with **`sourceType = MANUAL` only**. Raw material purchases and payable settlements are deliberately excluded, because their cost is already inside `cogs` for whatever has been sold.
2. **The cash view is reported alongside it, never mixed into it:** `cash.totalInflow`, `cash.totalOutflow`, `cash.materialCashOutflow` (`PURCHASE` + `PAYABLE_SETTLEMENT`), and `cash.netCashFlow = totalIncome − totalOutflow`.
3. **Revenue is read from `ledger_entries`, not from `sales`**, so every income figure across all five Dashboard 3 reports comes from one table and ties by construction. `Σ Sale.totalAmount = salesRevenue` is asserted as a test invariant rather than assumed.
4. **Income by payment method is grouped from the same INFLOW rows**, so its total equals `totalIncome` by construction.

**Consequences:**

- (+) Each cost is subtracted exactly once *within each view*, and the two views are individually meaningful: `netCashFlow` ties to the bank and is what reconciliation matches; `netProfit` is what tells the owner whether the business makes money.
- (+) Per-branch profit becomes meaningful, because `cogs` is attributable to the branch that sold the item (`Sale.branchId`) while material cash outflow largely is not (ADR-014).
- (−) `netProfit` does not notice the difference between material bought and material consumed: buying a year of coffee in one month leaves it unmoved. `netCashFlow` shows it. Both figures are on the response for exactly this reason.
- (−) Filtering a report to `Pusat (Dapur Sentral)` returns outflow with zero revenue and a `null` margin. This is the correct picture of a central kitchen, and it is pinned by an e2e case so it is not "fixed" later.
- (−) A user reading only one of the two figures can still draw a wrong conclusion. Mitigated by labelling on the Phase 8g screen, not by collapsing the two into one number.

**Alternatives considered:**

- *Cash-only P&L (`netProfit = totalInflow − totalOutflow`, COGS as a memo line)*: rejected as the headline. It is trivially correct and ties perfectly to reconciliation, but it makes per-branch profit meaningless under ADR-014 and ignores PRD §5.4's explicit request for COGS. It survives as the `cash` block.
- *Subtract COGS and all outflow (the literal reading of PRD §5.4)*: rejected — this is the double-count the ADR exists to prevent.
- *Full accrual with inventory valuation (capitalise purchases, release as COGS)*: rejected — requires an inventory valuation model, and ADR-013 already rejected moving-average costing. There is no balance sheet in v1 and nothing asks for one.
