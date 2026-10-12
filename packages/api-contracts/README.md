# @ohmypos/api-contracts

**Related:** ADR-010 (Zod everywhere), ADR-011, ADR-012, ADR-024, ADR-025 · Playbook §4, §5, §18

Every request and response shape is defined here **once**, as a Zod schema. `apps/api` validates requests with it (`createZodDto` + the global `ZodValidationPipe`), and `apps/web` validates forms and responses with it. TypeScript types come from `z.infer` and are never hand-written alongside. Kasync's class-validator DTOs were deliberately not ported.

**A change to a schema here must update both `apps/api` and `apps/web` in the same PR** (AGENTS.md).

## Conventions

- One file per resource: `<resource>.schema.ts`, exporting a PascalCase schema plus its inferred type (Playbook §18). Everything is re-exported from `index.ts`.
- Field-level TSDoc stays in the schema, because both apps see it on hover. Keep it to one line; put the reasoning in the module README of the API module that owns the rule.
- Enums mirror `apps/api/prisma/schema.prisma`, which keeps **Kasync's literal names** (`INFLOW`/`OUTFLOW`, four `TransactionStatus` values). They are not renamed to income/expense: `AllocationService` and `MatchingEngine` compare these values directly, and the SQL triggers write them (ADR-012). Indonesian labels are applied in the UI through `vocabulary.ts` (DEBT-003).

## Decimal primitives (`primitives.ts`)

Money and quantities cross the API as **strings**, never JSON numbers. A JSON number is an IEEE-754 double and cannot hold a rupiah amount or a stock quantity without risking silent precision loss (Playbook §5). Services parse the strings into `Decimal` before any arithmetic. Each primitive enforces the **same precision and scale as its database column**, so an over-precise value is rejected at the edge instead of being silently rounded on insert. Input accepts `"10"`, `"10.5"` and Indonesian `"10,5"`.

| Primitive | Column | Use |
|---|---|---|
| `MoneyString` | `Decimal(18,2)` | Ledger amounts, line totals, sell prices, `hppAtSale` |
| `QuantityString` | `Decimal(18,4)` | Stock and recipe quantities |
| `UnitCostString` | `Decimal(18,6)` | **Per-unit cost, a rate** (ADR-024). Rp10.000 over 3.000 g is 3,333333/g, and rounding to 2dp understates HPP by about 0.1% on every gram or ml material. The UI shows 2dp; the extra digits keep HPP arithmetic lossless |
| `ConversionFactorString` | `Decimal(18,4)`, > 0 | Stock units per purchase unit (`1 ekor = 10 pcs` → `"10"`). Zero is rejected here because it is the one value that makes unit cost a division by zero |
| `WastePercentString` | `Decimal(5,2)`, 0–100 | Waste allowance. Above 100% means the recipe is wrong; rejecting a typo'd `500` at the edge is cheaper than finding it in a P&L |
| `SignedQuantityString`, `SignedMoneyString` | — | Computed differences (carry-forward, closing balance, profit, net cash flow). **Never** a stored `quantity`: stored movements carry magnitude only, with the sign in `direction` |
| `IdempotencyKey` | UUID | Client-generated key for money-writing endpoints (TASK-082). A UUID has a fixed length, accidental collisions are practically impossible, and `crypto.randomUUID()` exists in every supported browser. Optional, so older clients keep working (without the replay protection) |

All primary keys are UUIDs. Date-times are ISO-8601 strings, parsed to `Date` server-side.

## Rules encoded at the edge

These are enforced in the schemas themselves, so both apps reject bad input identically. The authoritative checks and their rationale live in the API module READMEs.

| Schema | Rule | Why |
|---|---|---|
| `CreateSaleSchema` | `branchId` required, not nullable | There is no central sale (ADR-004); the system branch is rejected server-side |
| `CreateSaleSchema` | No `userId`, `totalAmount` or `hppAtSale` | The server derives them. A client-supplied cashier is a forgeable audit trail, a client total is a money hole, and a client HPP is a margin hole |
| `CreateSaleSchema` | At most 50 lines; **no** duplicate-product check | Bounds the lock-holding transaction (ADR-016). The same product may appear twice at two prices, which is what the per-line override is for |
| `CreateSaleSchema` items | `unitPrice` optional | The per-line override is the **only** discount mechanism in v1 (ADR-015, DEBT-004) |
| `CreateSupplierPurchaseSchema` | `branchId` is a **required key that may be `null`** | `null` is the only way to record a central purchase, and it must be typed deliberately, never reached by forgetting the field. `BranchScopeGuard` rejects `null` for `KASIR` before validation |
| `CreateSupplierPurchaseSchema` | `PAID` requires `accountId`; `UNPAID` forbids it | ADR-006: no money moves until settlement |
| `CreateSupplierPurchaseSchema` | One line per raw material; no `totalAmount`, `quantity` or `unitCost` | Unambiguous lock set. The user enters what the nota says (purchase quantity and **total** price) and the server derives the rest (ADR-024) |
| `UpsertOpeningStockSchema` | One declaration per material; at most 200 entries | A second declaration would silently win the upsert; the cap bounds the lock window |
| `ReplaceRecipeSchema` | `quantityUsed` > 0, unique materials; an empty array clears the recipe | Zero would break the makeable-quantity division |
| `CreateUserSchema` | `KASIR` needs `branchId`; `ADMIN`/`OWNER` must have none | ADR-011. Prisma cannot express this conditional constraint. `UpdateUserSchema` is partial, so the service re-checks the **merged** state |
| `CreateUserSchema`, resets | Password minimum length only, no composition rules | Composition rules push users to reuse passwords. Platform admin passwords need **12**, matching `create-platform-admin.ts` |
| `StartImpersonationSchema`, owner recovery schemas | `reason` required, minimum 10 characters | A one-word reason makes the audit trail technically complete but useless |
| `ResetTenantOwnerPasswordSchema`, `UpdateTenantOwnerEmailSchema` | Explicit `userId` | A tenant may have several `OWNER`s; "the first found" could act on the wrong account |
| `PlatformAdminLoginSchema` | Separate from `LoginSchema` despite the same shape | They authenticate different tables with different secrets, and a shared symbol invites merging them into one endpoint. There is no create-platform-admin schema: platform admins exist only through the CLI |
| `PaginationQuerySchema` | Max 100; `sortOrder` is opt-in per module | A route must never advertise a parameter its service ignores (that happened with `sortOrder` before) |
| `AttendanceQuerySchema`, `LeaveRequestListQuerySchema` | Raised page cap for one calendar month | A missing attendance or leave cell reads as "absent". ERR-047: the matrix used to send `limit=500` to a 100-capped endpoint and never drew approved leave |
| Leave query | `overlapsFrom` / `overlapsTo`, not `startDate` / `endDate` | Overlap semantics (leave from 28 Feb to 3 Mar is in both months); the distinct names make that impossible to misread |
| Report schemas | `ReportDate` is an inclusive WIB calendar day `YYYY-MM-DD` (rejects `2026-3-5`, `2026-02-30`) | ADR-018; the server resolves the half-open UTC range |
| Period schemas | `YYYY-MM`; the response `endDate` is exclusive | One definition shared by Dashboards 3 and 5 |

## Response shapes worth knowing

- **`InsufficientStockErrorSchema`**: the 409 body with `details.shortfalls[]` **per raw material**, not per cart line. One short material can be reached through several products; clients map back through `recipeItems`. Use `safeParse`, because other 409s (`InactiveProduct`, `RecipeIncomplete`) carry no `details`.
- **`SaleItemResponse.hppAtSale`** is the **per-unit** snapshot (ADR-015). `SaleResponse.totalHpp` is `Σ hppAtSale × quantity`, rounded once.
- **`ProfitLossResponse`** has two views (ADR-017): `netProfit` subtracts COGS but not material purchases, and `cash.netCashFlow` subtracts every outflow but not COGS. Subtracting both would count raw material twice. Percentages are `null` when the denominator is zero, never NaN.
- **`IncomeByPaymentMethodResponse.total`** equals `ProfitLossResponse.totalIncome` for the same range; this is a tested invariant.
- **`DailyIncomeResponse`** has a row for **every** day in range (zero-filled), and `averagePerDay` divides by all days.
- **`CashBalanceResponse`** has no branch filter by design: accounts and opening balances have no branch, and scoping only the ledger side would misstate the total.
- **`StockMovementResponse.branchId`** is `null` for central events (central purchases, `OPENING`), and the UI shows "Pusat". Sorting defaults to `movementDate` (the business date), which can be weeks before `createdAt`.
- **`PaymentMethodResponse`** (POS) never includes `openingBalance`.
- **`TenantDetailResponse.isPristine`**: true when the tenant holds nothing beyond what provisioning created. It decides whether an owner-email change needs `acknowledgeExistingData`.
- **`ImpersonationSessionResponse.accessToken`** appears only when a session starts: a 30-minute tenant token with no refresh.
