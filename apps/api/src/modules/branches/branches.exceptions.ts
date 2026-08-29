import { ConflictException } from '@nestjs/common';

/**
 * The ADR-014 ledger-attribution row. Since the lookup moved to `isSystem`,
 * renaming it no longer breaks anything — but there is no UI for it either,
 * and letting it be dressed up as a store is the exact confusion this guard
 * exists to prevent. Deleting it still breaks every central purchase.
 */
export class SystemBranchProtectedException extends ConflictException {
  constructor() {
    super(
      'Lokasi sistem "Umum" tidak bisa diubah nama atau dihapus. Lokasi ini dipakai untuk mencatat transaksi yang tidak terikat satu cabang.',
    );
    this.name = 'SystemBranchProtectedException';
  }
}

export class MainStoreProtectedException extends ConflictException {
  constructor(name: string) {
    super(
      `"${name}" adalah Toko Utama, jadi tidak bisa dihapus selama masih ada toko lain. Jadikan toko lain sebagai Toko Utama terlebih dahulu.`,
    );
    this.name = 'MainStoreProtectedException';
  }
}
