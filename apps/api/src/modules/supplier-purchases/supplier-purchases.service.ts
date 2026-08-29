/**
 * OhMyPos — SupplierPurchases service (ERD §3, System Design §6.2, ADR-004, ADR-006, ADR-007).
 *
 * Summary of ADR-024 (what a purchase line means since the POS-feedback work):
 * The client sends what the supplier's nota says — a quantity in the material's
 * PURCHASE unit and the TOTAL price paid for it. This service derives the
 * normalized stock quantity and the cost per stock unit, snapshots both the
 * bought and the received figures on the line, and writes the latest applicable
 * normalized cost back to `RawMaterial.unitCost` (closing DEBT-006).
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
  async create(dto: CreateSupplierPurchaseDto, role?: string) {
    try {
      return await this.prisma.$transaction(async (tx) => {
        // SISIPAN 1: pra-cek replay (kasus umum: kirim ulang, bukan balapan)
        if (dto.idempotencyKey) {
          const replay = await tx.supplierPurchase.findUnique({
            where: { idempotencyKey: dto.idempotencyKey },
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

        // TASK-087 / DEF-A6: Kasir batas mundur 3 hari
        const BACKDATE_LIMIT_DAYS = 3;
        if (role === 'KASIR') {
          const earliest = new Date();
          earliest.setUTCDate(earliest.getUTCDate() - BACKDATE_LIMIT_DAYS);
          earliest.setUTCHours(0, 0, 0, 0);
          if (new Date(dto.purchaseDate) < earliest) {
            throw new BackdatedPurchaseException(BACKDATE_LIMIT_DAYS);
          }
        }

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
          // ADR-014: the system location is a ledger-attribution row, not an
          // outlet. Accepting it here would produce `isCentral: false` on a
          // purchase that is central — so `branchId: null` stays the single way
          // to say "central", exactly as the ADR promises.
          if (branch.isSystem) {
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

        // 5. Convert each line from purchase units to stock units and derive the
        //    normalized cost (pure calculator, ADR-024). Reuses the `materials`
        //    read from step 4 — the conversion factor is already in hand, so
        //    there is no extra query and no window between reading the factor
        //    and using it.
        const materialById = new Map(materials.map((m) => [m.id, m]));

        const lines = dto.items.map((item) => {
          // Non-null: step 4 already threw if any id was missing.
          const material = materialById.get(item.rawMaterialId)!;
          const normalized = normalizePurchaseLine({
            purchaseQuantity: new Prisma.Decimal(item.purchaseQuantity),
            // Snapshot the packaging AS IT IS NOW. A later edit to the
            // material's purchaseUnit/conversionFactor must not move this row —
            // that is the whole reason the line carries its own copy (ADR-024).
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

        // 6. Create parent purchase record
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
            // What was bought — frozen (ADR-024).
            purchaseQuantity: l.purchaseQuantity,
            purchaseUnit: l.purchaseUnit,
            conversionFactor: l.conversionFactor,
            // What stock received — the normalized pair.
            quantity: l.quantity,
            unitCost: l.unitCost,
            lineTotal: l.lineTotal,
          })),
        });

        // 8b. LATEST-COST WRITE-BACK (ADR-024, closes DEBT-006).
        //
        // Runs here, after the lines exist and while applyInbound's FOR UPDATE
        // (step 7, ADR-016) is still held on every material in this purchase.
        //
        // The winner is RECOMPUTED FROM TABLE STATE rather than compared
        // against the row just inserted. That is what makes a backdated
        // purchase behave: it inserts, loses the ORDER BY to the newer row, and
        // this rewrites `unitCost` to the value it already had. The outcome
        // therefore depends on `purchaseDate` ordering only — never on which
        // concurrent HTTP request happened to finish last, which is precisely
        // the residual risk DEBT-006 named.
        //
        // `createdAt` then `id` are the tie-breakers, so two purchases sharing
        // a date still resolve to one deterministic winner on every evaluation.
        //
        // Ascending rawMaterialId, same as every other lock-ordered loop in
        // this codebase (ADR-016) — the locks are already held, but keeping the
        // order uniform is what stops a future edit from reintroducing a cycle.
        const touchedMaterialIds = [
          ...new Set(lines.map((l) => l.rawMaterialId)),
        ].sort((a, b) => a.localeCompare(b));

        for (const rawMaterialId of touchedMaterialIds) {
          const latest = await tx.$queryRaw<{ unit_cost: Prisma.Decimal }[]>`
            SELECT spi.unit_cost
              FROM supplier_purchase_items spi
              JOIN supplier_purchases sp ON sp.id = spi.supplier_purchase_id
             WHERE spi.raw_material_id = ${rawMaterialId}
             ORDER BY sp.purchase_date DESC, sp.created_at DESC, sp.id DESC
             LIMIT 1
          `;

          // Always non-empty here — this transaction just inserted a line for
          // this material — but an empty result must not become an undefined
          // write, so it is guarded rather than asserted.
          if (latest.length > 0) {
            await tx.rawMaterial.update({
              where: { id: rawMaterialId },
              data: { unitCost: latest[0].unit_cost },
            });
          }
        }

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
    } catch (error) {
      if (
        dto.idempotencyKey &&
        isIdempotencyReplay(error, 'supplier_purchases_idempotency_key_key')
      ) {
        const original = await this.prisma.supplierPurchase.findUnique({
          where: { idempotencyKey: dto.idempotencyKey },
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
      throw new NotFoundException(`Supplier purchase with ID ${id} not found`);
    }

    return toSupplierPurchaseResponse(purchase);
  }
}
