# Handoff — POS feedback Phase 1: expense categories

**Repo:** `/Users/indofund.id/Documents/Yerikho/Projects/ohmypos`
**Date:** 2026-08-25
**Status:** Complete; not committed

## Outcome

ADMIN and OWNER now have `Data Master → Kategori Pengeluaran` at
`/master-data/expense-categories`. The screen lists only OUTFLOW categories,
supports create/rename/delete for ordinary categories, and visibly locks the
system category `Pembelian Bahan Baku`.

The API is the enforcement boundary. Both `Pembelian Bahan Baku` and
`Penjualan` are classified through `isSystemCategoryName`; update and delete
requests for either are rejected even if a client bypasses the UI. Category
responses expose computed `isSystem` without a database migration.

## Verification

- `pnpm --filter api typecheck` — passed
- `pnpm --filter web typecheck` — passed
- `pnpm --filter api test -- --runInBand categories.service.spec.ts` — 5/5 passed
- `pnpm --filter web test -- ...` — full Vitest run, 453/453 passed

## Decisions and constraints carried forward

- Canonical protected names remain in `apps/api/src/common/system-refs.ts`.
- `Operasional` is not a system category and remains editable.
- The existing `['categories']` React Query key is deliberately shared between
  Data Master CRUD and the general-expense picker.
- No schema, migration, or dependency changed.
- The working tree already contained an unrelated user change to
  `docs/.DS_Store`; it was not touched.

## Next phase

Phase 2 will allow a manual general expense to target either a real branch or
the central operation. A request with `branchId: null` must be resolved by the
backend to the seeded `Pusat (Dapur Sentral)` branch while KASIR remains denied
from central attribution.
