/**
 * OhMyPos — Suppliers service (ERD §3, PRD §5.3, ADR-010).
 *
 * Manages raw material suppliers. Supplier names are unique.
 * Deletion is restricted if referenced by SupplierPurchase or Payable.
 */
import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import type { SupplierResponse } from '@ohmypos/api-contracts';
import {
  CreateSupplierDto,
  SupplierQueryDto,
  UpdateSupplierDto,
} from './suppliers.dto';
import {
  SupplierInUseException,
  SupplierNameTakenException,
} from './suppliers.exceptions';

@Injectable()
export class SuppliersService {
  constructor(private readonly prisma: PrismaService) {}

  private toResponse(
    supplier: Prisma.SupplierGetPayload<object>,
  ): SupplierResponse {
    return {
      id: supplier.id,
      name: supplier.name,
      contact: supplier.contact ?? null,
      createdAt: supplier.createdAt.toISOString(),
      updatedAt: supplier.updatedAt.toISOString(),
    };
  }

  async create(dto: CreateSupplierDto): Promise<SupplierResponse> {
    try {
      const created = await this.prisma.supplier.create({
        data: {
          name: dto.name,
          contact: dto.contact ?? null,
        },
      });
      return this.toResponse(created);
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new SupplierNameTakenException(dto.name);
      }
      throw error;
    }
  }

  async findAll(query: SupplierQueryDto) {
    const { page = 1, limit = 50, sortBy, search } = query;
    const skip = (page - 1) * limit;

    const where: Prisma.SupplierWhereInput = {
      ...(search && {
        name: { contains: search, mode: 'insensitive' },
      }),
    };

    const [data, total] = await Promise.all([
      this.prisma.supplier.findMany({
        where,
        skip,
        take: limit,
        orderBy: { [sortBy ?? 'name']: 'asc' },
      }),
      this.prisma.supplier.count({ where }),
    ]);

    return {
      data: data.map((s) => this.toResponse(s)),
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit) || 1,
      },
    };
  }

  async findOne(id: string): Promise<SupplierResponse> {
    const supplier = await this.prisma.supplier.findUnique({
      where: { id },
    });
    if (!supplier) {
      throw new NotFoundException(`Supplier with ID ${id} not found`);
    }
    return this.toResponse(supplier);
  }

  async update(id: string, dto: UpdateSupplierDto): Promise<SupplierResponse> {
    await this.findOne(id);

    try {
      const updated = await this.prisma.supplier.update({
        where: { id },
        data: {
          ...(dto.name !== undefined && { name: dto.name }),
          ...(dto.contact !== undefined && { contact: dto.contact ?? null }),
        },
      });
      return this.toResponse(updated);
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new SupplierNameTakenException(dto.name ?? '');
      }
      throw error;
    }
  }

  async remove(id: string): Promise<void> {
    await this.findOne(id);

    try {
      await this.prisma.supplier.delete({
        where: { id },
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2003'
      ) {
        throw new SupplierInUseException(id);
      }
      throw error;
    }
  }
}
