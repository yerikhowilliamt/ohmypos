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

/** `isBaseUnitLocked` comes from the movement count selected on the same query. */
const WITH_MOVEMENT_COUNT = {
  _count: { select: { stockMovements: true } },
} as const;

type RawMaterialWithMovementCount = Prisma.RawMaterialGetPayload<{
  include: typeof WITH_MOVEMENT_COUNT;
}>;

@Injectable()
export class RawMaterialsService {
  constructor(private readonly prisma: PrismaService) {}

  private toResponse(rm: RawMaterialWithMovementCount): RawMaterialResponse {
    return {
      id: rm.id,
      name: rm.name,
      unit: rm.unit,
      purchaseUnit: rm.purchaseUnit,
      conversionFactor: rm.conversionFactor.toFixed(4),
      // 6dp: a per-unit cost is a rate (ADR-024).
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

  /** All raw materials by name. Unpaginated: master data is small. */
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

    // Only a real change is blocked; the edit form resubmits the same unit.
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
          // Packaging stays editable; purchase lines keep their own snapshot.
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
