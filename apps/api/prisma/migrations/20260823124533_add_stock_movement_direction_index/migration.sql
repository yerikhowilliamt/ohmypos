-- CreateIndex
CREATE INDEX "stock_movements_raw_material_id_movement_date_direction_idx" ON "stock_movements"("raw_material_id", "movement_date", "direction");
