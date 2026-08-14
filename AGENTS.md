# AGENTS.md — OhMyPos

Context for any AI agent (or future-you) working in this repo. Read this alongside the [Engineering Playbook](./04%20-%20Engineering_Playbook.md) before making changes — the Playbook is the technical rulebook, this doc is the domain/project context that doesn't fit there.

---

## AI Gatekeeper & Governance (CRITICAL)

- **STOP & ASK APPROVAL** before doing any of the following:
  1. Modifying `schema.prisma` or creating database migrations.
  2. Adding, removing, or updating package dependencies.
  3. Making architectural changes or breaking API contracts.
  4. Pushing, committing, or creating a PR (do not perform Git write operations unless explicitly requested).
- **Plan Before Code:** For non-trivial tasks, generate a step-by-step implementation plan and WAIT for human approval before writing code. **The plan MUST include at least 3 implementation options**, detailing the trade-offs for each and clearly stating the recommended approach.
- **Strict Scope (No Drift):** Do NOT perform unrelated refactoring. Edit only the files strictly required for the specific task.

## Glossary

| Term | Meaning |
|---|---|
| HPP | Harga Pokok Penjualan — cost of goods sold, computed from a product's recipe |
| Utang | Debt owed to a supplier for an unpaid purchase, tracked as a `Payable` |
| Kas Awal | Opening cash — the starting cash balance, centralized (not per-branch) |
| Reconciliation | Matching bank statement transactions against `LedgerEntry` records via `Allocation` |
| Central Purchase | A `SupplierPurchase` with `branchId = null` — bought centrally, not by one branch |
| Flow Indicator | The signature UI motif for any inflow/outflow number (DESIGN.md) |
| Ported module | A module copied and adapted from Kasync, unchanged in responsibility |

## Known Constraints & Scope Boundaries

- Single business, single currency (IDR), no multi-tenancy in v1 (PRD §3 Non-goals).
- Stock and cash are centralized pools; there is no per-branch balance anywhere in the schema (ADR-004) — do not build features that assume otherwise without a new ADR revisiting this.
- No message queue or background job runner in v1 — everything is synchronous request/response (System Design §9).
- Reports are computed at query time, not from materialized views (ADR-008) — expect this to need revisiting once real transaction volume is known.
- PDF bank statement parsing is out of scope, same as Kasync (PRD §10).

## Contributing & Workflow

1.  **Transaction Boundary:** Every change touching money or stock MUST happen in a single Postgres transaction. This is the core repo rule (see Playbook §7).
2.  **API Contracts:** Zod schemas in `packages/api-contracts` are the single source of truth (ADR-010). If you change a schema here, you must update *both* `apps/api` and `apps/web` in the same PR.
3.  **ADRs:** New ADRs follow the trigger criteria in Playbook §17. When superseding, mark "Superseded," don't delete (like ADR-009 → ADR-010).
4.  **Testing Requirement:** If a task or phase requires testing, you MUST write unit tests. For critical features, write e2e tests as well. After writing tests, run them (`turbo run lint typecheck test`) locally before pushing.
5.  **Documentation Log:** After tests pass and the task is complete, you MUST document the work in the respective logs under `docs/`: `06 - Error_Log.md`, `07 - Task_Log.md`, and/or `08 - Tech_Debt_Log.md`.
6.  **Database Changes:** Run `pnpm --filter api prisma migrate dev --name <name>` to migrate, then `pnpm --filter api db:seed` to reset synthetic data.
7.  **Code generation & Types:** Zod schemas drive both API validation and TS types. Do not manually type request/response objects if a Zod schema exists. **NEVER use the `any` type.**

## Troubleshooting

| Symptom | Likely cause | Where to look |
|---|---|---|
| Stock and ledger numbers disagree after a sale | A step in the `Sale` flow ran outside the transaction | System Design §6.1, Playbook §7 |
| Duplicate/incorrect stock balance under concurrent sales | Missing `FOR UPDATE` lock on `RawMaterial` | ADR-007 |
| Frontend form accepts something the backend then rejects | A Zod schema was updated on one side but not the other | ADR-010, Playbook §4 |
| An expense shows up before money actually left the account | A `SupplierPurchase` incorrectly created a `LedgerEntry` while `paymentStatus = UNPAID` | ADR-006 |
| A cashier can see or write data for another branch | `BranchScopeGuard` missing on that endpoint | Playbook §8 |
| Historical P&L changed after a raw material price update | `SaleItem.hppAtSale` wasn't snapshotted correctly at sale time | ADR-005 |