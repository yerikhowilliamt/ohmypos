# ADR-005: HPP is computed live on `Product`, but snapshotted on `SaleItem`

**Status:** Accepted

**Context:** Dashboard 1 (master data) needs to show each product's current cost of goods sold, which changes whenever a raw material's unit cost changes. Dashboard 3 (P&L reporting) needs historical accuracy — a sale from last month must not silently change its recorded margin because a raw material got more expensive this month.

**Decision:** `Product.hpp` is computed on read from the current `Recipe` and `RawMaterial.unitCost`. `SaleItem.hpp` is computed once, at the moment of sale, and stored — never recalculated afterward.

**Consequences:**

- Historical P&L and per-product profit reports remain accurate regardless of later price changes.
- Requires the `Sale` creation flow to always compute and persist this value explicitly (see System Design 6.1) — a step that must not be "optimized away" later without re-examining this ADR.

**Alternatives considered:**

- _Always compute HPP live, even for historical sales_: rejected — would silently rewrite historical profit figures whenever ingredient prices change, undermining the accuracy goal in PRD Section 9.
