/**
 * OhMyPos — domain exceptions for the RawMaterials module (Playbook §6, ERD §3).
 */
import { BadRequestException, ConflictException } from '@nestjs/common';

export class RawMaterialNameTakenException extends ConflictException {
  constructor(name: string) {
    super(`Bahan baku "${name}" sudah ada. Pakai nama lain.`);
    this.name = 'RawMaterialNameTakenException';
  }
}

export class RawMaterialInUseException extends ConflictException {
  constructor() {
    super(
      'Bahan baku ini tidak bisa dihapus karena masih dipakai di resep produk. Keluarkan dulu dari resep yang memakainya.',
    );
    this.name = 'RawMaterialInUseException';
  }
}

/**
 * ADR-024. The STOCK/RECIPE base unit is immutable once the material has any
 * stock history.
 *
 * Changing it would silently re-scale `currentStock`, every
 * `RecipeItem.quantityUsed`, every `OpeningStock.quantity`, and every row of the
 * append-only `StockMovement` log — i.e. it rewrites history, which is exactly
 * what the purchase-unit/conversion split exists to avoid. A packaging change
 * is a `purchaseUnit`/`conversionFactor` edit, and those stay freely editable.
 */
export class RawMaterialUnitLockedException extends BadRequestException {
  constructor(unit: string) {
    super(
      `Satuan stok "${unit}" tidak bisa diubah karena bahan ini sudah punya riwayat pergerakan stok. ` +
        `Jika kemasan pemasok berubah, ubah Satuan Beli dan Isi per Satuan Beli. ` +
        `Jika satuan dasarnya memang salah, buat bahan baku baru dengan satuan yang benar.`,
    );
    this.name = 'RawMaterialUnitLockedException';
  }
}
