import { BadRequestException } from '@nestjs/common';

export class UnknownRawMaterialException extends BadRequestException {
  constructor(missingIds: string[]) {
    super(
      `Bahan baku berikut tidak ditemukan: ${missingIds.join(', ')}. Muat ulang halaman.`,
    );
    this.name = 'UnknownRawMaterialException';
  }
}
