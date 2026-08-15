# Planning Prompt — Phase 9: Hardening & Production Readiness

**Intended model:** Opus
**Depends on:** Phase 8 (all frontend screens) and everything before it

---

## Prompt (paste into a fresh session)

You are generating an **implementation plan** for OhMyPos — do not write code yet.

First read: `AGENTS.md`, `docs/04 - Engineering_Playbook.md`, `docs/00 - PRD.md` §6 (non-functional requirements) and §9 (success criteria), `docs/01 - System_Design.md` §11 (flagged risks), `docs/06 - Error_Log.md`, `docs/08 - Tech_Debt_Log.md` (full list — this phase is partly about clearing accumulated debt), and `docs/07 - Task_Log.md` for what every prior phase actually shipped and what each one's handoff notes flagged as unresolved.

**AGENTS.md governance applies in full**: ≥3 implementation options where genuine choices exist; no unrelated refactors; no Git writes.

### Scope

This phase is verification and cross-cutting correctness, not new features:

1. **End-to-end financial cycle test**: a full month, opening → sales → purchases → closing, run as one continuous e2e suite, matching PRD §9's success criterion ("one full monthly cycle end-to-end without correction"). This is the single most important deliverable of this phase — it's the first point in the project where every module is exercised together.
2. **Concurrency re-verification**: re-run/extend the Phase 5 concurrent-sale lock tests at higher concurrency to confirm ADR-007's row-lock approach holds under realistic load, not just 2-way races.
3. **Report query performance**: check the Phase 7 reports against realistic data volume (System Design §11's flagged risk) — decide if ADR-008 (no materialized views) still holds or needs revisiting; don't silently add materialization without flagging it as an ADR change.
4. **Tech debt triage**: go through `docs/08 - Tech_Debt_Log.md` and close or explicitly re-flag every entry — do not let debt silently age past this gate.
5. **Ops readiness**: verify health checks, Prometheus metrics, structured logging with correlation IDs, and graceful shutdown (PRD §6 NFRs) are actually wired end-to-end, not just present in one module.

### Deliverable

An implementation plan (really more a verification/test plan at this phase) covering:
1. The e2e monthly-cycle test design.
2. Concurrency test extension design.
3. A go/no-go recommendation on ADR-008 based on measured (not assumed) report query performance.
4. A tech-debt disposition list (close / defer-with-new-ADR / defer-with-reason) for every open entry.
5. An ops-readiness checklist with pass/fail per item.

Wait for human approval before executing any of it.
