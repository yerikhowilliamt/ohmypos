import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { requireTenantId } from '../../common/prisma/tenant-context';
import { resolveSaleCategoryId } from '../../common/system-refs';
import { StockMovementsService } from '../stock-movements/stock-movements.service';
import { LedgerEntriesService } from '../ledger-entries/ledger-entries.service';
import { calculateHpp } from '../products/hpp.calculator';
import { CreateSaleDto, SaleQueryDto } from './sales.dto';
import {
  BackdatedSaleException,
  CentralBranchNotSellableException,
  InactiveProductException,
  PriceOverrideNotAllowedException,
  RecipeIncompleteException,
  SaleAlreadyVoidedException,
  SaleProductNotFoundException,
  SaleVoidWindowExpiredException,
} from './sales.exceptions';
import {
  calculateSaleLineTotal,
  calculateSaleTotal,
  resolveUnitPrice,
} from './sale-totals';
import { aggregateStockRequirements } from './sale-stock.calculator';
import { SaleWithRelations, toSaleResponse } from './sales.mapper';
import { isIdempotencyReplay } from '../../common/idempotency';

const saleWithRelationsInclude = {
  branch: true,
  account: true,
  user: true,
  items: { include: { product: true } },
} as const;

/**
 * Records sales, decrementing stock and writing the income ledger entry in one
 * transaction. See `README.md` for the phase order and lock rules.
 */
@Injectable()
export class SalesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly stockMovementsService: StockMovementsService,
    private readonly ledgerEntriesService: LedgerEntriesService,
  ) {}

  /**
   * Creates a sale, or returns the original one on an idempotency-key replay.
   *
   * @throws InsufficientStockException if any material is short; nothing is written.
   */
  async create(dto: CreateSaleDto, userId: string, role?: string) {
    try {
      return await this.prisma.$transaction(
        async (tx) => {
          // Replay pre-check; a concurrent replay is caught by the unique index below.
          if (dto.idempotencyKey) {
            const replay = await tx.sale.findUnique({
              where: {
                tenantId_idempotencyKey: {
                  tenantId: requireTenantId(),
                  idempotencyKey: dto.idempotencyKey,
                },
              },
              include: saleWithRelationsInclude,
            });
            if (replay) {
              return toSaleResponse(replay);
            }
          }

          const BACKDATE_LIMIT_DAYS = 3;
          if (role === 'KASIR') {
            const earliest = new Date();
            earliest.setUTCDate(earliest.getUTCDate() - BACKDATE_LIMIT_DAYS);
            earliest.setUTCHours(0, 0, 0, 0);
            if (new Date(dto.soldAt) < earliest) {
              throw new BackdatedSaleException(BACKDATE_LIMIT_DAYS);
            }
          }

          // 1. Resolve and validate (reads only, no locks yet).
          const branch = await tx.branch.findUnique({
            where: { id: dto.branchId },
          });
          if (!branch) {
            throw new NotFoundException(
              'Cabang tidak ditemukan. Mungkin sudah dihapus — muat ulang halaman.',
            );
          }
          if (branch.isSystem) {
            throw new CentralBranchNotSellableException();
          }

          const account = await tx.account.findUnique({
            where: { id: dto.accountId },
          });
          if (!account) {
            throw new NotFoundException(
              'Akun pembayaran tidak ditemukan. Mungkin sudah dihapus — muat ulang halaman.',
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

          // Never sell at hppAtSale = 0 because a recipe is missing (ADR-013).
          const incompleteNames = products
            .filter((p) => p.recipeItems.length === 0)
            .map((p) => p.name);
          if (incompleteNames.length > 0) {
            throw new RecipeIncompleteException([...new Set(incompleteNames)]);
          }

          // Same comparison as resolveUnitPrice(), checked before any lock (DEBT-009).
          if (role === 'KASIR') {
            const overriddenNames = dto.items
              .filter((item) => {
                if (item.unitPrice === undefined) return false;
                const product = productById.get(item.productId)!;
                return !new Prisma.Decimal(item.unitPrice).equals(
                  product.sellPrice,
                );
              })
              .map((item) => productById.get(item.productId)!.name);
            if (overriddenNames.length > 0) {
              throw new PriceOverrideNotAllowedException([
                ...new Set(overriddenNames),
              ]);
            }
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

          // 2. Lock every material before reading unitCost/currentStock (ADR-016).
          await this.stockMovementsService.lockRawMaterialsInIdOrder(
            tx,
            requirements.map((r) => r.rawMaterialId),
          );

          const lockedMaterials = await tx.rawMaterial.findMany({
            where: { id: { in: requirements.map((r) => r.rawMaterialId) } },
          });
          const materialById = new Map(lockedMaterials.map((m) => [m.id, m]));

          // 3. Compute and write.
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

            // Same calculator as the live HPP (ADR-005); non-null since recipes are non-empty.
            const hppAtSale = calculateHpp(
              product.recipeItems.map((ri) => ({
                quantityUsed: ri.quantityUsed,
                unitCost: materialById.get(ri.rawMaterialId)!.unitCost,
              })),
              // Waste must be included, or the snapshot drifts from live HPP (ADR-024).
              product.wastePercent,
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
              idempotencyKey: dto.idempotencyKey ?? null,
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
    } catch (error) {
      if (
        dto.idempotencyKey &&
        isIdempotencyReplay(error, 'sales_tenant_id_idempotency_key_key')
      ) {
        const original = await this.prisma.sale.findUnique({
          where: {
            tenantId_idempotencyKey: {
              tenantId: requireTenantId(),
              idempotencyKey: dto.idempotencyKey,
            },
          },
          include: saleWithRelationsInclude,
        });
        if (original) {
          return toSaleResponse(original);
        }
      }
      throw error;
    }
  }

  async findAll(query: SaleQueryDto) {
    const {
      page = 1,
      limit = 50,
      sortBy,
      sortOrder = 'desc',
      search,
      branchId,
      accountId,
      userId,
      startDate,
      endDate,
    } = query;
    const skip = (page - 1) * limit;

    const where: Prisma.SaleWhereInput = {
      ...(search && {
        OR: [
          { id: { contains: search, mode: 'insensitive' } },
          { branch: { name: { contains: search, mode: 'insensitive' } } },
          { user: { name: { contains: search, mode: 'insensitive' } } },
          { account: { name: { contains: search, mode: 'insensitive' } } },
        ],
      }),
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
        orderBy: { [sortBy ?? 'soldAt']: sortOrder },
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
      throw new NotFoundException(
        'Transaksi penjualan tidak ditemukan. Mungkin sudah dihapus — muat ulang halaman.',
      );
    }

    return toSaleResponse(sale);
  }

  /**
   * Fully reverses a sale within 30 minutes of `soldAt` (DEBT-010 interim void).
   * Writes reversal rows; never edits or deletes the original ones.
   *
   * @throws SaleAlreadyVoidedException
   * @throws SaleVoidWindowExpiredException
   */
  async void(id: string, userId: string) {
    return this.prisma.$transaction(
      async (tx) => {
        const target = await tx.sale.findUnique({
          where: { id },
          include: {
            items: {
              include: { product: { include: { recipeItems: true } } },
            },
          },
        });
        if (!target) {
          throw new NotFoundException(
            'Transaksi penjualan tidak ditemukan. Mungkin sudah dihapus — muat ulang halaman.',
          );
        }

        // Lock, then re-check status, so concurrent voids serialize. TEXT id: no ::uuid.
        await tx.$queryRaw`SELECT id FROM sales WHERE id = ${id} FOR UPDATE`;

        const sale = await tx.sale.findUniqueOrThrow({ where: { id } });
        if (sale.status === 'VOIDED') {
          throw new SaleAlreadyVoidedException();
        }

        const VOID_WINDOW_MINUTES = 30;
        const windowEnd = new Date(
          sale.soldAt.getTime() + VOID_WINDOW_MINUTES * 60_000,
        );
        if (new Date() > windowEnd) {
          throw new SaleVoidWindowExpiredException(VOID_WINDOW_MINUTES);
        }

        const requirements = aggregateStockRequirements(
          target.items.map((item) => ({
            quantity: item.quantity,
            recipeItems: item.product.recipeItems.map((ri) => ({
              rawMaterialId: ri.rawMaterialId,
              quantityUsed: ri.quantityUsed,
            })),
          })),
        );
        const lockedMaterials = await tx.rawMaterial.findMany({
          where: {
            id: { in: requirements.map((r) => r.rawMaterialId) },
          },
        });
        const materialById = new Map(lockedMaterials.map((m) => [m.id, m]));

        await this.stockMovementsService.applyInbound(tx, {
          branchId: sale.branchId,
          referenceType: 'SALE',
          referenceId: sale.id,
          movementDate: new Date(),
          lines: requirements.map((r) => ({
            rawMaterialId: r.rawMaterialId,
            quantity: r.quantity,
            unitCost: materialById.get(r.rawMaterialId)!.unitCost,
          })),
        });

        await this.ledgerEntriesService.createSystemEntry(tx, {
          accountId: sale.accountId,
          categoryId: await resolveSaleCategoryId(tx),
          branchId: sale.branchId,
          entryDate: new Date(),
          amount: sale.totalAmount,
          type: 'OUTFLOW',
          sourceType: 'SALE_VOID',
          sourceId: sale.id,
        });

        const updated: SaleWithRelations = await tx.sale.update({
          where: { id },
          data: {
            status: 'VOIDED',
            voidedAt: new Date(),
            voidedByUserId: userId,
          },
          include: saleWithRelationsInclude,
        });

        return toSaleResponse(updated);
      },
      { maxWait: 5000, timeout: 15000 },
    );
  }
}
