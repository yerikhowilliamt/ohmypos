# Planning Prompts — Index

Each file here is a **prompt to paste into a fresh session** (with the model noted) to generate an implementation plan for that piece of work — not the plan itself, and not code. None of these have been executed yet.

Model routing rule: Opus for anything with non-trivial business-logic risk (money/stock invariants, transaction boundaries, concurrent state, interactive UI with real invariants). Sonnet for straightforward CRUD/forms/tables where the backend already did the hard thinking.

| # | File | Area | Model | Depends on |
|---|---|---|---|---|
| 3 | `phase-03-master-data.md` | Backend — RawMaterial/Recipe/Product | Opus | Phase 2 (done) |
| 4 | `phase-04-purchasing-payables.md` | Backend — Supplier/Purchase/Payable/StockMovement-in | Opus | Phase 3 |
| 5 | `phase-05-sales.md` | Backend — Sale/SaleItem (highest risk) | Opus | Phase 3, 4 |
| 6 | `phase-06-inventory.md` | Backend — OpeningStock/Inventory Summary | Opus | Phase 4, 5 |
| 7 | `phase-07-reporting.md` | Backend — P&L/reports | Opus | Phase 3–6 |
| 8a | `phase-08a-frontend-auth-nav.md` | Frontend — logout/refresh/nav shell | Sonnet | Phase 2 (done) — do this first among 8x |
| 8b | `phase-08b-frontend-master-data.md` | Frontend — Master Data screens | Sonnet | Phase 3, 8a |
| 8c | `phase-08c-frontend-pos-sales.md` | Frontend — POS/Sales screen | **Opus** | Phase 3, 4, 5, 8a |
| 8d | `phase-08d-frontend-purchases-expenses.md` | Frontend — Purchases/Expenses screens | Sonnet | Phase 4, 8a |
| 8e | `phase-08e-frontend-opening-stock.md` | Frontend — Opening Stock screen | Sonnet | Phase 6, 8a |
| 8f | `phase-08f-frontend-inventory-summary.md` | Frontend — Inventory Summary screen | Sonnet | Phase 6, 8a |
| 8g | `phase-08g-frontend-reports.md` | Frontend — Reports screens | Sonnet | Phase 7, 8a |
| 8h | `phase-08h-frontend-reconciliation.md` | Frontend — Reconciliation/Matching screen | **Opus** | Phase 1 (done), 8a |
| 9 | `phase-09-hardening.md` | Cross-cutting — e2e, concurrency, ops readiness | Opus | Phase 8 (all) |

Note on 8h: its backend (reconciliation/matching) has existed since Phase 1 — it's only sequenced last because of the backend-all-then-frontend-all ordering. Could be pulled earlier for a quicker demoable slice if that's ever wanted.

Every prompt tells the receiving session to read `AGENTS.md` + `docs/04 - Engineering_Playbook.md` first (governance: schema/dependency/architecture changes need approval, plans need ≥3 options, no unrelated refactors) and to produce a **plan only** — none of them authorize writing code on their own.
