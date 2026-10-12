import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { requireTenantId } from '../../common/prisma/tenant-context';
import {
  resolveLedgerBranchId,
  resolvePurchaseCategoryId,
} from '../../common/system-refs';
import { StockMovementsService } from '../stock-movements/stock-movements.service';
import { LedgerEntriesService } from '../ledger-entries/ledger-entries.service';
import {
  CreateSupplierPurchaseDto,
  SupplierPurchaseQueryDto,
} from './supplier-purchases.dto';
import {
  BackdatedPurchaseException,
  CentralBranchNotAssignableException,
  PurchaseItemMaterialNotFoundException,
} from './supplier-purchases.exceptions';
import {
  calculatePurchaseTotal,
  normalizePurchaseLine,
} from './purchase-totals';
import {
  SupplierPurchaseWithRelations,
  toSupplierPurchaseResponse,
} from './supplier-purchases.mapper';
import { isIdempotencyReplay } from '../../common/idempotency';

/**
 * Records supplier purchases. Stock always moves; money moves only when
 * `PAID` (ADR-006). See `README.md` for the step order and cost write-back.
 */
@Injectable()
export class SupplierPurchasesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly stockMovementsService: StockMovementsService,
    private readonly ledgerEntriesService: LedgerEntriesService,
  ) {}

  /** Creates a purchase, or returns the original one on an idempotency-key replay. */
  async create(dto: CreateSupplierPurchaseDto, role?: string) {
    try {
      return await this.prisma.$transaction(async (tx) => {
        // Replay pre-check; a concurrent replay is caught by the unique index below.
        if (dto.idempotencyKey) {
          const replay = await tx.supplierPurchase.findUnique({
            where: {
              tenantId_idempotencyKey: {
                tenantId: requireTenantId(),
                idempotencyKey: dto.idempotencyKey,
              },
            },
            include: {
              supplier: true,
              items: {
                include: {
                  rawMaterial: true,
                },
              },
              payable: true,
            },
          });
          if (replay) {
            return toSupplierPurchaseResponse(replay);
          }
        }

        const BACKDATE_LIMIT_DAYS = 3;
        if (role === 'KASIR') {
          const earliest = new Date();
          earliest.setUTCDate(earliest.getUTCDate() - BACKDATE_LIMIT_DAYS);
          earliest.setUTCHours(0, 0, 0, 0);
          if (new Date(dto.purchaseDate) < earliest) {
            throw new BackdatedPurchaseException(BACKDATE_LIMIT_DAYS);
          }
        }

        // 1. Supplier.
        const supplier = await tx.supplier.findUnique({
          where: { id: dto.supplierId },
        });
        if (!supplier) {
          throw new NotFoundException(
            'Pemasok tidak ditemukan. Mungkin sudah dihapus — muat ulang halaman.',
          );
        }

        // 2. Branch (null = central purchase).
        if (dto.branchId !== null) {
          const branch = await tx.branch.findUnique({
            where: { id: dto.branchId },
          });
          if (!branch) {
            throw new NotFoundException(
              'Cabang tidak ditemukan. Mungkin sudah dihapus — muat ulang halaman.',
            );
          }
          if (branch.isSystem) {
            throw new CentralBranchNotAssignableException();
          }
        }

        // 3. Account, when paid up front.
        if (dto.paymentStatus === 'PAID' && dto.accountId) {
          const account = await tx.account.findUnique({
            where: { id: dto.accountId },
          });
          if (!account) {
            throw new NotFoundException(
              'Akun pembayaran tidak ditemukan. Mungkin sudah dihapus — muat ulang halaman.',
            );
          }
        }

        // 4. Raw materials.
        const rawMaterialIds = dto.items.map((i) => i.rawMaterialId);
        const materials = await tx.rawMaterial.findMany({
          where: { id: { in: rawMaterialIds } },
        });
        if (materials.length !== rawMaterialIds.length) {
          const foundIds = new Set(materials.map((m) => m.id));
          const missingIds = rawMaterialIds.filter((id) => !foundIds.has(id));
          throw new PurchaseItemMaterialNotFoundException(missingIds);
        }

        // 5. Convert each line to stock units (ADR-024).
        const materialById = new Map(materials.map((m) => [m.id, m]));

        const lines = dto.items.map((item) => {
          const material = materialById.get(item.rawMaterialId)!;
          const normalized = normalizePurchaseLine({
            purchaseQuantity: new Prisma.Decimal(item.purchaseQuantity),
            conversionFactor: material.conversionFactor,
            lineTotal: new Prisma.Decimal(item.lineTotal),
          });
          return {
            rawMaterialId: item.rawMaterialId,
            purchaseUnit: material.purchaseUnit,
            ...normalized,
          };
        });
        const totalAmount = calculatePurchaseTotal(
          lines.map((l) => l.lineTotal),
        );

        // 6. Purchase.
        const purchase = await tx.supplierPurchase.create({
          data: {
            supplierId: dto.supplierId,
            branchId: dto.branchId,
            purchaseDate: new Date(dto.purchaseDate),
            paymentStatus: dto.paymentStatus,
            totalAmount,
            note: dto.note ?? null,
            idempotencyKey: dto.idempotencyKey ?? null,
            ledgerEntryId: null,
          },
        });

        // 7. Stock in, always. Must run BEFORE step 8: inserting lines first takes
        //    FK share locks that deadlock on upgrade to FOR UPDATE (see README).
        await this.stockMovementsService.applyInbound(tx, {
          branchId: purchase.branchId,
          referenceType: 'PURCHASE',
          referenceId: purchase.id,
          movementDate: purchase.purchaseDate,
          lines: lines.map((l) => ({
            rawMaterialId: l.rawMaterialId,
            quantity: l.quantity,
            unitCost: l.unitCost,
          })),
        });

        // 8. Line items.
        await tx.supplierPurchaseItem.createMany({
          data: lines.map((l) => ({
            supplierPurchaseId: purchase.id,
            rawMaterialId: l.rawMaterialId,
            purchaseQuantity: l.purchaseQuantity,
            purchaseUnit: l.purchaseUnit,
            conversionFactor: l.conversionFactor,
            quantity: l.quantity,
            unitCost: l.unitCost,
            lineTotal: l.lineTotal,
          })),
        });

        // 8b. Latest-cost write-back (ADR-024, DEBT-006): recomputed from table
        //     state by purchaseDate, so a backdated purchase never wins.
        const touchedMaterialIds = [
          ...new Set(lines.map((l) => l.rawMaterialId)),
        ].sort((a, b) => a.localeCompare(b));

        for (const rawMaterialId of touchedMaterialIds) {
          const latest = await tx.$queryRaw<{ unit_cost: Prisma.Decimal }[]>`
            SELECT spi.unit_cost
              FROM supplier_purchase_items spi
              JOIN supplier_purchases sp ON sp.id = spi.supplier_purchase_id
             WHERE spi.tenant_id = ${requireTenantId()}
               AND spi.raw_material_id = ${rawMaterialId}
             ORDER BY sp.purchase_date DESC, sp.created_at DESC, sp.id DESC
             LIMIT 1
          `;

          if (latest.length > 0) {
            await tx.rawMaterial.update({
              where: { id: rawMaterialId },
              data: { unitCost: latest[0].unit_cost },
            });
          }
        }

        // 9. ADR-006: PAID writes a LedgerEntry; UNPAID writes a Payable. Never both.
        if (dto.paymentStatus === 'PAID') {
          const branchIdForLedger = await resolveLedgerBranchId(
            tx,
            purchase.branchId,
          );
          const categoryId = await resolvePurchaseCategoryId(tx);

          const entry = await this.ledgerEntriesService.createSystemEntry(tx, {
            accountId: dto.accountId!,
            categoryId,
            branchId: branchIdForLedger,
            entryDate: purchase.purchaseDate,
            amount: totalAmount,
            type: 'OUTFLOW',
            sourceType: 'PURCHASE',
            sourceId: purchase.id,
            note: dto.note ?? null,
          });

          await tx.supplierPurchase.update({
            where: { id: purchase.id },
            data: { ledgerEntryId: entry.id },
          });
        } else {
          await tx.payable.create({
            data: {
              supplierPurchaseId: purchase.id,
              supplierId: purchase.supplierId,
              originalAmount: totalAmount,
              remainingBalance: totalAmount,
              status: 'OPEN',
            },
          });
        }

        const created = (await tx.supplierPurchase.findUnique({
          where: { id: purchase.id },
          include: {
            supplier: true,
            items: {
              include: {
                rawMaterial: true,
              },
            },
            payable: true,
          },
        })) as SupplierPurchaseWithRelations;

        return toSupplierPurchaseResponse(created);
      });
    } catch (error) {
      if (
        dto.idempotencyKey &&
        isIdempotencyReplay(
          error,
          'supplier_purchases_tenant_id_idempotency_key_key',
        )
      ) {
        const original = await this.prisma.supplierPurchase.findUnique({
          where: {
            tenantId_idempotencyKey: {
              tenantId: requireTenantId(),
              idempotencyKey: dto.idempotencyKey,
            },
          },
          include: {
            supplier: true,
            items: {
              include: {
                rawMaterial: true,
              },
            },
            payable: true,
          },
        });
        if (original) {
          return toSupplierPurchaseResponse(original);
        }
      }
      throw error;
    }
  }

  async findAll(query: SupplierPurchaseQueryDto) {
    const {
      page = 1,
      limit = 50,
      sortBy,
      sortOrder = 'desc',
      supplierId,
      branchId,
      paymentStatus,
      startDate,
      endDate,
    } = query;
    const skip = (page - 1) * limit;

    const where: Prisma.SupplierPurchaseWhereInput = {
      ...(supplierId && { supplierId }),
      ...(branchId !== undefined && { branchId }),
      ...(paymentStatus && { paymentStatus }),
      ...((startDate || endDate) && {
        purchaseDate: {
          ...(startDate && { gte: new Date(startDate) }),
          ...(endDate && { lte: new Date(endDate) }),
        },
      }),
    };

    const [data, total] = await Promise.all([
      this.prisma.supplierPurchase.findMany({
        where,
        skip,
        take: limit,
        orderBy: { [sortBy ?? 'purchaseDate']: sortOrder },
        include: {
          supplier: true,
          items: {
            include: {
              rawMaterial: true,
            },
          },
          payable: true,
        },
      }),
      this.prisma.supplierPurchase.count({ where }),
    ]);

    return {
      data: (data as SupplierPurchaseWithRelations[]).map((p) =>
        toSupplierPurchaseResponse(p),
      ),
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit) || 1,
      },
    };
  }

  async findOne(id: string) {
    const purchase = await this.prisma.supplierPurchase.findUnique({
      where: { id },
      include: {
        supplier: true,
        items: {
          include: {
            rawMaterial: true,
          },
        },
        payable: true,
      },
    });

    if (!purchase) {
      throw new NotFoundException(
        'Pembelian tidak ditemukan. Mungkin sudah dihapus — muat ulang halaman.',
      );
    }

    return toSupplierPurchaseResponse(purchase);
  }
}
