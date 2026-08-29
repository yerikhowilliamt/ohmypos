import { BadRequestException, NotFoundException } from '@nestjs/common';
import { CENTRAL_BRANCH_NAME } from '../../common/system-refs';

/**
 * OhMyPos — SupplierPurchases domain exceptions (Playbook §6, plan §9.8).
 *
 * - PurchaseItemMaterialNotFoundException (404)
 * - CentralBranchNotAssignableException (400)
 *
 * `this.name` is set on each, matching `raw-materials.exceptions.ts` and
 * `users.exceptions.ts` — the class name is what identifies the broken rule in
 * a log line, and the inherited default would just say `BadRequestException`.
 */

export class PurchaseItemMaterialNotFoundException extends NotFoundException {
  constructor(missingIds: string[]) {
    super(
      `Bahan baku berikut tidak ditemukan: ${missingIds.join(', ')}. Muat ulang halaman.`,
    );
    this.name = 'PurchaseItemMaterialNotFoundException';
  }
}

/**
 * ADR-014: the system location exists only so a central
 * purchase's generated `LedgerEntry` can satisfy `LedgerEntry.branchId`'s NOT
 * NULL. It is not a sales outlet, and a purchase attributed to it directly
 * would report `isCentral: false` for something that is in fact central —
 * quietly wrong in every branch-grouped report. `branchId: null` stays the one
 * way to record a central purchase.
 */
export class CentralBranchNotAssignableException extends BadRequestException {
  constructor() {
    super(
      `Pembelian tidak bisa dibebankan ke lokasi "${CENTRAL_BRANCH_NAME}" secara langsung. Pilih "Umum" pada Lokasi Pembelian untuk belanja terpusat.`,
    );
    this.name = 'CentralBranchNotAssignableException';
  }
}

export class BackdatedPurchaseException extends BadRequestException {
  constructor(limitDays: number) {
    super(
      `Tanggal transaksi pembelian melampaui batas input susulan (maksimal ${limitDays} hari yang lalu untuk kasir). Hubungi Owner untuk transaksi periode lampau.`,
    );
    this.name = 'BackdatedPurchaseException';
  }
}

/**
 * ADR-024. Unreachable through the API — `purchaseQuantity` and
 * `conversionFactor` are both refused at zero by Zod — but the normalized stock
 * quantity is a divisor, and a divisor that reaches zero must fail loudly
 * rather than write `Infinity` into a Decimal column.
 */
export class ZeroNormalizedQuantityException extends BadRequestException {
  constructor() {
    super(
      'Kuantitas stok hasil konversi bernilai nol — periksa jumlah beli dan isi per satuan beli bahan baku ini.',
    );
    this.name = 'ZeroNormalizedQuantityException';
  }
}
