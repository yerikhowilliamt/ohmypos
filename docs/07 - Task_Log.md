# OhMyPos — Task Log

**Purpose:** Give the next AI coding session (or the next you) the context of what was actually done, decided, and left unfinished — without needing to re-read the entire PRD/System Design/ADR/ERD/Playbook every time. Every completed (or abandoned) task gets an entry here.

**Depends on:** PRD v1, System Design v2, ADR-001–010, ERD v1, Engineering Playbook v1

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

_(No tasks completed yet — this log starts once implementation begins. Add the first entry above this line, following the template.)_