/**
 * OhMyPos — Recipes service (ERD §3, ADR-005, ADR-013).
 *
 * Implements atomic recipe replacement (Option R1) inside a single transaction.
 * Imports products.mapper.ts as a pure file (not a provider) to prevent Nest dependency cycles (§6).
 */
import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import type { RecipeEnvelopeResponse } from '@ohmypos/api-contracts';
import { toRecipeEnvelope } from '../products/products.mapper';
import { ReplaceRecipeDto } from './recipes.dto';
import { UnknownRawMaterialException } from './recipes.exceptions';

@Injectable()
export class RecipesService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Reads a product's recipe, returning the canonical { recipe, product } envelope.
   * A product with no recipe returns items: [], hpp: null, hasRecipe: false (200 OK, §9.7a).
   */
  async getRecipe(productId: string): Promise<RecipeEnvelopeResponse> {
    const product = await this.prisma.product.findUnique({
      where: { id: productId },
      include: { recipeItems: { include: { rawMaterial: true } } },
    });
    if (!product) {
      throw new NotFoundException(
        'Produk tidak ditemukan. Mungkin sudah dihapus — muat ulang halaman.',
      );
    }
    return toRecipeEnvelope(product);
  }

  /**
   * Atomically replaces a product's recipe items inside a single database transaction.
   */
  async replaceRecipe(
    productId: string,
    dto: ReplaceRecipeDto,
  ): Promise<RecipeEnvelopeResponse> {
    return this.prisma.$transaction(async (tx) => {
      // ⚠️ Every call inside this transaction callback uses `tx`, never `this.prisma` (§9.5).
      const product = await tx.product.findUnique({
        where: { id: productId },
      });
      if (!product) {
        throw new NotFoundException(
          'Produk tidak ditemukan. Mungkin sudah dihapus — muat ulang halaman.',
        );
      }

      const ids = dto.items.map((i) => i.rawMaterialId);
      if (ids.length > 0) {
        const found = await tx.rawMaterial.findMany({
          where: { id: { in: ids } },
          select: { id: true },
        });
        if (found.length !== ids.length) {
          const known = new Set(found.map((r) => r.id));
          const missing = ids.filter((id) => !known.has(id));
          throw new UnknownRawMaterialException(missing);
        }
      }

      await tx.recipeItem.deleteMany({
        where: { productId },
      });

      if (dto.items.length > 0) {
        await tx.recipeItem.createMany({
          data: dto.items.map((i) => ({
            productId,
            rawMaterialId: i.rawMaterialId,
            quantityUsed: new Prisma.Decimal(i.quantityUsed),
          })),
        });
      }

      const updated = await tx.product.findUniqueOrThrow({
        where: { id: productId },
        include: { recipeItems: { include: { rawMaterial: true } } },
      });

      return toRecipeEnvelope(updated);
    });
  }
}
