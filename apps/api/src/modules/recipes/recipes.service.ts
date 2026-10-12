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

  /** A product's recipe. No recipe returns `items: []`, `hpp: null` with 200. */
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

  /** Replaces a product's recipe atomically. */
  async replaceRecipe(
    productId: string,
    dto: ReplaceRecipeDto,
  ): Promise<RecipeEnvelopeResponse> {
    return this.prisma.$transaction(async (tx) => {
      // Use `tx` only inside this callback.
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
