import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import type { ProductWithHppResponse } from '@ohmypos/api-contracts';
import { CreateProductDto, UpdateProductDto } from './products.dto';
import {
  ProductInUseException,
  ProductNameTakenException,
} from './products.exceptions';
import { toProductWithHppResponse } from './products.mapper';

@Injectable()
export class ProductsService {
  constructor(private readonly prisma: PrismaService) {}

  private readonly productWithRecipeInclude = {
    recipeItems: {
      include: {
        rawMaterial: true,
      },
    },
  } as const;

  async create(dto: CreateProductDto): Promise<ProductWithHppResponse> {
    try {
      const created = await this.prisma.product.create({
        data: {
          name: dto.name,
          sellPrice: new Prisma.Decimal(dto.sellPrice),
          // Defaults to 0: HPP equals the recipe sum (ADR-024).
          wastePercent: new Prisma.Decimal(dto.wastePercent ?? '0'),
          isActive: dto.isActive ?? true,
        },
        include: this.productWithRecipeInclude,
      });
      return toProductWithHppResponse(created);
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ProductNameTakenException(dto.name);
      }
      throw error;
    }
  }

  /** All products by name. Unpaginated: master data is small. */
  async findAll(): Promise<ProductWithHppResponse[]> {
    const products = await this.prisma.product.findMany({
      orderBy: { name: 'asc' },
      include: this.productWithRecipeInclude,
    });
    return products.map((p) => toProductWithHppResponse(p));
  }

  async findOne(id: string): Promise<ProductWithHppResponse> {
    const product = await this.prisma.product.findUnique({
      where: { id },
      include: this.productWithRecipeInclude,
    });
    if (!product) {
      throw new NotFoundException(
        'Produk tidak ditemukan. Mungkin sudah dihapus — muat ulang halaman.',
      );
    }
    return toProductWithHppResponse(product);
  }

  async update(
    id: string,
    dto: UpdateProductDto,
  ): Promise<ProductWithHppResponse> {
    await this.findOne(id);

    try {
      const updated = await this.prisma.product.update({
        where: { id },
        data: {
          ...(dto.name !== undefined && { name: dto.name }),
          ...(dto.sellPrice !== undefined && {
            sellPrice: new Prisma.Decimal(dto.sellPrice),
          }),
          ...(dto.wastePercent !== undefined && {
            wastePercent: new Prisma.Decimal(dto.wastePercent),
          }),
          ...(dto.isActive !== undefined && { isActive: dto.isActive }),
        },
        include: this.productWithRecipeInclude,
      });
      return toProductWithHppResponse(updated);
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ProductNameTakenException(dto.name ?? '');
      }
      throw error;
    }
  }

  async remove(id: string): Promise<void> {
    await this.findOne(id);

    try {
      // Recipe items cascade; a sold product hits P2003 (Restrict), mapped below.
      await this.prisma.product.delete({
        where: { id },
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2003'
      ) {
        throw new ProductInUseException();
      }
      throw error;
    }
  }
}
