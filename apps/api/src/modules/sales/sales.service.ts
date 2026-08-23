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
  async create(dto: CreateSaleDto, userId: string, role?: string) {
    try {
      return await this.prisma.$transaction(
        async (tx) => {
          // ── SISIPAN 1: pra-cek replay (kasus umum: kirim ulang, bukan balapan)
          if (dto.idempotencyKey) {
            const replay = await tx.sale.findUnique({
              where: { idempotencyKey: dto.idempotencyKey },
              include: saleWithRelationsInclude,
            });
            if (replay) {
              return toSaleResponse(replay);
            }
          }

          // TASK-087 / DEF-A6 (G4-b N=3): Kasir batas mundur 3 hari
          const BACKDATE_LIMIT_DAYS = 3;
          if (role === 'KASIR') {
            const earliest = new Date();
            earliest.setUTCDate(earliest.getUTCDate() - BACKDATE_LIMIT_DAYS);
            earliest.setUTCHours(0, 0, 0, 0);
            if (new Date(dto.soldAt) < earliest) {
              throw new BackdatedSaleException(BACKDATE_LIMIT_DAYS);
            }
          }

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

          // DEBT-009: KASIR may never charge a price that differs from
          // Product.sellPrice — only ADMIN/OWNER can. Checked here (Phase 1,
          // read-only) rather than left to resolveUnitPrice()/Phase 3, so a
          // disallowed override fails before any lock is taken. Mirrors
          // resolveUnitPrice()'s own "differs from master price" comparison
          // exactly, so the two can never disagree on a boundary case.
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
    } catch (error) {
      if (
        dto.idempotencyKey &&
        isIdempotencyReplay(error, 'sales_idempotency_key_key')
      ) {
        const original = await this.prisma.sale.findUnique({
          where: { idempotencyKey: dto.idempotencyKey },
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
      // `mode: 'insensitive'` on every clause — without it "budi" never finds
      // "Budi", and the omission reads as working code.
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
      throw new NotFoundException(`Sale with ID ${id} not found`);
    }

    return toSaleResponse(sale);
  }

  /**
   * DEBT-010 minimal interim void guard — NOT a general refund workflow.
   * Same-day, ~30-minute window from `soldAt`, ADMIN/OWNER only (RoleGuard on
   * the controller is authoritative), full reversal only (no partial refund).
   *
   * Never deletes or mutates the original Sale/SaleItem/LedgerEntry rows —
   * financial history, same "Restrict everywhere" rule the schema already
   * enforces (ERD §3). A void instead writes a reversal LedgerEntry (OUTFLOW)
   * and an inbound StockMovement, then flips Sale.status. Mirrors
   * AllocationService.revoke()'s TOCTOU-safe lock-then-recheck shape
   * (allocation.service.ts) — a concurrent void of the same sale must
   * serialize, never race.
   *
   * Report correctness (profitLoss/incomeByPaymentMethod/dailyIncome no
   * longer counting a voided sale's revenue) is NOT this method's job — it
   * lives in report-filters.ts's saleScope() and the ledger-to-sales joins in
   * reports.service.ts. See those files for why a status flip alone would
   * not be enough.
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
          throw new NotFoundException(`Sale with ID ${id} not found`);
        }

        // Lock the sale row before re-checking status — see the TOCTOU note
        // above. `id` is a TEXT column, no ::uuid cast (same trap as
        // stock-movements.service.ts's lockRawMaterialsInIdOrder).
        await tx.$queryRaw`SELECT id FROM sales WHERE id = ${id} FOR UPDATE`;

        const sale = await tx.sale.findUniqueOrThrow({ where: { id } });
        if (sale.status === 'VOIDED') {
          throw new SaleAlreadyVoidedException(id);
        }

        const VOID_WINDOW_MINUTES = 30;
        const windowEnd = new Date(
          sale.soldAt.getTime() + VOID_WINDOW_MINUTES * 60_000,
        );
        if (new Date() > windowEnd) {
          throw new SaleVoidWindowExpiredException(VOID_WINDOW_MINUTES);
        }

        // Reverse stock — same fan-out calculator create() uses, applied as
        // an inbound movement. Reuses referenceType 'SALE' (see
        // stock-movements.service.ts's InboundStockInput comment for why).
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

        // Reverse cash — a real OUTFLOW ledger entry. Dedicated sourceType
        // is for audit-trail legibility only; correctness for the P&L margin
        // view comes from the Sale.status exclusion in reports.service.ts.
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
