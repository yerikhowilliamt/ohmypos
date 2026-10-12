# ADR-016: Raw-material row locks are acquired in ascending `rawMaterialId` order, all before any mutation

**Status:** Accepted

**Context:** ADR-007 established that `RawMaterial.currentStock` is decremented under a `SELECT ... FOR UPDATE` row lock, and closed the read-then-write race. It did not say anything about *ordering*, because at the time only one flow took those locks and its line list was short.

Phase 5 changes that. A sale of N products fans out through `RecipeItem` to M distinct raw materials, where M is neither supplied by the client nor derivable from the request without reading the recipes. Two concurrent transactions that lock the same two materials in opposite order deadlock: PostgreSQL aborts one with `40P01`, which surfaces to a cashier as a 500 they cannot act on, non-deterministically, at the busiest moment of the day. Under the obvious per-line implementation the lock order is the customer's cart order — so this is not a bug that care prevents, it is a bug the customer chooses.

Three flows now lock `raw_materials`: `SupplierPurchasesService.create` (via `StockMovementsService.applyInbound`), `SalesService.create`, and `StockMovementsService.applyOutbound`. A central purchase and a branch sale genuinely run at the same time, so the ordering has to hold *across* flows, not just within one.

**Decision:**

1. **Every transaction that locks `raw_materials` acquires all of its locks before any mutation, in ascending `rawMaterialId` order.** No exceptions, no flow-local ordering.
2. **The lock loop lives in exactly one function** — `StockMovementsService.lockRawMaterialsInIdOrder(tx, ids)` — called by `applyInbound`, by `applyOutbound`, and by `SalesService` before it reads `unitCost` for the HPP snapshot. Two copies of an invariant are two places to get it wrong.
3. **Locks are acquired before the first read of `unitCost` or `currentStock`**, not merely before the decrement, so a sale's HPP snapshot and its stock decrement see the same version of the same rows. A concurrent master-data price edit can otherwise produce a `hppAtSale` that never coexisted with the balance that was decremented.
4. **The ordering is produced by a pure function** (`aggregateStockRequirements`, which returns its entries sorted) so that it is asserted by a unit test with no database, rather than resting on a comment.

**Consequences:**

- (+) Deadlock between any two stock-touching transactions is unreachable by construction: a cycle cannot form when every participant takes locks in the same total order. Contending transactions queue instead of one being aborted.
- (+) The rule holds between a sale and a purchase, not just between two sales.
- (+) The correctness of the ordering is testable at two levels: a unit test on the calculator's output, and an e2e test firing overlapping carts concurrently and asserting zero 500s.
- (−) The lock phase costs one round trip per distinct raw material. At a realistic cart (≤ 8 products → ≤ 15 materials) this is single-digit milliseconds inside a transaction that already runs ~10 statements.
- (−) `applyInbound` changed from interleaved lock/write to lock-all-then-write. Same order, strictly safer, and already covered by `purchasing-payables.e2e-spec.ts` cases 3 and 8 — but it is a touch of shipped Phase 4 code, taken deliberately rather than duplicating the invariant.
- (−) A transaction now holds every one of its raw-material locks for its whole duration rather than releasing them progressively (it never did release them early — Postgres holds row locks to commit — but the acquisition is earlier). This is the pessimistic cost DEBT-002 already tracks.

**Alternatives considered:**

- *Lock lazily, per sale line, as each product's recipe is walked*: rejected — the lock order becomes the client-controlled cart order, which is exactly the deadlock. It also re-locks a material shared by two products in the same cart, and can only ever report one shortfall when the cashier needs the whole list.
- *A single batched statement, `SELECT id FROM raw_materials WHERE id = ANY($1) ORDER BY id FOR UPDATE`*: rejected for v1 and logged as DEBT-008. It is one round trip instead of M, and the ordering is correct today because `LockRows` sits above `Sort` — but that is a query-plan dependency, and no test in this repo can pin a plan shape. A plan change would show up as an intermittent `40P01` in production against a green suite.
- *Optimistic concurrency (version column, retry)*: rejected — ADR-007 already rejected it for v1 and DEBT-002 tracks it as the future path with a measured trigger. It would also need retry orchestration around a transaction that creates a `LedgerEntry`, so a retried sale must be idempotent or it double-writes money.
- *Rely on ADR-007's lock without an ordering rule*: rejected — that is the status quo, and it is correct for balances and silently wrong for liveness.
