# OhMyPos — Error Log

**Purpose:** Record every real error/bug found during implementation — not just what broke, but why, how it was fixed, and how to stop it from happening again. This is a debugging accelerant for future-you (or a future AI session): the next time something looks similar, check here before re-diagnosing from scratch.

**Depends on:** Engineering Playbook v3 (Section 10 of the Project Handbook has a smaller, doc-level troubleshooting table for architecture-level symptoms — this log is for actual errors hit during implementation, at whatever granularity they occurred)

---

## How to use this log

- Add one entry per distinct error — not per occurrence. If the same root cause shows up in three different tasks, that's one entry with three dates noted, not three entries.
- Log real errors actually encountered — compile errors, failed tests, wrong data in the database, a race condition that actually manifested, a rejected PR for a correctness bug. Don't log hypothetical or anticipated errors here; those belong in the Playbook's self-review checklist instead.
- **Root cause, not just symptom.** "The stock number was wrong" is a symptom. "The `FOR UPDATE` lock was missing on `RawMaterial` inside the `Sale` transaction, so two concurrent sales both read stale stock" is a root cause.
- **Prevention must be concrete and checkable** — a new test case, a new self-review checklist item, a linter rule, an ADR update. "Be more careful" is not a valid prevention entry.
- If an error reveals a gap in the Engineering Playbook or an ADR, fix the source document too and reference that update here — don't let the same class of error need re-discovering.

---

## Entry Template

```
### ERR-XXX — <short title>

- **Date found:** YYYY-MM-DD (add further dates if the same root cause recurs)
- **Found during:** <task/phase — link to the Task Log entry if one exists>
- **Symptom:** <what was actually observed — an error message, wrong output, a failed
  test, a data inconsistency>
- **Root cause:** <the actual underlying reason, not the symptom restated>
- **Resolution:** <what specifically fixed it — code change, migration, config change>
- **Prevention:** <concrete, checkable step to stop recurrence — new test, new
  self-review checklist item (Playbook §16), new ADR, new lint rule>
- **Severity:** Low | Medium | High | Critical <High/Critical = touched money or stock
  correctness>
```

---

## Log

_(No errors logged yet — this log starts once implementation begins. Add the first entry above this line, following the template.)_