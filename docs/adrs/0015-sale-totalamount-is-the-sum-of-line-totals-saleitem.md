# ADR-015: `Sale.totalAmount` is the sum of line totals; `SaleItem.hppAtSale` is per-unit; stock fan-out is aggregated per raw material

**Status:** Accepted

**Context:** Phase 5 builds the `Sale` flow, and three questions had to be settled before the first row could be written — each of them silently irreversible once sales exist, because a stored row does not record which convention wrote it.

1. **What `totalAmount` means.** DEBT-004 recorded that the approved mockup renders an 11% tax line and a `MEMBER10` discount code, neither of which has a field in ERD v3. DEBT-004 itself required tax and discount to be decided *together and before* `Sale` was built, because both change the definition of the total that every Dashboard 3 report reads.
2. **What `SaleItem.hppAtSale` stores.** ERD §3 says "snapshot per ADR-005" without stating whether the number is the per-unit cost or the line-extended cost. The two differ by a factor of `quantity`, and a report author who assumed the wrong one would produce a COGS figure wrong by orders of magnitude with nothing to flag it.
3. **How many `StockMovement` rows one sale writes.** A cart can reach the same raw material through several products, or through the same product twice on two lines at different prices.

**Decision:**

1. **No tax, no discount, no order type in v1.** `Sale.totalAmount` is exactly `Σ SaleItem.lineTotal`. There is no `subtotal`, `discountAmount`, `taxAmount`, `taxRate`, discount-code table, or `orderType` column. Discounts and negotiated prices are recorded through the per-line price override that PRD §5.2 already specifies for this purpose: `unitPriceAtSale` is what the customer actually paid and `isPriceOverridden` marks that it diverged from the master price. The income `LedgerEntry.amount` therefore equals `Sale.totalAmount` with no gross-versus-net distinction anywhere.
2. **`SaleItem.hppAtSale` is the PER-UNIT HPP** at the moment of sale — the same number `Product.hpp` shows live, produced by the same `calculateHpp` call. COGS for a line is `hppAtSale × quantity`; the column is not the line-extended cost.
3. **One `StockMovement` per distinct raw material per sale**, with quantities summed across every contributing line. The per-material total is computed by summing the *exact* products `quantity × quantityUsed` and rounding **once** to 4dp `HALF_UP` — rounding per line and then summing drifts, and the drift lands in `RawMaterial.currentStock` where it never washes out.

**Consequences:**

- (+) Decision 2 lets the `Sale` flow call `calculateHpp` verbatim, which is what ADR-005's consequence section demands: the live figure and the snapshot must never become two implementations that can drift.
- (+) Decision 3 keeps the lock set, the sufficiency check, and the decrement one-to-one with each other. A material appearing twice would otherwise be checked against a balance the first decrement had already moved.
- (+) Gross margin is `totalAmount − Σ(hppAtSale × quantity)`, with no tax to exclude and no discount to add back — Phase 7 reads one number.
- (−) A "total discounts given" report is not computable in v1: only the charged price is snapshotted, not the master price at sale time. If that report is ever wanted, the cheap addition is a `masterPriceAtSale` column, not a discount model.
- (−) Per-`SaleItem` stock traceability is lost. `StockMovement.referenceId` points at the `Sale` and there is no `saleItemId` column, so per-line granularity would record detail that cannot be read back. Recovering it later is an additive column, not a rewrite.
- (−) Decision 1 leaves the approved mockup's tax and discount lines unimplemented. Rendering them as static UI would promise behaviour the system does not have, which DEBT-004 already judged to be worse than omitting them.

**Alternatives considered:**

- *Sale-level `subtotal`/`discountAmount`/`taxAmount` columns*: rejected for v1 — nothing in the PRD, System Design, any ADR, or the ERD asks for tax; it exists only in the mockup. Adding it would split every Phase 7 revenue figure into gross and net for no requirement.
- *Full tax-rate and discount-code model*: rejected — largest schema surface, and it would need its own ADR for how tax interacts with COGS and margin.
- *Line-extended `hppAtSale`*: rejected — it folds a quantity into a column named like a unit cost, and it would prevent reusing `calculateHpp`, which is the specific outcome ADR-005 exists to prevent.
- *Nullable `hppAtSale` so recipeless products can be sold*: rejected — pushes a null into every COGS aggregation in Phase 7 and turns one clear error at sale time into a silent gap in every report. A product with no recipe is rejected instead, with `RecipeIncompleteException` (Playbook §6 already names it).
- *One `StockMovement` per (sale line, raw material)*: rejected — two rows with the same `referenceType` and `referenceId` for the same material are indistinguishable when read back.
