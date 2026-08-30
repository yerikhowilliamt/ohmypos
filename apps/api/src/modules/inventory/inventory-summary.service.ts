/**
 * OhMyPos — Inventory Summary service (PRD §5.6, ADR-004, ADR-008,
 * Phase 6 plan §2.2).
 *
 * Three queries in one read transaction, then all arithmetic in the pure
 * assembler. Computed at query time on every request, with nothing cached and
 * nothing stored (ADR-008) — which is what makes this report exactly consistent
 * with the movement ledger it reads, by construction rather than by discipline.
 */
import { Injectable } from '@nestjs/common';
import type { InventorySummaryResponse } from '@ohmypos/api-contracts';
import { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { assembleInventorySummary } from './inventory-summary.calculator';
import { parsePeriodMonth } from './period';
import { InventorySummaryQueryDto } from './inventory-summary.dto';

/**
 * Batas transaksi read ini, dinyatakan eksplisit karena default Prisma
 * 5000 ms terlalu ketat untuk apa yang dibaca query di dalamnya.
 *
 * Terukur pada 2026-08-30 (395 k sales / 1,8 juta stock_movements): dua
 * `groupBy` di bawah makan ~800 ms saat sepi, dan p95 seluruh endpoint 1143 ms.
 * Di bawah 25-50 klien bersamaan keduanya melewati 5000 ms dan transaksinya
 * kedaluwarsa di tengah jalan — 40 kali HTTP 500 dalam soak 60 detik, dengan
 * pengukuran terlama 6258 ms.
 *
 * 20 detik dipilih bukan karena query ini boleh selama itu, tapi supaya
 * batasnya adalah "sesuatu benar-benar rusak", bukan "hari ini sedang ramai".
 * Kalau batas ini pernah tertabrak, jawabannya adalah mengindeks atau
 * memilih ulang bentuk query — BUKAN menaikkan angka ini lagi.
 *
 * `maxWait` adalah lamanya menunggu koneksi dari pool sebelum menyerah. 5 detik
 * membuat antrean gagal cepat alih-alih menumpuk diam-diam di belakang soak.
 */
const INVENTORY_SUMMARY_TX_OPTIONS = {
  maxWait: 5_000,
  timeout: 20_000,
} as const;

@Injectable()
export class InventorySummaryService {
  constructor(private readonly prisma: PrismaService) {}

  async findByPeriod(
    query: InventorySummaryQueryDto,
  ): Promise<InventorySummaryResponse> {
    const period = parsePeriodMonth(query.period);

    // One transaction so the three result sets describe one instant. Without
    // it, a sale committing between query 2 and query 3 would leave the report
    // internally fine but silently stale in a way no assertion could pin.
    const [materials, priorBuckets, periodBuckets] =
      await this.prisma.$transaction(
        async (tx) =>
          Promise.all([
            // Every material, including ones with no movements at all: a material
            // with zero stock is exactly what Dashboard 5's OUT badge is for.
            tx.rawMaterial.findMany({ orderBy: { name: 'asc' } }),
            tx.stockMovement.groupBy({
              by: ['rawMaterialId', 'direction'],
              where: { movementDate: { lt: period.periodStart } },
              _sum: { quantity: true },
            }),
            tx.stockMovement.groupBy({
              by: ['rawMaterialId', 'direction', 'referenceType'],
              where: {
                movementDate: { gte: period.periodStart, lt: period.periodEnd },
              },
              _sum: { quantity: true },
            }),
          ]),
        INVENTORY_SUMMARY_TX_OPTIONS,
      );

    const rows = assembleInventorySummary(
      materials.map((material) => ({
        id: material.id,
        name: material.name,
        unit: material.unit,
        lowStockThreshold: material.lowStockThreshold,
      })),
      priorBuckets.map((bucket) => ({
        rawMaterialId: bucket.rawMaterialId,
        direction: bucket.direction,
        quantity: bucket._sum?.quantity ?? new Prisma.Decimal(0),
      })),
      periodBuckets.map((bucket) => ({
        rawMaterialId: bucket.rawMaterialId,
        direction: bucket.direction,
        referenceType: bucket.referenceType,
        quantity: bucket._sum?.quantity ?? new Prisma.Decimal(0),
      })),
    );

    return {
      period: {
        month: period.month,
        startDate: period.periodStart.toISOString(),
        endDate: period.periodEnd.toISOString(),
      },
      data: rows.map((row) => ({
        rawMaterialId: row.rawMaterialId,
        name: row.name,
        unit: row.unit,
        openingQuantity: row.opening.toFixed(4),
        inQuantity: row.in.toFixed(4),
        outQuantity: row.out.toFixed(4),
        closingQuantity: row.closing.toFixed(4),
        lowStockThreshold: row.lowStockThreshold.toFixed(4),
        status: row.status,
      })),
    };
  }
}
