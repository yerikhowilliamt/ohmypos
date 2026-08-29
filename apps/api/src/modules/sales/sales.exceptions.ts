/**
 * OhMyPos — Sales domain exceptions (Playbook §6, plan §10.5).
 *
 * - SaleProductNotFoundException (404) — an id in the cart does not exist.
 * - InactiveProductException (409) — the product exists but is not sellable
 *   right now; a state conflict, same reasoning as PayableAlreadySettledException.
 * - RecipeIncompleteException (409) — Playbook §6 names this exception
 *   explicitly: "a product has no recipe defined, so HPP can't be computed".
 *   `calculateHpp([])` returns `null` by design (ADR-013); selling at
 *   `hppAtSale = 0` would silently report 100% margin forever.
 * - CentralBranchNotSellableException (400) — the payload names something that
 *   may never be named there, mirroring CentralBranchNotAssignableException.
 *
 * `this.name` is set on each, matching every other `*.exceptions.ts` in the repo.
 */
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

/**
 * ADR-014/ADR-015: the system location is a ledger-attribution row, not a
 * till — there is no such thing as a central sale (ADR-004). A sale attributed
 * to it would appear in branch reports as an outlet that never sold anything.
 */
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

/**
 * DEBT-009 remediation: a KASIR could previously submit any `unitPrice` with
 * no ceiling and no approval — a live path to move money out of the till
 * without the sale looking anomalous. KASIR no longer has this ability at
 * all; only ADMIN/OWNER may charge a price that differs from
 * Product.sellPrice (Playbook §8, RoleGuard is the authoritative check —
 * this exception is what a KASIR's own attempt surfaces as).
 */
export class PriceOverrideNotAllowedException extends BadRequestException {
  constructor(names: string[]) {
    super(
      `Kasir tidak diizinkan mengubah harga jual: ${names.join(', ')}. Hubungi Admin/Owner untuk memberikan harga khusus.`,
    );
    this.name = 'PriceOverrideNotAllowedException';
  }
}

/** DEBT-010 — a sale can only be voided once; the second attempt (including a
 * race against the first) is rejected, never silently accepted. */
export class SaleAlreadyVoidedException extends BadRequestException {
  constructor() {
    super('Transaksi ini sudah dibatalkan sebelumnya.');
    this.name = 'SaleAlreadyVoidedException';
  }
}

/** DEBT-010 — the minimal interim void guard is time-boxed, not open-ended
 * (plan §2): a sale older than the window needs a real refund workflow, not
 * this stop-gap. */
export class SaleVoidWindowExpiredException extends BadRequestException {
  constructor(limitMinutes: number) {
    super(
      `Transaksi tidak dapat dibatalkan — batas waktu pembatalan (${limitMinutes} menit setelah transaksi) telah lewat.`,
    );
    this.name = 'SaleVoidWindowExpiredException';
  }
}
