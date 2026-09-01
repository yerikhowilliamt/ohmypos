# AGENTS.md — OhMyPos

**Depends on:** PRD v1.1, System Design v4, ADR-001–012, ERD v3, Engineering Playbook v3

Context for any AI agent (or future-you) working in this repo. Read this alongside the [Engineering Playbook](./docs/04%20-%20Engineering_Playbook.md) before making changes — the Playbook is the technical rulebook, this doc is the domain/project context that doesn't fit there.

---

## Kasync Source Location

OhMyPos ports modules from Kasync (ADR-001) — it does **not** call Kasync's live API at runtime. When a task requires reading Kasync's actual implementation (schema, service logic, migrations, tests) rather than its documented ADRs/ERD:

- Kasync's source is available at a **local path**, sibling to this repo: `../kasync` (i.e. `~/projects/kasync`, alongside `~/projects/ohmypos`).
- Key locations inside it: `../kasync/prisma/schema.prisma` (schema + enums), `../kasync/prisma/migrations/` (raw SQL triggers), `../kasync/src/modules/` (service/controller/repository code per module), `../kasync/test/` (existing test suites to adapt). `../kasync/kasync-state-export.md` is a prior audit summary — useful for orientation, but read the actual source files before porting anything, per the note below.
- Read the actual files there (`schema.prisma`, `src/modules/*`, `prisma/migrations/*`) — do not guess or reconstruct Kasync's logic from `03 - ERD.md` or `02 - ADR.md` alone; those documents summarize Kasync's design but are not a substitute for the literal source when porting code (see ERD §7, Open Item).
- Kasync's live deployment (`https://kasync.onrender.com`) is a reference for confirming the API is up, not a data source for porting — never call it from OhMyPos code or tests.
- **Read `03 - ERD.md` §7 (Porting Notes) before porting anything.** That source read has already been done once (ADR-012) and §7 records the traps that aren't visible from the schema alone — the multi-tenant `userId` scoping threaded through every ported service method, and the Kasync endpoints (self-registration, self-deletion, Cloudinary photo upload) that must **not** come across because they contradict ADR-011.

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
| Reconciliation | Matching bank statement transactions against `LedgerEntry` records via `Allocation` — restricted to `ADMIN`/`OWNER` (ADR-011) |
| Central Purchase | A `SupplierPurchase` with `branchId = null` — bought centrally, not by one branch |
| Flow Indicator | The signature UI motif for any inflow/outflow number [DESIGN.md](./docs/DESIGN.md) |
| Ported module | A module copied and adapted from Kasync, unchanged in responsibility |
| Kasir | Cashier role — branch-scoped access only (`User.branchId` required), cannot create users or perform reconciliation matching (ADR-011) |
| Admin | Staff role with all-branch data access, reconciliation-matching permission, and Master Data + Reconciliation frontend routes only — cannot create users (ADR-011, System Design v4 §5) |
| Owner | Business owner role — all-branch access, full back-office route access, the only role that can create/deactivate `User` records (ADR-011) |

## Known Constraints & Scope Boundaries

- Single business, single currency (IDR), no multi-tenancy in v1 (PRD §3 Non-goals).
- Stock and cash are centralized pools; there is no per-branch balance anywhere in the schema (ADR-004) — do not build features that assume otherwise without a new ADR revisiting this.
- No message queue or background job runner in v1 — everything is synchronous request/response (System Design §9).
- Reports are computed at query time, not from materialized views (ADR-008) — expect this to need revisiting once real transaction volume is known.
- PDF bank statement parsing is supported for **two** issuers: the Mandiri Livin e-statement (ADR-022, reversing the original PRD §10 deferral) and the BCA "Laporan Mutasi Rekening" e-statement (ADR-026). Other issuers are still CSV-only. Both parsers read the table by **column x-position, not by line regex** — re-derive the geometry against a real sample before changing either, and never share code between them on the assumption the layouts are similar. They are not: Mandiri keys rows off a `No` column at a fixed 46pt pitch with `+`/`-` signed, dot-grouped amounts (`1.099.500,00`) and a year on every row; BCA keys rows off a `DD/MM` cell with **variable-height** rows, a bare `DB` marker column for direction, comma-grouped amounts (`205,000.00`), and **no year on the row at all** — it comes from the `PERIODE` page header.
- **Real bank e-statements must never be committed.** They carry live account numbers, holder names, phone numbers and counterparty names. `.gitignore` makes `docs/e-statements/` default-deny for `*.pdf`, allow-listing only the generated `NN-mandiri-*` / `NN-bca-*` samples. Regenerate fixtures with `make-statements.js` / `make-bca-statements.js` rather than adding a real file.
- User creation is `OWNER`-only with no approval workflow or self-registration (ADR-011) — do not build an `ADMIN`-initiates/`OWNER`-approves flow without a new ADR revisiting this.
- Ported tables use Kasync's literal schema, including its enum names — `TransactionType` is `INFLOW`/`OUTFLOW`, **not** `INCOME`/`EXPENSE`, and `TransactionStatus` has four values because the SQL triggers write those literals (ADR-012). Do not "tidy" these names; `AllocationService` and `MatchingEngine` compare `bankTransaction.type` against `ledgerEntry.type` directly.
- `ADMIN`'s frontend access is limited to `(back-office)/master-data` and `(back-office)/reconciliation` only — not reports, inventory, expenses, or user management (System Design v4 §5). This was a deliberate v1 decision, not an oversight — don't widen it without flagging it for a doc update first.

## Contributing & Workflow

1.  **Transaction Boundary:** Every change touching money or stock MUST happen in a single Postgres transaction. This is the core repo rule (see Playbook §7).
2.  **API Contracts:** Zod schemas in `packages/api-contracts` are the single source of truth (ADR-010). If you change a schema here, you must update *both* `apps/api` and `apps/web` in the same PR.
3.  **Role & Branch Enforcement:** Any endpoint with role or branch restrictions must apply `RoleGuard` and/or `BranchScopeGuard` explicitly (ADR-011, Playbook §8) — never rely on frontend routing alone to hide access.
4.  **ADRs:** New ADRs follow the trigger criteria in Playbook §17. When superseding, mark "Superseded," don't delete (like ADR-009 → ADR-010 → ADR-011).
5.  **Testing Requirement:** If a task or phase requires testing, you MUST write unit tests. For critical features, write e2e tests as well. After writing tests, run them (`turbo run lint typecheck test`) locally before pushing.
6.  **E2E Frontend Testing (MCP Playwright):** For UI smoke tests and user-flow verification, use the Playwright MCP server directly from the agent — no spec files needed. Read the skill at `.agents/skills/e2e-playwright/SKILL.md` before starting any E2E session. Seed credentials, proven selectors, and known gotchas (especially CurrencyInput formatting behavior) are documented there.
7.  **Documentation Log:** After tests pass and the task is complete, you MUST document the work in the respective logs under `docs/`: `06 - Error_Log.md`, `07 - Task_Log.md`, and/or `08 - Tech_Debt_Log.md`.
8.  **Database Changes:** Run `pnpm --filter api prisma migrate dev --name <name>` to migrate, then `pnpm --filter api db:seed` to reset synthetic data. Remember: schema/migration changes require approval first (see Governance above).
9.  **Code generation & Types:** Zod schemas drive both API validation and TS types. Do not manually type request/response objects if a Zod schema exists. **NEVER use the `any` type.**
10. **Plan Closure Verification:** When a remediation/task plan is marked done, the commit or PR description MUST explicitly enumerate which plan items it closes (by ID, e.g. "Closes DEBT-009, DEBT-013"), cross-checked against the actual diff before committing — a plan item is not "closed" until its corresponding file changes are actually present in the diff. (Added after ERR-029: a previously approved remediation plan was believed shipped but was never actually executed, leaving a live defect in place until a second audit caught it.)

## Troubleshooting

| Symptom | Likely cause | Where to look |
|---|---|---|
| Stock and ledger numbers disagree after a sale | A step in the `Sale` flow ran outside the transaction | System Design §6.1, Playbook §7 |
| Duplicate/incorrect stock balance under concurrent sales | Missing `FOR UPDATE` lock on `RawMaterial` | ADR-007 |
| Frontend form accepts something the backend then rejects | A Zod schema was updated on one side but not the other | ADR-010, Playbook §4 |
| An expense shows up before money actually left the account | A `SupplierPurchase` incorrectly created a `LedgerEntry` while `paymentStatus = UNPAID` | ADR-006 |
| A `KASIR` can see or write data for another branch | `BranchScopeGuard` missing on that endpoint | ADR-011, Playbook §8 |
| A `KASIR`/`ADMIN` can create a user, or a non-`ADMIN`/`OWNER` can perform reconciliation matching | `RoleGuard` missing or misconfigured on that endpoint | ADR-011, Playbook §8 |
| Historical P&L changed after a raw material price update | `SaleItem.hppAtSale` wasn't snapshotted correctly at sale time | ADR-005 |