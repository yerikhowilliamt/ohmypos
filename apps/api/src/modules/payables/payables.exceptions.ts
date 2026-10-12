import { BadRequestException, ConflictException } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client';

export class PayableAlreadySettledException extends ConflictException {
  constructor() {
    super('Utang ini sudah lunas, tidak ada sisa yang perlu dibayar.');
    this.name = 'PayableAlreadySettledException';
  }
}

export class SettlementExceedsPayableException extends BadRequestException {
  constructor(amount: Prisma.Decimal, remainingBalance: Prisma.Decimal) {
    super(
      `Jumlah bayar ${amount.toFixed(2)} melebihi sisa utang ${remainingBalance.toFixed(2)}. Isi jumlah yang sama atau lebih kecil dari sisa utang.`,
    );
    this.name = 'SettlementExceedsPayableException';
  }
}
