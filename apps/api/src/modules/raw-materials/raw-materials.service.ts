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
} from './raw-materials.exceptions';

@Injectable()
export class RawMaterialsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Serializes Prisma RawMaterial model into RawMaterialResponse with explicit decimal scale
   * formatting via `.toFixed(scale)` (§9.3).
   */
  private toResponse(
    rm: Prisma.RawMaterialGetPayload<object>,
  ): RawMaterialResponse {
    return {
      id: rm.id,
      name: rm.name,
      unit: rm.unit,
      unitCost: rm.unitCost.toFixed(2),
      currentStock: rm.currentStock.toFixed(4),
      lowStockThreshold: rm.lowStockThreshold.toFixed(4),
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
          unitCost: new Prisma.Decimal(dto.unitCost),
          lowStockThreshold: new Prisma.Decimal(dto.lowStockThreshold ?? '0'),
        },
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
    });
    return materials.map((m) => this.toResponse(m));
  }

  async findOne(id: string): Promise<RawMaterialResponse> {
    const material = await this.prisma.rawMaterial.findUnique({
      where: { id },
    });
    if (!material) {
      throw new NotFoundException(`Raw material with ID ${id} not found`);
    }
    return this.toResponse(material);
  }

  async update(
    id: string,
    dto: UpdateRawMaterialDto,
  ): Promise<RawMaterialResponse> {
    await this.findOne(id);

    try {
      const updated = await this.prisma.rawMaterial.update({
        where: { id },
        data: {
          ...(dto.name !== undefined && { name: dto.name }),
          ...(dto.unit !== undefined && { unit: dto.unit }),
          ...(dto.unitCost !== undefined && {
            unitCost: new Prisma.Decimal(dto.unitCost),
          }),
          ...(dto.lowStockThreshold !== undefined && {
            lowStockThreshold: new Prisma.Decimal(dto.lowStockThreshold),
          }),
        },
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
        throw new RawMaterialInUseException(id);
      }
      throw error;
    }
  }
}
