# OhMyPos — Task Log

**Purpose:** Give the next AI coding session (or the next you) the context of what was actually done, decided, and left unfinished — without needing to re-read the entire PRD/System Design/ADR/ERD/Playbook every time. Every completed (or abandoned) task gets an entry here.

**Depends on:** PRD v1.1, System Design v4, ADR-001–012, ERD v3, Engineering Playbook v3

---

## How to use this log

- Add one entry per task, in reverse-chronological order (newest at the top).
- A "task" is whatever unit of work was actually handed to an AI agent or worked on in one sitting — a phase, a module, a single bugfix, a schema change. Don't force artificial task boundaries; log at the granularity work actually happened.
- Fill every field. If a field genuinely doesn't apply, write "N/A" rather than omitting it — an omitted field is ambiguous (forgotten vs. not applicable) to whoever reads this next.
- The "Handoff Notes" field is the most important one — write it for a reader who has *not* seen this conversation, only this log entry plus the standing docs (PRD/System Design/ADR/ERD/Playbook).
- Reference ADRs/System Design sections by number/section, don't restate their content here — this log is for what happened in a specific task, not a second copy of the architecture docs.

---

## Entry Template

```
### TASK-XXX — <short title>

- **Date:** YYYY-MM-DD
- **Module / Phase:** <e.g. Sale module, ERD implementation, apps/web scaffolding>
- **Objective:** <what this task was asked to do, one or two sentences>
- **Relevant docs:** <ADR/System Design/ERD sections this task implements or depends on>
- **What was done:** <concrete summary — files created/changed, endpoints added, schema
  migrations run>
- **Decisions made during this task:** <any small implementation decision that came up
  and wasn't already covered by an ADR — e.g. exact Zod refinement used for Decimal
  strings, exact NestJS-Zod integration library chosen (see ADR-010's note). If a
  decision was significant enough to need its own ADR, write it there instead and just
  link it here.>
- **Status:** Done | Blocked | In Progress
- **Handoff notes:** <what the next task needs to know — unfinished edges, follow-up
  work, anything that looked risky but was out of scope for this task>
```

---

## Log

### TASK-001 — Documentation correction pass against Kasync's literal schema

- **Date:** 2026-08-14
- **Module / Phase:** Pre-implementation (before Phase 0 scaffolding)
- **Objective:** Before writing any code for Phase 0–2, read all six standing docs plus Kasync's actual source, and resolve the open item ERD v2 §7 raised — that its ported-entity definitions were written from Kasync's documentation rather than its literal `schema.prisma`.
- **Relevant docs:** ERD v2 §7 (the open item), ADR-011, ADR-012 (written by this task), System Design §4, Playbook §17 (ADR trigger criteria).
- **What was done:** Read `../kasync/prisma/schema.prisma`, all five files under `../kasync/prisma/migrations/`, and the `allocation`, `matching`, `ledger-entries`, `accounts`, `categories`, `branches`, `auth`, `users` modules plus `common/` infrastructure. Compared field-by-field against ERD v2. Then: added **ADR-012** (ported tables take Kasync's literal schema as baseline); rewrote **ERD §2** ported entities and enums, added `User.isActive`, added Decimal precision + inherited constraints to §6, and replaced §7's open item with seven concrete porting notes; added `Import` and `Reconciliation` to **System Design §4** and reclassified `Auth`/`Users` as "Ported pattern, re-implemented"; added precision rules and `InvalidRoleBranchAssignmentException` to **Playbook §5/§6**; fixed the **Handbook §10** row that wrongly flagged `ADMIN` reconciliation as a bug, plus §5/§7/§8; added `Import` to **PRD §7**; bumped stale `Depends on` headers across all docs, `AGENTS.md`, and `README.md`. No code was written.
- **Decisions made during this task:** Three, all confirmed with the user before editing and recorded in ADR-012 — (1) keep Kasync's shared `TransactionType {INFLOW, OUTFLOW}` rather than renaming to `INCOME`/`EXPENSE`, because `AllocationService` and `MatchingEngine` compare the two types directly; (2) when ERD v2 and Kasync's schema conflict on a ported table, Kasync wins and the ERD is corrected; (3) apply corrections in-place with version bumps rather than as a separate addendum. `User.isActive` was chosen over a `deactivatedAt` timestamp to match the existing `Product.isActive` convention in ERD §3.
- **Status:** Done
- **Handoff notes:** Phase 0 (monorepo scaffolding) has a plan awaiting approval and has **not** started — no files exist under `apps/` or `packages/` yet. The three biggest things Phase 1 now needs to know are all in ERD §7: stripping Kasync's multi-tenant `userId` makes porting an adaptation rather than a copy (it touches every method of every ported service, and Kasync's own tests assert on that scoping, so they need rewriting); Kasync's self-registration and self-delete endpoints must not be ported; and the SQL triggers should be copied from the `20260809180000_multi_tenancy_and_triggers` migration, not the `init` one, because the later version has a corrected enum cast. One consequence worth planning for early: `LedgerEntry.categoryId` stays required, so the seed must create system categories before any `Sale` or `PayableSettlement` can generate its ledger entry.

_(Add the next entry above this line, following the template.)_