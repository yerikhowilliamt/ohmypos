# Handoff — POS feedback Phase 2: central general expenses

**Repo:** `/Users/indofund.id/Documents/Yerikho/Projects/ohmypos`
**Date:** 2026-08-25
**Status:** Complete; not committed

## Outcome

The general-expense form now asks whether the expense belongs to `Cabang` or
`Pusat`. Cabang mode requires a real branch and never offers the seeded central
system branch. Pusat mode sends `branchId: null`.

The API resolves that null inside the same Postgres transaction as the money
write, storing the UUID of `Pusat (Dapur Sentral)` in the existing non-null
`LedgerEntry.branchId`. KASIR is rejected by `BranchScopeGuard`; ADMIN and OWNER
may use central attribution. Existing manual expenses can be edited and moved
between center and branch, while generated entries remain non-editable.

The general-expense list and spreadsheet export now include a `Lokasi` field.

## Verification

- `pnpm turbo run lint typecheck test` — 13/13 tasks passed
- API unit tests — 175/175 passed
- Web tests — 456/456 passed
- `auth-rbac.e2e-spec.ts` — 41/41 passed, including four central-location cases
- `git diff --check` — passed
- Live browser smoke — unavailable because no browser was connected to this
  session; no substitute browser surface was used

## Issue found and fixed

ERR-033: asynchronous branch-reference loading could rerun edit initialization
and overwrite a just-selected central location. Initialization and central-row
normalization are now separate effects, with a regression test for the exact
PATCH payload.

## Decisions and constraints carried forward

- Request `branchId: null` means central; response `branchId` is always the
  resolved database UUID.
- The database schema remains unchanged and `LedgerEntry.branchId` remains
  non-null.
- Create and update use the existing `resolveLedgerBranchId` system reference.
- The form defaults to branch mode without silently choosing central.
- Only manual entries expose edit actions.
- No package dependency, migration, commit, or push was made.

## Remaining feedback phases

Phases 3–7 remain intentionally untouched. In particular, raw-material purchase
units, recipe-unit conversion, costing strategy, stock-opname units, waste, and
BEP reporting still depend on the friend's answers recorded in the planning
conversation.
