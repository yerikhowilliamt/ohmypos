import { ConflictException } from '@nestjs/common';

export class CategoryNameTakenException extends ConflictException {
  constructor(name: string) {
    super(`Kategori "${name}" sudah ada. Pakai nama lain.`);
    this.name = 'CategoryNameTakenException';
  }
}

export class SystemCategoryProtectedException extends ConflictException {
  constructor(name: string) {
    super(
      `Kategori sistem "${name}" tidak bisa diubah atau dihapus, karena dipakai aplikasi untuk mencatat penjualan dan pembelian secara otomatis.`,
    );
    this.name = 'SystemCategoryProtectedException';
  }
}

export class CategoryInUseException extends ConflictException {
  constructor() {
    super(
      'Kategori ini tidak bisa dihapus karena masih dipakai oleh transaksi yang sudah tercatat. Anda masih bisa mengubah namanya.',
    );
    this.name = 'CategoryInUseException';
  }
}
