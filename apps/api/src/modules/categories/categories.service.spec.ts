import { NotFoundException } from '@nestjs/common';
import { CategoriesService } from './categories.service';
import { SystemCategoryProtectedException } from './categories.exceptions';

describe('CategoriesService', () => {
  const now = new Date('2026-08-25T00:00:00.000Z');
  const regularCategory = {
    id: '11111111-1111-4111-8111-111111111111',
    name: 'Operasional',
    type: 'OUTFLOW' as const,
    createdAt: now,
    updatedAt: now,
  };
  const systemCategory = {
    ...regularCategory,
    id: '22222222-2222-4222-8222-222222222222',
    name: 'Pembelian Bahan Baku',
  };
  const category = {
    create: jest.fn(),
    findMany: jest.fn(),
    findUnique: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  };
  const service = new CategoriesService({ category } as never);

  beforeEach(() => jest.clearAllMocks());

  it('marks seeded system categories in API responses', async () => {
    category.findMany.mockResolvedValue([systemCategory, regularCategory]);

    await expect(service.findAll()).resolves.toEqual([
      { ...systemCategory, isSystem: true },
      { ...regularCategory, isSystem: false },
    ]);
  });

  it('protects a system category from updates', async () => {
    category.findUnique.mockResolvedValue(systemCategory);

    await expect(
      service.update(systemCategory.id, { name: 'Belanja Stok' }),
    ).rejects.toBeInstanceOf(SystemCategoryProtectedException);
    expect(category.update).not.toHaveBeenCalled();
  });

  it('protects a system category from deletion', async () => {
    category.findUnique.mockResolvedValue(systemCategory);

    await expect(service.remove(systemCategory.id)).rejects.toBeInstanceOf(
      SystemCategoryProtectedException,
    );
    expect(category.delete).not.toHaveBeenCalled();
  });

  it('updates an ordinary category and maps isSystem', async () => {
    const updated = { ...regularCategory, name: 'Listrik & Air' };
    category.findUnique.mockResolvedValue(regularCategory);
    category.update.mockResolvedValue(updated);

    await expect(
      service.update(regularCategory.id, { name: updated.name }),
    ).resolves.toEqual({ ...updated, isSystem: false });
  });

  it('returns a named not-found error before delete', async () => {
    category.findUnique.mockResolvedValue(null);

    await expect(service.remove(regularCategory.id)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
