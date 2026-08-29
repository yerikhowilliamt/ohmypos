import { Injectable, NotFoundException } from '@nestjs/common';
import type {
  CategoryResponse,
  CreateCategory,
  UpdateCategory,
} from '@ohmypos/api-contracts';
import { PrismaService } from '../../common/prisma/prisma.service';
import { Prisma, type Category } from '../../generated/prisma/client';
import { isSystemCategoryName } from '../../common/system-refs';
import {
  CategoryInUseException,
  CategoryNameTakenException,
  SystemCategoryProtectedException,
} from './categories.exceptions';

function toCategoryResponse(category: Category): CategoryResponse {
  return {
    ...category,
    isSystem: isSystemCategoryName(category.name),
  };
}

/** Ported from Kasync, with the `userId` scoping removed (ERD §7 porting note 1). */
@Injectable()
export class CategoriesService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateCategory) {
    try {
      const category = await this.prisma.category.create({ data: dto });
      return toCategoryResponse(category);
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new CategoryNameTakenException(dto.name);
      }
      throw error;
    }
  }

  async findAll() {
    const categories = await this.prisma.category.findMany({
      orderBy: { name: 'asc' },
    });
    return categories.map(toCategoryResponse);
  }

  async findOne(id: string) {
    const category = await this.prisma.category.findUnique({ where: { id } });
    if (!category) {
      throw new NotFoundException(
        'Kategori tidak ditemukan. Mungkin sudah dihapus — muat ulang halaman.',
      );
    }
    return toCategoryResponse(category);
  }

  async update(id: string, dto: UpdateCategory) {
    const category = await this.prisma.category.findUnique({ where: { id } });
    if (!category) {
      throw new NotFoundException(
        'Kategori tidak ditemukan. Mungkin sudah dihapus — muat ulang halaman.',
      );
    }
    if (isSystemCategoryName(category.name)) {
      throw new SystemCategoryProtectedException(category.name);
    }
    try {
      const updated = await this.prisma.category.update({
        where: { id },
        data: dto,
      });
      return toCategoryResponse(updated);
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new CategoryNameTakenException(dto.name ?? category.name);
      }
      throw error;
    }
  }

  async remove(id: string) {
    const category = await this.prisma.category.findUnique({ where: { id } });
    if (!category) {
      throw new NotFoundException(
        'Kategori tidak ditemukan. Mungkin sudah dihapus — muat ulang halaman.',
      );
    }
    if (isSystemCategoryName(category.name)) {
      throw new SystemCategoryProtectedException(category.name);
    }
    try {
      const deleted = await this.prisma.category.delete({ where: { id } });
      return toCategoryResponse(deleted);
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2003'
      ) {
        throw new CategoryInUseException();
      }
      throw error;
    }
  }
}
