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
 * The stock/recipe base unit cannot change once the material has stock
 * history; that would rescale every stored quantity (ADR-024). Packaging stays
 * editable.
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
