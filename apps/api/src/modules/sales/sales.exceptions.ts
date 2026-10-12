import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { CENTRAL_BRANCH_NAME } from '../../common/system-refs';

export class SaleProductNotFoundException extends NotFoundException {
  constructor(missingIds: string[]) {
    super(
      `Produk berikut tidak ditemukan: ${missingIds.join(', ')}. Muat ulang halaman.`,
    );
    this.name = 'SaleProductNotFoundException';
  }
}

export class InactiveProductException extends ConflictException {
  constructor(names: string[]) {
    super(
      `Produk berikut sudah dinonaktifkan sehingga tidak bisa dijual: ${names.join(', ')}. Keluarkan dari pesanan, atau minta Owner mengaktifkannya kembali.`,
    );
    this.name = 'InactiveProductException';
  }
}

export class RecipeIncompleteException extends ConflictException {
  constructor(names: string[]) {
    super(
      `Produk berikut belum punya resep sehingga modalnya tidak bisa dihitung: ${names.join(', ')}. Minta Admin atau Owner melengkapi resepnya di Data Master.`,
    );
    this.name = 'RecipeIncompleteException';
  }
}

/** The system branch is a ledger attribution, not a till; there is no central sale. */
export class CentralBranchNotSellableException extends BadRequestException {
  constructor() {
    super(
      `Penjualan tidak bisa dicatat di lokasi "${CENTRAL_BRANCH_NAME}", karena itu bukan toko fisik. Pilih cabang tempat transaksi benar-benar terjadi.`,
    );
    this.name = 'CentralBranchNotSellableException';
  }
}

export class BackdatedSaleException extends BadRequestException {
  constructor(limitDays: number) {
    super(
      `Tanggal transaksi melampaui batas input susulan (maksimal ${limitDays} hari yang lalu untuk kasir). Hubungi Owner untuk transaksi periode lampau.`,
    );
    this.name = 'BackdatedSaleException';
  }
}

/** A KASIR tried to charge a price other than `Product.sellPrice` (DEBT-009). */
export class PriceOverrideNotAllowedException extends BadRequestException {
  constructor(names: string[]) {
    super(
      `Kasir tidak diizinkan mengubah harga jual: ${names.join(', ')}. Hubungi Admin/Owner untuk memberikan harga khusus.`,
    );
    this.name = 'PriceOverrideNotAllowedException';
  }
}

/** A sale can be voided only once, including under a race. */
export class SaleAlreadyVoidedException extends BadRequestException {
  constructor() {
    super('Transaksi ini sudah dibatalkan sebelumnya.');
    this.name = 'SaleAlreadyVoidedException';
  }
}

/** The void window has passed. */
export class SaleVoidWindowExpiredException extends BadRequestException {
  constructor(limitMinutes: number) {
    super(
      `Transaksi tidak dapat dibatalkan — batas waktu pembatalan (${limitMinutes} menit setelah transaksi) telah lewat.`,
    );
    this.name = 'SaleVoidWindowExpiredException';
  }
}
