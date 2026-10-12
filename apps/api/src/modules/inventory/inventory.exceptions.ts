import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client';

export class OpeningStockRawMaterialNotFoundException extends NotFoundException {
  constructor(missingIds: string[]) {
    super(
      `Bahan baku berikut tidak ditemukan: ${missingIds.join(', ')}. Muat ulang halaman.`,
    );
    this.name = 'OpeningStockRawMaterialNotFoundException';
  }
}

export class OpeningStockUnitPriceRequiredException extends BadRequestException {
  constructor(names: string[]) {
    super(
      `Isi harga satuan untuk bahan berikut, karena belum ada pembelian tercatat pada periode ini: ${names.join(', ')}.`,
    );
    this.name = 'OpeningStockUnitPriceRequiredException';
  }
}

export class OpeningStockUnitPriceNotAllowedException extends BadRequestException {
  constructor(names: string[]) {
    super(
      `Harga satuan tidak perlu diisi untuk bahan yang sudah dibeli pada periode ini: ${names.join(', ')}. Harga diambil dari pembelian tersebut.`,
    );
    this.name = 'OpeningStockUnitPriceNotAllowedException';
  }
}

export class OpeningStockWouldGoNegativeException extends ConflictException {
  constructor(
    offenders: {
      name: string;
      delta: Prisma.Decimal;
      resultingStock: Prisma.Decimal;
    }[],
  ) {
    super(
      `Stok awal ini akan membuat stok menjadi minus: ${offenders
        .map(
          (offender) =>
            `${offender.name} (koreksi ${offender.delta.toFixed(4)}, hasil ${offender.resultingStock.toFixed(4)})`,
        )
        .join('; ')}`,
    );
    this.name = 'OpeningStockWouldGoNegativeException';
  }
}

export class FuturePeriodNotAllowedException extends BadRequestException {
  constructor(month: string) {
    super(
      `Periode ${month} belum dimulai. Stok awal dicatat di awal bulan berjalan, bukan untuk bulan yang akan datang.`,
    );
    this.name = 'FuturePeriodNotAllowedException';
  }
}

export class InvalidPeriodException extends BadRequestException {
  constructor(period: string) {
    super(
      `Periode "${period}" tidak dikenali. Gunakan format bulan YYYY-MM, misalnya 2026-08.`,
    );
    this.name = 'InvalidPeriodException';
  }
}
