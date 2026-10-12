import { ConflictException } from '@nestjs/common';

export class ProductNameTakenException extends ConflictException {
  constructor(name: string) {
    super(`Produk "${name}" sudah ada. Pakai nama lain.`);
    this.name = 'ProductNameTakenException';
  }
}

/** The product has been sold (`SaleItem → Product` is Restrict), so it cannot be deleted. */
export class ProductInUseException extends ConflictException {
  constructor() {
    super(
      'Produk ini tidak bisa dihapus karena sudah pernah terjual. Nonaktifkan saja, supaya hilang dari layar Penjualan tanpa merusak riwayat transaksi.',
    );
    this.name = 'ProductInUseException';
  }
}
