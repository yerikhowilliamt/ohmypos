/**
 * OhMyPos — RawMaterialsService unit tests (ADR-024).
 *
 * The rule under test is the one with real blast radius: the STOCK/RECIPE base
 * unit is immutable once the material has movement history, while the PURCHASE
 * unit and conversion factor stay editable forever. Getting that backwards
 * either freezes packaging changes the business needs, or silently re-scales
 * every stored quantity in the system.
 *
 * Mocked Prisma, same shape as categories.service.spec.ts — this is a rule, not
 * a query, so it does not need a database.
 */
import { Prisma } from '../../generated/prisma/client';
import { RawMaterialsService } from './raw-materials.service';
import { RawMaterialUnitLockedException } from './raw-materials.exceptions';

const d = (v: string) => new Prisma.Decimal(v);

describe('RawMaterialsService', () => {
  const now = new Date('2026-08-28T00:00:00.000Z');

  const ayam = {
    id: '11111111-1111-4111-8111-111111111111',
    name: 'Ayam',
    unit: 'pcs',
    purchaseUnit: 'ekor',
    conversionFactor: d('10.0000'),
    unitCost: d('4500.000000'),
    currentStock: d('0.0000'),
    lowStockThreshold: d('5.0000'),
    createdAt: now,
    updatedAt: now,
    _count: { stockMovements: 0 },
  };
  const ayamWithHistory = { ...ayam, _count: { stockMovements: 3 } };

  const rawMaterial = {
    create: jest.fn(),
    findMany: jest.fn(),
    findUnique: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  };
  const service = new RawMaterialsService({ rawMaterial } as never);

  beforeEach(() => jest.clearAllMocks());

  /**
   * `jest.fn()` types its recorded arguments as `any`, so reading them back
   * without a cast is an eslint `no-unsafe-member-access`. Casting the whole
   * calls array once, here, keeps the assertions below readable and typed.
   */
  type MaterialWriteArgs = {
    data: {
      purchaseUnit?: string;
      conversionFactor?: Prisma.Decimal;
      unit?: string;
    };
  };
  const createArgs = () =>
    (rawMaterial.create.mock.calls as MaterialWriteArgs[][])[0][0];
  const updateArgs = () =>
    (rawMaterial.update.mock.calls as MaterialWriteArgs[][])[0][0];

  it('exposes both units and reports the base unit as unlocked with no history', async () => {
    rawMaterial.findMany.mockResolvedValue([ayam]);

    const [response] = await service.findAll();

    expect(response.unit).toBe('pcs');
    expect(response.purchaseUnit).toBe('ekor');
    expect(response.conversionFactor).toBe('10.0000');
    expect(response.isBaseUnitLocked).toBe(false);
    // 6dp on the wire — a per-unit cost is a rate, not an amount (ADR-024).
    expect(response.unitCost).toBe('4500.000000');
  });

  it('reports the base unit as locked once any movement exists', async () => {
    rawMaterial.findMany.mockResolvedValue([ayamWithHistory]);

    const [response] = await service.findAll();

    expect(response.isBaseUnitLocked).toBe(true);
  });

  it('persists the purchase unit and conversion factor on create', async () => {
    rawMaterial.create.mockResolvedValue(ayam);

    await service.create({
      name: 'Ayam',
      unit: 'pcs',
      purchaseUnit: 'ekor',
      conversionFactor: '10',
      unitCost: '4500',
      lowStockThreshold: '5',
    });

    const data = createArgs().data;
    expect(data.purchaseUnit).toBe('ekor');
    expect(data.conversionFactor?.toFixed(4)).toBe('10.0000');
  });

  it('defaults the conversion factor to 1 — "bought in the stock unit"', async () => {
    rawMaterial.create.mockResolvedValue(ayam);

    await service.create({
      name: 'Gula',
      unit: 'kg',
      purchaseUnit: 'kg',
      unitCost: '12000',
    } as never);

    const data = createArgs().data;
    expect(data.conversionFactor?.toFixed(4)).toBe('1.0000');
  });

  it('rejects a base-unit change once the material has stock history', async () => {
    rawMaterial.findUnique.mockResolvedValue(ayamWithHistory);

    await expect(
      service.update(ayam.id, { unit: 'gram' }),
    ).rejects.toBeInstanceOf(RawMaterialUnitLockedException);
    expect(rawMaterial.update).not.toHaveBeenCalled();
  });

  it('allows a base-unit change while the material has no history', async () => {
    rawMaterial.findUnique.mockResolvedValue(ayam);
    rawMaterial.update.mockResolvedValue({ ...ayam, unit: 'gram' });

    await expect(service.update(ayam.id, { unit: 'gram' })).resolves.toEqual(
      expect.objectContaining({ unit: 'gram' }),
    );
  });

  it('accepts a PATCH that resubmits the SAME base unit even when locked', async () => {
    // The edit form sends the whole object on every save. Blocking an unchanged
    // value would make the form unusable the moment stock exists.
    rawMaterial.findUnique.mockResolvedValue(ayamWithHistory);
    rawMaterial.update.mockResolvedValue(ayamWithHistory);

    await expect(
      service.update(ayam.id, { unit: 'pcs', purchaseUnit: 'ekor' }),
    ).resolves.toEqual(expect.objectContaining({ unit: 'pcs' }));
    expect(rawMaterial.update).toHaveBeenCalled();
  });

  it('allows repackaging (purchase unit + factor) even with stock history', async () => {
    // The supplier switched from ekor to 5-pack boxes. This must keep working —
    // it is the whole reason packaging was split off the base unit.
    rawMaterial.findUnique.mockResolvedValue(ayamWithHistory);
    rawMaterial.update.mockResolvedValue({
      ...ayamWithHistory,
      purchaseUnit: 'box',
      conversionFactor: d('50.0000'),
    });

    const updated = await service.update(ayam.id, {
      purchaseUnit: 'box',
      conversionFactor: '50',
    });

    expect(updated.purchaseUnit).toBe('box');
    expect(updated.conversionFactor).toBe('50.0000');
    const data = updateArgs().data;
    expect(data.conversionFactor?.toFixed(4)).toBe('50.0000');
  });
});
