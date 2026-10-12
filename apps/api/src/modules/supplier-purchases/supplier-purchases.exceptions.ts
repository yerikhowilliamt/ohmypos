import { BadRequestException, NotFoundException } from '@nestjs/common';
import { CENTRAL_BRANCH_NAME } from '../../common/system-refs';

export class PurchaseItemMaterialNotFoundException extends NotFoundException {
  constructor(missingIds: string[]) {
    super(
      `Bahan baku berikut tidak ditemukan: ${missingIds.join(', ')}. Muat ulang halaman.`,
    );
    this.name = 'PurchaseItemMaterialNotFoundException';
  }
}

/** A purchase named the system branch; central purchases use `branchId: null` (ADR-014). */
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

/** The converted stock quantity is zero (unreachable through the API). */
export class ZeroNormalizedQuantityException extends BadRequestException {
  constructor() {
    super(
      'Kuantitas stok hasil konversi bernilai nol — periksa jumlah beli dan isi per satuan beli bahan baku ini.',
    );
    this.name = 'ZeroNormalizedQuantityException';
  }
}
