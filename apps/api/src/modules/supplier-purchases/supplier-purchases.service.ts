/**
 * OhMyPos — SupplierPurchases service (ERD §3, System Design §6.2, ADR-004, ADR-006, ADR-007).
 *
 * Summary of ADR-006:
 * Stock always moves; money sometimes does. A purchase increments `RawMaterial.currentStock`
 * unconditionally, because the goods have physically arrived. It creates a `LedgerEntry`
 * only if `paymentStatus = PAID` at creation; if unpaid, it creates a `Payable` instead and the
 * `LedgerEntry` is created later, by `PayablesService.settle`, for exactly the amount settled
 * (ADR-006). Getting this backwards makes an expense appear before the money left the account and
 * makes reconciliation match against numbers that never hit the bank.
 */
import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import {
  CENTRAL_BRANCH_NAME,
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
  CentralBranchNotAssignableException,
  PurchaseItemMaterialNotFoundException,
} from './supplier-purchases.exceptions';
import { calculateLineTotal, calculatePurchaseTotal } from './purchase-totals';
import {
  SupplierPurchaseWithRelations,
  toSupplierPurchaseResponse,
} from './supplier-purchases.mapper';

@Injectable()
export class SupplierPurchasesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly stockMovementsService: StockMovementsService,
    private readonly ledgerEntriesService: LedgerEntriesService,
  ) {}

  /**
   * Creates a purchase in a single database transaction (Playbook §7, System Design §6.2).
   * Stock moves unconditionally (ADR-006); money moves iff paymentStatus === 'PAID'.
   */
  async create(dto: CreateSupplierPurchaseDto) {
    return this.prisma.$transaction(async (tx) => {
      // 1. Verify supplier existence
      const supplier = await tx.supplier.findUnique({
        where: { id: dto.supplierId },
      });
      if (!supplier) {
        throw new NotFoundException(
          `Supplier with ID ${dto.supplierId} not found`,
        );
      }

      // 2. Verify branch existence if branch-scoped (null means central purchase)
      if (dto.branchId !== null) {
        const branch = await tx.branch.findUnique({
          where: { id: dto.branchId },
        });
        if (!branch) {
          throw new NotFoundException(
            `Branch with ID ${dto.branchId} not found`,
          );
        }
        // ADR-014: `Pusat (Dapur Sentral)` is a ledger-attribution row, not an
        // outlet. Accepting it here would produce `isCentral: false` on a
        // purchase that is central — so `branchId: null` stays the single way
        // to say "central", exactly as the ADR promises.
        if (branch.name === CENTRAL_BRANCH_NAME) {
          throw new CentralBranchNotAssignableException();
        }
      }

      // 3. Verify account existence if PAID up front
      if (dto.paymentStatus === 'PAID' && dto.accountId) {
        const account = await tx.account.findUnique({
          where: { id: dto.accountId },
        });
        if (!account) {
          throw new NotFoundException(
            `Account with ID ${dto.accountId} not found`,
          );
        }
      }

      // 4. Validate all raw materials exist inside the transaction
      const rawMaterialIds = dto.items.map((i) => i.rawMaterialId);
      const materials = await tx.rawMaterial.findMany({
        where: { id: { in: rawMaterialIds } },
      });
      if (materials.length !== rawMaterialIds.length) {
        const foundIds = new Set(materials.map((m) => m.id));
        const missingIds = rawMaterialIds.filter((id) => !foundIds.has(id));
        throw new PurchaseItemMaterialNotFoundException(missingIds);
      }

      // 5. Compute line totals and purchase total amount (pure calculator, §9.3)
      const lines = dto.items.map((item) => {
        const quantity = new Prisma.Decimal(item.quantity);
        const unitCost = new Prisma.Decimal(item.unitCost);
        const lineTotal = calculateLineTotal({ quantity, unitCost });
        return {
          rawMaterialId: item.rawMaterialId,
          quantity,
          unitCost,
          lineTotal,
        };
      });
      const totalAmount = calculatePurchaseTotal(lines.map((l) => l.lineTotal));

      // 6. Create parent purchase record
      const purchase = await tx.supplierPurchase.create({
        data: {
          supplierId: dto.supplierId,
          branchId: dto.branchId,
          purchaseDate: new Date(dto.purchaseDate),
          paymentStatus: dto.paymentStatus,
          totalAmount,
          note: dto.note ?? null,
          ledgerEntryId: null,
        },
      });

      // 7. Apply inbound stock movements (always, regardless of payment status,
      // ADR-006) — BEFORE creating the line items (step 8), not after.
      //
      // Phase 14 finding (B3, concurrency e2e): `SupplierPurchaseItem.rawMaterialId`
      // has an FK to RawMaterial, and Postgres takes an implicit FOR KEY SHARE
      // lock on the referenced row for every FK-checked INSERT. Writing the line
      // items before `applyInbound`'s explicit `FOR UPDATE` (ADR-016) let two
      // concurrent purchases of the same material each acquire the (mutually
      // compatible) FOR KEY SHARE first, then both block trying to upgrade to
      // FOR UPDATE — a classic lock-upgrade deadlock (Postgres 40P01), even
      // though the ascending-id lock ORDER was never violated. Locking first,
      // exactly as ADR-016 and this file's step comments already claimed, closes
      // it: the FOR UPDATE is acquired before any row anywhere references this
      // material, so there is no weaker lock left to upgrade from under contention.
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

      // 8. Create purchase line item rows
      await tx.supplierPurchaseItem.createMany({
        data: lines.map((l) => ({
          supplierPurchaseId: purchase.id,
          rawMaterialId: l.rawMaterialId,
          quantity: l.quantity,
          unitCost: l.unitCost,
          lineTotal: l.lineTotal,
        })),
      });

      // 9. THE ADR-006 BRANCH — the only `if` on paymentStatus in this repo
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
        // NO Payable is created. Ever. (ERD §6 mutual exclusion.)
      } else {
        // 'UNPAID'
        await tx.payable.create({
          data: {
            supplierPurchaseId: purchase.id,
            supplierId: purchase.supplierId,
            originalAmount: totalAmount,
            remainingBalance: totalAmount,
            status: 'OPEN',
          },
        });
        // NO LedgerEntry. The money has not moved (ADR-006).
      }

      // 10. Reload purchase with relations inside tx and return mapped response
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
  }

  async findAll(query: SupplierPurchaseQueryDto) {
    const {
      page = 1,
      limit = 50,
      sortBy,
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
        orderBy: { [sortBy ?? 'purchaseDate']: 'desc' },
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
      throw new NotFoundException(`Supplier purchase with ID ${id} not found`);
    }

    return toSupplierPurchaseResponse(purchase);
  }
}
