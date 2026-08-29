/**
 * OhMyPos — RawMaterials service (ERD §3, ADR-004, ADR-010).
 *
 * Manages raw material master data. `currentStock` is not writable through CRUD;
 * it is altered only via StockMovement under FOR UPDATE (ADR-007).
 */
import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import type { RawMaterialResponse } from '@ohmypos/api-contracts';
import {
  CreateRawMaterialDto,
  UpdateRawMaterialDto,
} from './raw-materials.dto';
import {
  RawMaterialInUseException,
  RawMaterialNameTakenException,
  RawMaterialUnitLockedException,
} from './raw-materials.exceptions';

/**
 * `isBaseUnitLocked` is derived from the movement count, so every read that
 * returns a material has to carry it. Selecting the count is one extra column
 * on the same query — never a second round trip, and never an N+1 in findAll.
 */
const WITH_MOVEMENT_COUNT = {
  _count: { select: { stockMovements: true } },
} as const;

type RawMaterialWithMovementCount = Prisma.RawMaterialGetPayload<{
  include: typeof WITH_MOVEMENT_COUNT;
}>;

@Injectable()
export class RawMaterialsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Serializes Prisma RawMaterial model into RawMaterialResponse with explicit decimal scale
   * formatting via `.toFixed(scale)` (§9.3).
   */
  private toResponse(rm: RawMaterialWithMovementCount): RawMaterialResponse {
    return {
      id: rm.id,
      name: rm.name,
      unit: rm.unit,
      purchaseUnit: rm.purchaseUnit,
      conversionFactor: rm.conversionFactor.toFixed(4),
      // 6dp, not 2 — a per-unit cost is a rate (ADR-024). The UI rounds it for
      // display; the wire carries what the arithmetic actually used.
      unitCost: rm.unitCost.toFixed(6),
      currentStock: rm.currentStock.toFixed(4),
      lowStockThreshold: rm.lowStockThreshold.toFixed(4),
      isBaseUnitLocked: rm._count.stockMovements > 0,
      createdAt: rm.createdAt,
      updatedAt: rm.updatedAt,
    };
  }

  async create(dto: CreateRawMaterialDto): Promise<RawMaterialResponse> {
    try {
      const created = await this.prisma.rawMaterial.create({
        data: {
          name: dto.name,
          unit: dto.unit,
          purchaseUnit: dto.purchaseUnit,
          conversionFactor: new Prisma.Decimal(dto.conversionFactor ?? '1'),
          unitCost: new Prisma.Decimal(dto.unitCost),
          lowStockThreshold: new Prisma.Decimal(dto.lowStockThreshold ?? '0'),
        },
        include: WITH_MOVEMENT_COUNT,
      });
      return this.toResponse(created);
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new RawMaterialNameTakenException(dto.name);
      }
      throw error;
    }
  }

  /**
   * List all raw materials.
   * Deliberately not paginated in Phase 3 (§9.7) — master data size is small;
   * ordered by name ascending.
   */
  async findAll(): Promise<RawMaterialResponse[]> {
    const materials = await this.prisma.rawMaterial.findMany({
      orderBy: { name: 'asc' },
      include: WITH_MOVEMENT_COUNT,
    });
    return materials.map((m) => this.toResponse(m));
  }

  async findOne(id: string): Promise<RawMaterialResponse> {
    const material = await this.prisma.rawMaterial.findUnique({
      where: { id },
      include: WITH_MOVEMENT_COUNT,
    });
    if (!material) {
      throw new NotFoundException(
        'Bahan baku tidak ditemukan. Mungkin sudah dihapus — muat ulang halaman.',
      );
    }
    return this.toResponse(material);
  }

  async update(
    id: string,
    dto: UpdateRawMaterialDto,
  ): Promise<RawMaterialResponse> {
    const existing = await this.findOne(id);

    // ADR-024. Only a REAL change is blocked: resubmitting the same unit (which
    // is what a full-object PATCH from the edit form does on every save) must
    // keep working, or the form becomes unusable the moment stock exists.
    if (dto.unit !== undefined && dto.unit !== existing.unit) {
      if (existing.isBaseUnitLocked) {
        throw new RawMaterialUnitLockedException(existing.unit);
      }
    }

    try {
      const updated = await this.prisma.rawMaterial.update({
        where: { id },
        data: {
          ...(dto.name !== undefined && { name: dto.name }),
          ...(dto.unit !== undefined && { unit: dto.unit }),
          // Packaging IS editable — that is the whole point of splitting it out
          // from the base unit. Historical purchase lines snapshot their own
          // copy, so nothing already recorded moves (ADR-024).
          ...(dto.purchaseUnit !== undefined && {
            purchaseUnit: dto.purchaseUnit,
          }),
          ...(dto.conversionFactor !== undefined && {
            conversionFactor: new Prisma.Decimal(dto.conversionFactor),
          }),
          ...(dto.unitCost !== undefined && {
            unitCost: new Prisma.Decimal(dto.unitCost),
          }),
          ...(dto.lowStockThreshold !== undefined && {
            lowStockThreshold: new Prisma.Decimal(dto.lowStockThreshold),
          }),
        },
        include: WITH_MOVEMENT_COUNT,
      });
      return this.toResponse(updated);
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new RawMaterialNameTakenException(dto.name ?? '');
      }
      throw error;
    }
  }

  async remove(id: string): Promise<void> {
    await this.findOne(id);

    try {
      await this.prisma.rawMaterial.delete({
        where: { id },
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2003'
      ) {
        throw new RawMaterialInUseException();
      }
      throw error;
    }
  }
}
