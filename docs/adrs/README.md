# Architecture Decision Records — OhMyPos

**Status:** Draft v3
**Depends on:** PRD v1.1, System Design v4, ERD v3

**Changelog (v2 → v3):** Added ADR-025, which turns OhMyPos into a multi-tenant system and adds a platform-operator identity. It partially supersedes ADR-011 — that ADR's rejection of a multi-tenant Business layer no longer holds, while everything else it decided does.

**Changelog (v1 → v2):** Added ADR-012, recording the field-level baseline for the seven ported tables after Kasync's literal `schema.prisma` was read for the first time. No existing ADR is superseded — ADR-012 amends ERD v2 → v3, which ERD §7 had already flagged as needing exactly this cross-check.

This directory holds the decisions that are expensive to reverse or that correctness depends on. Smaller implementation choices stay in the [System Design](../system-design.md), the [ERD](../erd.md) or the Task Log entry that made them.

## Index

| ADR | Decision | Status |
| --- | --- | --- |
| [ADR-001](0001-ohmypos-is-a-new-repo-that-ports-kasync-s-module-patterns.md) | OhMyPos is a new repo that ports Kasync's module patterns, rather than extending Kasync or calling it via API | Accepted |
| [ADR-002](0002-monorepo-with-next-js-frontend-decoupled-from-the-nestjs.md) | Monorepo with Next.js frontend decoupled from the NestJS backend via REST | Accepted |
| [ADR-003](0003-continue-using-prisma-as-the-orm.md) | Continue using Prisma as the ORM | Accepted |
| [ADR-004](0004-centralized-stock-and-cash-with-per-branch-attribution-via.md) | Centralized stock and cash, with per-branch attribution via `branchId` | Accepted |
| [ADR-005](0005-hpp-is-computed-live-on-product-but-snapshotted-on-saleitem.md) | HPP is computed live on `Product`, but snapshotted on `SaleItem` | Accepted |
| [ADR-006](0006-supplier-debt-payable-only-becomes-a-ledgerentry-at.md) | Supplier debt (`Payable`) only becomes a `LedgerEntry` at settlement, not at purchase | Accepted |
| [ADR-007](0007-row-level-lock-select-for-update-on-rawmaterial-during-sale.md) | Row-level lock (`SELECT ... FOR UPDATE`) on `RawMaterial` during sale-time stock decrement | Accepted |
| [ADR-008](0008-reports-computed-at-query-time-in-v1-no-materialized-views.md) | Reports computed at query time in v1; no materialized views yet | Accepted |
| [ADR-009](0009-hand-written-shared-api-contract-types-in-packages-api.md) | Hand-written shared API contract types in `packages/api-contracts` (not code-generated, for now) — Superseded by ADR-010 | Accepted, provisional |
| [ADR-010](0010-zod-as-the-single-shared-validation-and-type-source-on-both.md) | Zod as the single shared validation and type source, on both backend and frontend | Accepted |
| [ADR-011](0011-authentication-and-role-based-access-control-kasir-admin.md) | Authentication & Role-Based Access Control (Kasir / Admin / Owner) | Accepted |
| [ADR-012](0012-ported-tables-take-kasync-s-literal-schema-prisma-as-their.md) | Ported tables take Kasync's literal `schema.prisma` as their baseline | Accepted |
| [ADR-013](0013-product-has-no-stock-pos-shows-derived-advisory-makeable.md) | Product has no stock; POS shows derived advisory makeable quantity, and HPP stays recipe-based | Accepted |
| [ADR-014](0014-central-kitchen-branch-for-central-purchase-ledger-entry.md) | Central kitchen branch for central-purchase ledger entry attribution | Accepted |
| [ADR-015](0015-sale-totalamount-is-the-sum-of-line-totals-saleitem.md) | `Sale.totalAmount` is the sum of line totals; `SaleItem.hppAtSale` is per-unit; stock fan-out is aggregated per raw material | Accepted |
| [ADR-016](0016-raw-material-row-locks-are-acquired-in-ascending.md) | Raw-material row locks are acquired in ascending `rawMaterialId` order, all before any mutation | Accepted |
| [ADR-017](0017-p-and-l-reports-a-margin-view-and-a-cash-view-side-by-side.md) | P&L reports a margin view and a cash view side by side; material cost is never subtracted twice | Accepted |
| [ADR-018](0018-report-period-boundaries-and-daily-buckets-are-asia-jakarta.md) | Report period boundaries and daily buckets are Asia/Jakarta; storage stays UTC | Accepted |
| [ADR-019](0019-one-ledgerentry-may-legally-be-allocated-against-by-more.md) | One `LedgerEntry` may legally be allocated against by more than one `BankTransaction` — accepted as a v1 risk, not enforced | Accepted |
| [ADR-020](0020-profile-photo-upload-via-cloudinary-reversing-erd-7-note-4.md) | Profile Photo Upload via Cloudinary (Reversing ERD §7 Note 4) | Accepted |
| [ADR-021](0021-attendance-tracking-branch-device-registry-and-leave.md) | Attendance Tracking, Branch Device Registry, and Leave Requests (Expanding Beyond PRD §3/§10 Non-Goals) | Accepted |
| [ADR-022](0022-bank-statement-import-accepts-pdf-e-statements-alongside.md) | Bank statement import accepts PDF e-statements alongside CSV (Reversing PRD §10) | Accepted |
| [ADR-023](0023-calendar-period-boundaries-are-asia-jakarta-everywhere.md) | Calendar period boundaries are Asia/Jakarta everywhere, extending ADR-018 to Inventory | Accepted |
| [ADR-024](0024-purchases-are-entered-in-the-supplier-s-pack-unit-at-a.md) | Purchases are entered in the supplier's pack unit at a total price; the latest purchase sets the live material cost; waste is a per-product HPP allowance | Accepted |
| [ADR-025](0025-multi-tenancy-via-a-shared-database-with-a-tenantid.md) | Multi-tenancy via a shared database with a `tenantId` discriminator, and a separate `PlatformAdmin` identity | Accepted |
| [ADR-026](0026-bca-e-statement-pdf-import-and-the-geometry-rules-a-second.md) | BCA e-statement PDF import, and the geometry rules a second issuer forces | Accepted |

## Conventions

- One file per decision: `NNNN-kebab-case-title.md`, numbered sequentially and never reused. The ID used in text stays `ADR-NNN` (three digits), because code comments, logs and other docs cite it that way.
- Add the new ADR's row at the bottom of the index.
- Status: `Proposed`, `Accepted`, `Superseded by ADR-NNN`, or `Deprecated`, optionally with a date. When superseding, mark the old ADR "Superseded" and link the new one — never delete it (ADR-009 → ADR-010 → ADR-011).
- Trigger criteria for writing an ADR are in the [Engineering Playbook](../guide.md) §17.

## Template

```markdown
# ADR-NNN: <Short decision title>

**Status:** Proposed | Accepted | Superseded by ADR-NNN

**Context:** <forces and constraints that led here>

**Decision:** <the decision, stated plainly>

**Consequences:**

- <positive and negative consequences>

**Alternatives considered:**

- _<Option>_: <why not chosen>
```
