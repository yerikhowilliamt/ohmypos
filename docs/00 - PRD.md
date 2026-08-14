# OhMyPos — Product Requirements Document

**Status:** Draft v1

---

## 1. Executive Summary

OhMyPos is a point-of-sale (POS) and back-office management system for small food & beverage / retail businesses in Indonesia, built for a friend's multi-branch business. It covers the full operational loop of a small business: recording sales, tracking raw material cost (HPP), managing inventory, tracking supplier debt, and producing automatic financial and inventory reports.

Unlike a typical POS system that treats "reconciliation with the bank" as an afterthought, OhMyPos is built on top of Kasync's proven reconciliation engine (`Account`, `LedgerEntry`, `BankTransaction`, `Allocation`, `MatchingEngine`). Every sale automatically produces a ledger entry that can later be reconciled against the actual bank statement — solving the same settlement-timing problem Kasync was originally built for, now sourced automatically from POS transactions instead of manual entry.

## 2. Background & Problem Statement

The target business currently manages sales, expenses, raw material purchases, and stock manually (spreadsheets / notebooks), across multiple branches. This creates several recurring problems:

- No single source of truth for daily sales, cost of goods sold (HPP), or profit per product.
- Raw material stock levels are not tracked systematically, leading to unnoticed shortages or waste.
- Debt to suppliers ("utang ke supplier") is tracked informally and easy to lose track of.
- Non-cash payment methods (QRIS, card, transfer) settle into the bank account with a delay and sometimes a deduction (admin fee), making it hard to confirm that what the POS says was sold matches what actually landed in the bank.
- Producing a profit & loss report, or knowing the top-selling products, currently requires manual work at the end of each period.
- All branches deposit into one central bank account, and cash originating from different branches is sometimes mixed or imprecisely recorded — making it hard to attribute a given deposit or settlement back to the branch that actually generated it.

## 3. Goals

- Give the business owner a single system to record sales, expenses, and raw material purchases.
- Automatically calculate HPP (cost of goods sold) per product from a recipe (bill of materials), and snapshot it at the time of sale for accurate historical reporting.
- Automatically track raw material inventory (opening stock, stock in, stock out, closing stock, stock status) without manual recalculation.
- Track outstanding debt to suppliers separately from immediate cash purchases.
- Automatically reconcile non-cash sales against actual bank settlements, reusing Kasync's matching/allocation engine.
- Attribute cash landing in the shared central account back to the branch(es) that generated it, using the same split-allocation model Kasync uses for multi-purpose bank transfers — directly addressing the cross-branch mixing problem described above.
- Produce automatic reports: profit & loss, sales-per-product profit share, income by payment method, top 10 best-selling products, daily income, and supporting charts.
- Support a multi-branch business from day one, with the underlying schema flexible enough to support either centralized or per-branch stock/cash/pricing (final policy to be confirmed with the business owner — see Section 8).

### Non-goals (v1)

- Multi-tenant SaaS (selling OhMyPos to other businesses) — schema should not actively block this later, but no tenant-isolation work is done in v1.
- Native mobile app — web-based responsive UI only for v1.
- Employee shift/payroll management.
- Customer loyalty / CRM features.
- Automated purchase ordering / supplier catalog integration.

## 4. Target Users

- **Primary:** The business owner — monitors dashboards, reports, and reconciliation across all branches.
- **Secondary:** Cashiers/staff per branch — record sales and raw material purchases at their branch, with restricted access to reports and other branches' data.

## 5. Scope — Functional Requirements

Requirements are grouped by the five dashboards as specified by the business owner.

### 5.1 Dashboard 1 — Master Data

- Manage products ("menu"): name, selling price, and an automatically computed HPP (from recipe; see 5.2).
- Manage raw materials: name, unit of measure, current unit cost.
- Manage recipes (bill of materials): which raw materials and quantities compose each product.
- Manage expense categories ("Pengeluaran").
- Manage opening cash ("Kas Awal") per account/branch (see Section 8 for branch policy).
- Manage payment methods (cash, bank transfer, QRIS, card, e-wallet), mapped to Kasync's `Account` model.

### 5.2 Dashboard 2.1 — Sales Records

- Record a sale: one or more products, quantity, unit selling price (defaults to the product's master price, but can be manually overridden for specific cases — e.g. discounts or negotiated prices).
- HPP per line item is snapshotted at the time of sale (computed from the recipe and raw material costs at that moment), not recalculated later.
- Total price per sale is calculated automatically from line items.
- Each sale is tied to a branch, a payment method, and a timestamp.
- On sale creation: raw material stock is automatically decremented per the recipe, and a corresponding income `LedgerEntry` is created — both within the same transaction as the sale itself.

### 5.3 Dashboard 2.2 — Expenses & Raw Material Purchases

- Record general business expenses (rent, utilities, etc.), categorized, tied to a branch — creates an expense `LedgerEntry` immediately.
- Record raw material purchases from a supplier: quantity, unit cost, total amount, and payment status (paid now vs. payable/utang).
  - If paid immediately: creates an expense `LedgerEntry` and increments raw material stock.
  - If unpaid (utang): increments raw material stock immediately, but the expense `LedgerEntry` is only created when the debt is later settled — so cash reports are not distorted by money that hasn't actually left the account yet.
- Maintain a running payable balance per supplier, with a way to record partial or full settlement.

### 5.4 Dashboard 3 — Automatic Reports

All reports below are computed, not manually entered, and support filtering by date range and (where applicable) branch:

- Profit & loss report (income − COGS − expenses).
- Sales-per-product profit report (revenue and margin contribution per product).
- Total income broken down by payment method.
- Top 10 best-selling products.
- Total daily income.
- Supporting charts for the above (trend lines, bar charts).

### 5.5 Dashboard 4 — Opening Stock

- At the start of each month, record the opening stock quantity (and unit price, if no purchase has been made yet that month) for each raw material.
- This opening stock automatically feeds into the Inventory Summary (5.6) as the starting balance for that month.

### 5.6 Dashboard 5 — Inventory Summary

- For each raw material (and period), automatically compute: opening stock, stock in (from purchases), stock out (from sales, via recipe consumption), and closing stock.
- Automatically compute a stock status (e.g. OK / low stock / out of stock) based on closing stock versus a configurable threshold.

### 5.7 Reconciliation (carried over from Kasync)

- Import bank statement CSV (reusing Kasync's `BankParser` strategy pattern).
- Automatically match bank transactions against the `LedgerEntry` records generated by sales (primarily non-cash payment methods) and manually-entered expenses.
- Support split allocation where one bank transaction covers multiple ledger entries (or vice versa), same invariant as Kasync: `sum(Allocation.amountPortion) <= BankTransaction.amount`.

## 6. Non-Functional Requirements (inherited from Kasync's engineering standards)

- All monetary values use `Decimal` arithmetic — never floating point.
- Multi-step operations that touch financial and inventory state (e.g. creating a sale) execute inside a single database transaction — no partial writes.
- Modular monolith architecture, single deployable app, single PostgreSQL database (see System Design for rationale).
- Auth: reuse Kasync's dual-token JWT (HttpOnly cookies) pattern, extended with per-branch access scoping for cashier roles.
- API versioned under `/api/v1/`.
- Structured logging with correlation IDs; Prometheus metrics; health checks — same observability baseline as Kasync.

## 7. Dependencies / Ported from Kasync

The following modules are ported (adapted, not called via API — see integration decision) from Kasync into OhMyPos as a starting point: `Account`, `Category`, `Branch`, `LedgerEntry`, `BankTransaction`, `Allocation`, `MatchingEngine`, `Auth`, `Users`. Kasync itself remains a standalone, independently deployed project.

## 8. Confirmed Branch Policy

Confirmed with the business owner:

1. **Raw material stock**: centralized at a central kitchen. All branches draw from the same pool — there is one stock balance per raw material, not one per branch. Individual sales still record which branch consumed the stock (for reporting), but do not create a separate per-branch stock balance.
2. **Cash/account**: centralized — all branches deposit into one shared central account. This is also the source of the cross-branch mixing problem in Section 2: the system must still record which branch generated each `LedgerEntry`, and use split allocation to attribute shared deposits back to originating branches, even though the underlying `Account` itself is not split per branch.
3. **Menu & pricing**: identical across all branches — no per-branch price override needed for v1.
4. **Supplier purchases**: mixed. Raw materials and packaging are always purchased centrally. Some incidental items (gas, refill water) are purchased independently per branch. The schema must support a purchase being either central (no branch owner) or branch-specific.

Net effect on the data model (detailed in System Design / ERD): `branchId` is still recorded on transactional records (`Sale`, `LedgerEntry`, `SupplierPurchase`) for attribution and reporting, but stock balances and the cash account itself remain single, shared pools rather than being partitioned per branch. This is simpler than the general per-branch case originally hedged for, and removes the need for per-branch `Account` or per-branch stock tables in v1.

## 9. Success Criteria (v1)

- Business owner can fully replace their manual spreadsheet workflow with OhMyPos for sales, expenses, and raw material tracking.
- Profit & loss, top-10-products, and inventory summary reports are accurate and require no manual reconciliation by the owner.
- At least one full monthly cycle (opening stock → sales → purchases → closing stock) runs end-to-end without manual data correction.
- Non-cash sales can be reconciled against a real bank statement import with matching accuracy comparable to Kasync's existing matching engine performance.

## 10. Out of Scope / Deferred

- Multi-tenant SaaS packaging.
- Native mobile apps.
- Employee payroll/shift management.
- Customer-facing loyalty/CRM.
- Automated supplier ordering.
- PDF bank statement parsing (deferred in Kasync itself; same deferral applies here).
