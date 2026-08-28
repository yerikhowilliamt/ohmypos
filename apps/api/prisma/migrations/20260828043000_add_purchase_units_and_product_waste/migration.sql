-- ADR-024 — purchase/stock unit split, product waste allowance, and per-unit
-- cost precision. Every step below is ADDITIVE or value-preserving: after this
-- migration every pre-existing row still means exactly what it meant before.
--
-- Hand-authored rather than fully generated: `prisma migrate dev` emits the
-- ALTERs but not the two backfills, and the NOT NULL promotion has to happen in
-- the same transaction as the backfill or a concurrent INSERT during deploy
-- fails against a column that is briefly NOT NULL with no default.

-- 1. RawMaterial — purchase unit + conversion factor.
--    Backfilled to "bought in the stock unit, 1:1", which is exactly what every
--    existing material meant when there was only one `unit` column.
ALTER TABLE "raw_materials" ADD COLUMN "purchase_unit" TEXT;
ALTER TABLE "raw_materials" ADD COLUMN "conversion_factor" DECIMAL(18,4) NOT NULL DEFAULT 1;

UPDATE "raw_materials" SET "purchase_unit" = "unit" WHERE "purchase_unit" IS NULL;

ALTER TABLE "raw_materials" ALTER COLUMN "purchase_unit" SET NOT NULL;

-- 2. SupplierPurchaseItem — snapshot of what was bought, beside what stock got.
--    `quantity` / `unitCost` keep their meaning (normalized stock figures), so
--    purchase_quantity backfills from quantity and the factor from 1.
ALTER TABLE "supplier_purchase_items" ADD COLUMN "purchase_quantity" DECIMAL(18,4);
ALTER TABLE "supplier_purchase_items" ADD COLUMN "purchase_unit" TEXT;
ALTER TABLE "supplier_purchase_items" ADD COLUMN "conversion_factor" DECIMAL(18,4) NOT NULL DEFAULT 1;

UPDATE "supplier_purchase_items" spi
   SET "purchase_quantity" = spi."quantity",
       "purchase_unit"     = rm."unit"
  FROM "raw_materials" rm
 WHERE rm."id" = spi."raw_material_id";

ALTER TABLE "supplier_purchase_items" ALTER COLUMN "purchase_quantity" SET NOT NULL;
ALTER TABLE "supplier_purchase_items" ALTER COLUMN "purchase_unit" SET NOT NULL;

-- 3. Product waste allowance. DEFAULT 0 keeps every existing product's HPP
--    byte-identical: hpp × (1 + 0/100) is hpp.
ALTER TABLE "products" ADD COLUMN "waste_percent" DECIMAL(5,2) NOT NULL DEFAULT 0;

-- 4. Per-unit COST precision (ADR-024). A unit cost is a rate, not an amount:
--    Rp10.000 over 3.000 gram is 3,333333/gram, and storing that at 2dp
--    understates HPP on every gram/ml material. Widening a numeric scale in
--    Postgres is value-preserving — 4500.00 becomes 4500.000000, not a new
--    number. Amounts that reach the ledger (line_total, total_amount,
--    sell_price, hpp_at_sale, LedgerEntry.amount) deliberately stay DECIMAL(18,2).
ALTER TABLE "raw_materials"           ALTER COLUMN "unit_cost"             TYPE DECIMAL(18,6);
ALTER TABLE "supplier_purchase_items" ALTER COLUMN "unit_cost"             TYPE DECIMAL(18,6);
ALTER TABLE "stock_movements"         ALTER COLUMN "unit_cost_at_movement" TYPE DECIMAL(18,6);
ALTER TABLE "opening_stocks"          ALTER COLUMN "unit_price"            TYPE DECIMAL(18,6);
