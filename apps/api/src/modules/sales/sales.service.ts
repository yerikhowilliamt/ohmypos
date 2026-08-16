/**
 * OhMyPos — Sales service (ERD §3, System Design §6.1, PRD §5.2, ADR-005, ADR-007,
 * ADR-014, ADR-015, ADR-016).
 *
 * Summary of the flow: for each line, resolve the charged price and snapshot the
 * PER-UNIT HPP from the current recipe (ADR-005, ADR-015) — never recomputed
 * later. Every raw material the cart's recipes touch is locked, ALL of it,
 * BEFORE any cost is read or any row is written, in ascending rawMaterialId
 * order (ADR-016) — this is what makes two concurrent sales (or a sale and a
 * purchase) racing the same material either serialize cleanly or fail with
 * InsufficientStockException, never deadlock and never corrupt the balance.
 * Stock decrement, SaleItem rows, and the income LedgerEntry all commit or roll
 * back together in one transaction (Playbook §7).
 */
import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import {
  CENTRAL_BRANCH_NAME,
  resolveSaleCategoryId,
} from '../../common/system-refs';
import { StockMovementsService } from '../stock-movements/stock-movements.service';
import { LedgerEntriesService } from '../ledger-entries/ledger-entries.service';
import { calculateHpp } from '../products/hpp.calculator';
import { CreateSaleDto, SaleQueryDto } from './sales.dto';
import {
  CentralBranchNotSellableException,
  InactiveProductException,
  RecipeIncompleteException,
  SaleProductNotFoundException,
} from './sales.exceptions';
import {
  calculateSaleLineTotal,
  calculateSaleTotal,
  resolveUnitPrice,
} from './sale-totals';
import { aggregateStockRequirements } from './sale-stock.calculator';
import { SaleWithRelations, toSaleResponse } from './sales.mapper';

const saleWithRelationsInclude = {
  branch: true,
  account: true,
  user: true,
  items: { include: { product: true } },
} as const;

@Injectable()
export class SalesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly stockMovementsService: StockMovementsService,
    private readonly ledgerEntriesService: LedgerEntriesService,
  ) {}

  /**
   * Creates a sale in a single database transaction (Playbook §7, System Design
   * §6.1). An explicit `timeout` is set: this transaction can legitimately spend
   * time waiting for row locks held by another sale (ADR-016), and Prisma's 5s
   * interactive-transaction default would surface that as a P2028/500 on a sale
   * that was merely queued, not broken. 15s absorbs a queue; it is not a retry.
   */
  async create(dto: CreateSaleDto, userId: string) {
    return this.prisma.$transaction(
      async (tx) => {
        // ── Phase 1: resolve (reads only, no locks yet) ─────────────────────
        const branch = await tx.branch.findUnique({
          where: { id: dto.branchId },
        });
        if (!branch) {
          throw new NotFoundException(
            `Branch with ID ${dto.branchId} not found`,
          );
        }
        // ADR-014/ADR-015: `Pusat (Dapur Sentral)` is a ledger-attribution row,
        // not a till — there is no central sale (ADR-004).
        if (branch.name === CENTRAL_BRANCH_NAME) {
          throw new CentralBranchNotSellableException();
        }

        const account = await tx.account.findUnique({
          where: { id: dto.accountId },
        });
        if (!account) {
          throw new NotFoundException(
            `Account with ID ${dto.accountId} not found`,
          );
        }

        const productIds = dto.items.map((i) => i.productId);
        const products = await tx.product.findMany({
          where: { id: { in: productIds } },
          include: { recipeItems: true },
        });
        const productById = new Map(products.map((p) => [p.id, p]));

        const missingIds = productIds.filter((id) => !productById.has(id));
        if (missingIds.length > 0) {
          throw new SaleProductNotFoundException([...new Set(missingIds)]);
        }

        const inactiveNames = [
          ...new Set(products.filter((p) => !p.isActive)),
        ].map((p) => p.name);
        if (inactiveNames.length > 0) {
          throw new InactiveProductException(inactiveNames);
        }

        // ADR-013: "no recipe" is a different fact than "recipe costs nothing" —
        // a recipeless product is rejected, never sold at hppAtSale = 0 (plan §6).
        const incompleteNames = products
          .filter((p) => p.recipeItems.length === 0)
          .map((p) => p.name);
        if (incompleteNames.length > 0) {
          throw new RecipeIncompleteException([...new Set(incompleteNames)]);
        }

        const requirements = aggregateStockRequirements(
          dto.items.map((item) => {
            const product = productById.get(item.productId)!;
            return {
              quantity: new Prisma.Decimal(item.quantity),
              recipeItems: product.recipeItems.map((ri) => ({
                rawMaterialId: ri.rawMaterialId,
                quantityUsed: ri.quantityUsed,
              })),
            };
          }),
        );

        // ── Phase 2: acquire (ALL locks, ascending order, before any mutation
        //    or any read of unitCost/currentStock — ADR-016) ────────────────
        await this.stockMovementsService.lockRawMaterialsInIdOrder(
          tx,
          requirements.map((r) => r.rawMaterialId),
        );

        const lockedMaterials = await tx.rawMaterial.findMany({
          where: { id: { in: requirements.map((r) => r.rawMaterialId) } },
        });
        const materialById = new Map(lockedMaterials.map((m) => [m.id, m]));

        // ── Phase 3: compute and mutate ──────────────────────────────────────
        const lineComputations = dto.items.map((item) => {
          const product = productById.get(item.productId)!;
          const quantity = new Prisma.Decimal(item.quantity);
          const { unitPriceAtSale, isPriceOverridden } = resolveUnitPrice({
            override: item.unitPrice
              ? new Prisma.Decimal(item.unitPrice)
              : undefined,
            masterPrice: product.sellPrice,
          });
          const lineTotal = calculateSaleLineTotal({
            quantity,
            unitPrice: unitPriceAtSale,
          });

          // Same calculateHpp call the Products module uses (ADR-005) — the live
          // figure and the snapshot must never be two implementations that can
          // drift. Locked rows only; recipeItems.length > 0 already asserted
          // above, so this is never null.
          const hppAtSale = calculateHpp(
            product.recipeItems.map((ri) => ({
              quantityUsed: ri.quantityUsed,
              unitCost: materialById.get(ri.rawMaterialId)!.unitCost,
            })),
          )!;

          return {
            productId: item.productId,
            quantity,
            unitPriceAtSale,
            isPriceOverridden,
            hppAtSale,
            lineTotal,
          };
        });

        const totalAmount = calculateSaleTotal(
          lineComputations.map((l) => l.lineTotal),
        );

        const categoryId = await resolveSaleCategoryId(tx);
        const entry = await this.ledgerEntriesService.createSystemEntry(tx, {
          accountId: dto.accountId,
          categoryId,
          branchId: dto.branchId,
          entryDate: new Date(dto.soldAt),
          amount: totalAmount,
          type: 'INFLOW',
          sourceType: 'SALE',
          sourceId: null, // linked after the Sale exists, below
        });

        const sale = await tx.sale.create({
          data: {
            branchId: dto.branchId,
            accountId: dto.accountId,
            userId,
            ledgerEntryId: entry.id,
            totalAmount,
            soldAt: new Date(dto.soldAt),
          },
        });

        await tx.saleItem.createMany({
          data: lineComputations.map((l) => ({
            saleId: sale.id,
            productId: l.productId,
            quantity: l.quantity,
            unitPriceAtSale: l.unitPriceAtSale,
            isPriceOverridden: l.isPriceOverridden,
            hppAtSale: l.hppAtSale,
            lineTotal: l.lineTotal,
          })),
        });

        // Raises InsufficientStockException and writes nothing if any material
        // is short — the transaction then rolls back everything above too.
        await this.stockMovementsService.applyOutbound(tx, {
          branchId: dto.branchId,
          referenceType: 'SALE',
          referenceId: sale.id,
          movementDate: new Date(dto.soldAt),
          lines: requirements.map((r) => ({
            rawMaterialId: r.rawMaterialId,
            quantity: r.quantity,
            unitCost: materialById.get(r.rawMaterialId)!.unitCost,
          })),
        });

        await tx.ledgerEntry.update({
          where: { id: entry.id },
          data: { sourceId: sale.id },
        });

        const created = (await tx.sale.findUnique({
          where: { id: sale.id },
          include: saleWithRelationsInclude,
        })) as SaleWithRelations;

        return toSaleResponse(created);
      },
      { maxWait: 5000, timeout: 15000 },
    );
  }

  async findAll(query: SaleQueryDto) {
    const {
      page = 1,
      limit = 50,
      sortBy,
      branchId,
      accountId,
      userId,
      startDate,
      endDate,
    } = query;
    const skip = (page - 1) * limit;

    const where: Prisma.SaleWhereInput = {
      ...(branchId && { branchId }),
      ...(accountId && { accountId }),
      ...(userId && { userId }),
      ...((startDate || endDate) && {
        soldAt: {
          ...(startDate && { gte: new Date(startDate) }),
          ...(endDate && { lte: new Date(endDate) }),
        },
      }),
    };

    const [data, total] = await Promise.all([
      this.prisma.sale.findMany({
        where,
        skip,
        take: limit,
        orderBy: { [sortBy ?? 'soldAt']: 'desc' },
        include: saleWithRelationsInclude,
      }),
      this.prisma.sale.count({ where }),
    ]);

    return {
      data: (data as SaleWithRelations[]).map((s) => toSaleResponse(s)),
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit) || 1,
      },
    };
  }

  async findOne(id: string) {
    const sale = await this.prisma.sale.findUnique({
      where: { id },
      include: saleWithRelationsInclude,
    });

    if (!sale) {
      throw new NotFoundException(`Sale with ID ${id} not found`);
    }

    return toSaleResponse(sale);
  }
}
