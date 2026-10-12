# ADR-008: Reports computed at query time in v1; no materialized views yet

**Status:** Accepted. **Re-affirmed 2026-08-22** on measured volume (Phase 14 Workstream C, `DEBT-001`) — see below.

**Context:** Dashboard 3 and Dashboard 5 need aggregated, near-real-time figures (P&L, top products, inventory summary). Kasync's own reconciliation dashboard already uses query-time aggregation successfully at its transaction volume.

**Decision:** All OhMyPos reports are computed by querying `LedgerEntry`, `SaleItem`, and `StockMovement` directly at request time. No materialized views, snapshot tables, or scheduled aggregation jobs in v1.

**Consequences:**

- Simplest possible implementation, no cache-invalidation logic to maintain, reports are always exactly consistent with the underlying ledger/stock data.
- If report query latency becomes a problem once real data volume is known, this ADR should be revisited (materialized views or a dedicated read-model table) — tracked as a risk in System Design Section 11, not assumed to be permanent.

**Alternatives considered:**

- _Materialized views or a read-model table from the start_: rejected for v1 — premature optimization for a data volume that isn't yet known, and adds real implementation and consistency-maintenance cost.

**2026-08-22 re-affirmation (Phase 14 Workstream C):** The "if report query latency becomes a problem" condition above could finally be checked against measured data instead of guesswork. Two disposable volume tiers were seeded (`apps/api/prisma/seed-volume.ts`, 3 branches at realistic daily throughput): T1 (12 months, ~131K sales) and T2 (36 months, ~395K sales, ~986K `sale_items`, ~1.8M `stock_movements`). All five Dashboard-3 report endpoints, plus `cash-balance`, were measured at T2 over 20 warm HTTP requests each with `EXPLAIN (ANALYZE, BUFFERS)` on the underlying query. Applying System Design §11's literal trigger (any report >1s at a one-year range, or a Seq Scan on `sale_items`/`ledger_entries` at a one-month range): **no trigger fired for any of the six endpoints measured** — worst case was 720ms p95 (`daily-income` at one year), and every one-month query resolved via an index. This ADR's decision therefore **holds** at T2 volume, which is roughly 3x the business's actual current scale. Full measurement table and per-endpoint detail are recorded under `DEBT-001`. `GET /inventory/summary` was measured separately (it has no comparable "range" dimension) and its own stricter p95 budget **did** fire at T2 — see `DEBT-013`, which stays Open with the new numbers; this does not affect the verdict above, since System Design §11's report trigger and DEBT-013's inventory-specific budget are different thresholds by design.
