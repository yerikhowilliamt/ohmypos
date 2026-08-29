/**
 * OhMyPos — domain exceptions for the Products module (Playbook §6, ERD §3).
 */
import { ConflictException } from '@nestjs/common';

export class ProductNameTakenException extends ConflictException {
  constructor(name: string) {
    super(`Produk "${name}" sudah ada. Pakai nama lain.`);
    this.name = 'ProductNameTakenException';
  }
}

/**
 * Phase 5, plan §9.4 decision 8: `SaleItem → Product` is `Restrict`, so once a
 * product has been sold, deleting it hits Postgres FK constraint P2003. Mapped
 * here rather than left as a raw 500 — the predictable Phase 5 counterpart to
 * ERR-004, this time anticipated instead of discovered.
 */
export class ProductInUseException extends ConflictException {
  constructor() {
    super(
      'Produk ini tidak bisa dihapus karena sudah pernah terjual. Nonaktifkan saja, supaya hilang dari layar Penjualan tanpa merusak riwayat transaksi.',
    );
    this.name = 'ProductInUseException';
  }
}
