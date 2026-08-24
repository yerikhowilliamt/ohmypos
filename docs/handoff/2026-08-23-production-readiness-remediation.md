# Handoff — OhMyPos production-readiness remediation

**Repo:** `/Users/indofund.id/Documents/Yerikho/Projects/ohmypos` (monorepo: `apps/api` NestJS, `apps/web` Next.js, `packages/api-contracts` Zod, `packages/ui`)
**Branch:** `feat/adversarial-qa-remediation` (unchanged from session start — nothing committed this session)
**Date:** 2026-08-23

## How we got here

1. Ran `/final-project-review` — a whole-project audit. Published as an artifact: **https://claude.ai/code/artifact/af4f5737-4d29-406b-b8aa-8270fa44b575** (Overall Engineering Score 7.3/10, verdict "production-ready with conditions"). Read this first for full context on every finding — this handoff does not repeat it.
2. User asked to fix things to reach 9/10 / production-ready. Per `AGENTS.md`'s governance rules (schema/migration changes, new dependencies, and architecture changes all require explicit approval; non-trivial tasks need a plan with real options first), I asked 6 clarifying questions, then entered plan mode and produced a fully-grounded implementation plan.
3. **The approved plan is at `/Users/indofund.id/.claude/plans/cheeky-watching-scroll.md`.** Read this in full before doing anything else — it has exact file paths, exact schema diffs, exact SQL, and the reasoning for every decision. This handoff only tracks *progress against that plan*, not the plan's content.

## Decisions already made (do not re-ask)

1. DEBT-009 (price override) → **role-restrict only**: KASIR cannot override a line price at all; ADMIN/OWNER can.
2. DEBT-010 (void/refund) → **minimal interim guard**: ~30-min window from `soldAt`, ADMIN/OWNER only, full reversal only (no partial refund).
3. Backup/restore → **documented runbook + one drill**, docs/scripts only, no infra changes.
4. APM → **add Sentry** (approved as a new dependency: `@sentry/nestjs` + `@sentry/nextjs`).
5. CI E2E → **add Playwright** (approved as a new devDependency: `@playwright/test`).
6. `docs/plannings/` dangling refs in Task_Log.md → **annotate in place** as gitignored/local, not strip (already done — see below).

## Done this session (verified working)

- **Documentation drift (plan §5):** ERD/System_Design/Project_Handbook/PRD/ADR-009 label/AGENTS.md's new "Plan Closure Verification" rule (item 10) — all edited directly. Tech Debt Log reconciliation (added DEBT-048–057, fixed the DEBT-047 ID collision by renumbering the search-box defect to **DEBT-059**, annotated 32 dangling `docs/plannings/` refs in Task_Log.md) was done by a forked subagent — its report is in this conversation's transcript if you need sourcing details, but the file changes are the source of truth now.
- **DEBT-013** (unbounded inventory query): new composite index `@@index([rawMaterialId, movementDate, direction])` on `StockMovement`. Migration `20260823124533_add_stock_movement_direction_index`, applied to both dev DB and the e2e test DB.
- **DEBT-009** (price override): `PriceOverrideNotAllowedException` in `sales.exceptions.ts`; check added in `sales.service.ts`'s `create()` (Phase 1, before locking). 4 new e2e cases in `sales.e2e-spec.ts`. No schema change.
- **DEBT-010** (void/refund, the big one): fully implemented and tested.
  - Schema: `SaleStatus` enum, `Sale.status/voidedAt/voidedByUserId`, `LedgerSourceType.SALE_VOID`, disambiguated `User` relations (`SaleCashier`/`SaleVoidedBy`). Migration `20260823131437_add_sale_void`, applied to both DBs.
  - `SalesService.void()` — mirrors `AllocationService.revoke()`'s TOCTOU-safe lock-then-recheck pattern. Reverses stock via `applyInbound` (reusing `StockReferenceType.SALE`, widened `InboundStockInput.referenceType` to `'PURCHASE' | 'SALE'`) and cash via a real `OUTFLOW` `LedgerEntry` (`sourceType: 'SALE_VOID'`).
  - Controller: `POST /sales/:id/void`, `@Roles('ADMIN','OWNER')`.
  - **The report-correctness fix (the riskiest part of the whole plan):** `report-filters.ts`'s `saleScope()` now excludes `status = 'VOIDED'` (auto-fixes `productProfit`/`topProducts`/`profitLoss` COGS since they join `sales` directly). `reports.service.ts`'s `profitLoss()` `moneyRows`, `incomeByPaymentMethod()`, and `dailyIncome()`'s `incomeRows` each got a `LEFT JOIN sales s ON le.source_type='SALE' AND le.source_id=s.id` plus a `(s.id IS NULL OR s.status <> 'VOIDED')` exclusion, since those three read `ledger_entries` directly with no join and would NOT self-heal otherwise. Cash-view queries (`cashBalance`, `total_inflow`/`total_outflow`) needed no change — they already net by `type` alone.
  - `packages/api-contracts`: `SaleStatusSchema`, `SaleResponseSchema` gained `status`/`voidedAt`/`voidedByUserId`, `LedgerSourceType` enum gained `SALE_VOID` (also update `vocabulary.ts`'s `LEDGER_SOURCE_TYPE_LABELS` — it's an exhaustive `Record`). **Package was rebuilt** (`pnpm --filter @ohmypos/api-contracts build`) — must be rebuilt again if you touch it further.
  - Tests: 5 new e2e cases in `sales.e2e-spec.ts` (403 for KASIR, full reversal proof, double-void race via `Promise.all`, expired-window rejection, 404), plus **Case 41** in `reports.e2e-spec.ts` — creates a sale, voids it, asserts `profitLoss()`'s revenue/COGS/netProfit are byte-identical to before the sale existed while `cash.totalInflow`/`totalOutflow` still show the real reversal. This is the test that actually proves the report fix works.
  - **NOT yet done:** the frontend "Batalkan" (void) button in `apps/web/app/(pos)/sales/history/SalesHistoryClient.tsx` (plan §2 calls for it — ADMIN/OWNER-only row action, disabled after the window, confirmation dialog). Backend is fully done and tested without it.

**Test status as of last full run:** 424/424 API e2e passing (18 suites), 166/166 API unit tests passing, 433/433 web tests passing, `pnpm --filter api lint` clean, `pnpm --filter web lint` clean (pre-existing unrelated warnings only), `pnpm --filter api typecheck` and `pnpm --filter web typecheck` both clean. An `eslint --fix` auto-formatted a whitespace-only issue in `reports.e2e-spec.ts` right before this handoff was written — re-run the full e2e suite once to confirm it's still green before doing anything else (very likely fine, just wasn't re-confirmed).

## Not started yet (remaining plan items, in the plan's recommended order)

1. **Frontend void UI** (finishes DEBT-010, plan §2) — `SalesHistoryClient.tsx`.
2. **DEBT-028** — WCAG AA contrast fix on the primary button (`packages/ui/src/components/ui/button.tsx`, one-line change to `text-text-primary` instead of `text-white`; verify dark-mode pairing separately — plan §4 has the exact diff and the reasoning for what NOT to touch).
3. **Sentry** (plan §8) — `@sentry/nestjs`/`@sentry/nextjs`, env schema extension, CSP `connect-src` gotcha in `next.config.ts` (use the tunnel option).
4. **Playwright CI** (plan §9) — 3–5 starter specs sourced from `.agents/skills/e2e-playwright/SKILL.md`.
5. **DEBT-047 flakiness investigation** (plan §6) — time-boxed, has a defined stop condition (implement retry-once mitigation if root cause doesn't converge).
6. **Backup/restore runbook + drill** (plan §7) — docs + scripts, can be done any time in parallel with the above.

## Gotchas hit this session (save yourself the rediscovery)

- **Two separate databases**: dev uses `DATABASE_URL` from `apps/api/.env` (`ohmypos_db`, port 5433); e2e tests use a *different* DB (`ohmypos_e2e`, same port) from `.env.test`. `prisma migrate dev` only migrates the dev DB — you must **also** run `DATABASE_URL=<test-url> npx prisma migrate deploy` against the test DB or every e2e test 500s with `P2022 ColumnNotFound`. Do this every time you add a migration.
- **`LedgerSourceType` has two sources of truth**: the Prisma enum in `schema.prisma`, and a hand-maintained Zod enum in `packages/api-contracts/src/enums.ts` (imported by `ledger-entries.service.ts`, not the Prisma-generated type). Adding a Prisma enum value alone will NOT fix a TS error referencing this type — you must also update `enums.ts` and the exhaustive `LEDGER_SOURCE_TYPE_LABELS` Record in `vocabulary.ts`, then rebuild the package.
- Bash tool cwd persists across calls in this session/harness — `cd apps/api` when already in `apps/api` silently lands you somewhere wrong. Run `pwd` if a command mysteriously "command not found"s.
- `prisma migrate dev` was transiently blocked by a permission classifier once mid-session; retried fine after the user said "lanjutkan" (continue).

## Suggested skills for the next session

- **Load the plan file directly first** (`/Users/indofund.id/.claude/plans/cheeky-watching-scroll.md`) — it's already an execution-ready spec, no need to re-plan.
- Once all plan items are done, run the **`final-consistency-check`** skill — it's designed exactly for this: verifying the whole repo is internally coherent after a remediation pass, and that nothing claimed as fixed was actually only partially done (directly relevant given the audit's own ERR-029 finding about a plan that was approved but never verified as executed).
- Consider **`code-review`** (or `/code-review high`) on the accumulated diff before considering DEBT-010 fully closed, given it touches money/reporting SQL — a second pair of eyes on the `reports.service.ts` join logic specifically is worth it.
- Per the new AGENTS.md rule this session added (item 10, "Plan Closure Verification"), when you do eventually commit, the commit/PR description must enumerate exactly which plan items/DEBT IDs it closes.
- Nothing has been committed yet — do not commit/push without the user explicitly asking, per `AGENTS.md`'s governance section.
