import { ConflictException } from '@nestjs/common';

export class SupplierNameTakenException extends ConflictException {
  constructor(name: string) {
    super(`Pemasok "${name}" sudah ada. Pakai nama lain.`);
    this.name = 'SupplierNameTakenException';
  }
}

export class SupplierInUseException extends ConflictException {
  constructor() {
    super(
      'Pemasok ini tidak bisa dihapus karena masih terkait dengan pembelian atau utang yang tercatat.',
    );
    this.name = 'SupplierInUseException';
  }
}
