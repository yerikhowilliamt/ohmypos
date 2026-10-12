import { ConflictException } from '@nestjs/common';

/** The system branch (ADR-014) cannot be edited or deleted. */
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
