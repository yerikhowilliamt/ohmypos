/**
 * OhMyPos — Products service (ERD §3, ADR-005, ADR-010, ADR-013).
 *
 * Manages product master data. Always eager-loads recipeItems.rawMaterial and maps through
 * `toProductWithHppResponse` so `hpp`, `hasRecipe`, `margin`, and `makeableQuantity` are computed
 * consistently (§9.3).
 */
import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import type { ProductWithHppResponse } from '@ohmypos/api-contracts';
import { CreateProductDto, UpdateProductDto } from './products.dto';
import { ProductNameTakenException } from './products.exceptions';
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

  /**
   * List all products.
   * Deliberately not paginated in Phase 3 (§9.7) — master data size is small;
   * ordered by name ascending.
   */
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
      throw new NotFoundException(`Product with ID ${id} not found`);
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

    // onDelete: Cascade on RecipeItem means deleting a product cleans up its recipe items.
    await this.prisma.product.delete({
      where: { id },
    });
  }
}
