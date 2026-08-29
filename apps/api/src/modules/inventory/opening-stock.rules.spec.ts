/**
 * OhMyPos — unit tests for the opening-stock validation rules (PRD §5.5,
 * Phase 6 plan §5, §3.4).
 */
import { Prisma } from '../../generated/prisma/client';
import {
  assertOpeningStockNotNegative,
  assertUnitPriceRule,
} from './opening-stock.rules';

const d = (value: string) => new Prisma.Decimal(value);

describe('Opening Stock Rules (opening-stock.rules.ts)', () => {
  describe('assertUnitPriceRule', () => {
    it('accepts a price when the material has no purchase in the period', () => {
      expect(() =>
        assertUnitPriceRule(
          [{ rawMaterialId: 'm1', name: 'Gula', unitPrice: '12000.00' }],
          new Set(),
        ),
      ).not.toThrow();
    });

    it('rejects a missing price when the material has no purchase in the period', () => {
      expect(() =>
        assertUnitPriceRule(
          [{ rawMaterialId: 'm1', name: 'Gula', unitPrice: undefined }],
          new Set(),
        ),
      ).toThrow(/Isi harga satuan/);
    });

    it('accepts a missing price when a purchase already priced the material', () => {
      expect(() =>
        assertUnitPriceRule(
          [{ rawMaterialId: 'm1', name: 'Gula', unitPrice: undefined }],
          new Set(['m1']),
        ),
      ).not.toThrow();
    });

    it('rejects a supplied price when a purchase already priced the material', () => {
      expect(() =>
        assertUnitPriceRule(
          [{ rawMaterialId: 'm1', name: 'Gula', unitPrice: '12000.00' }],
          new Set(['m1']),
        ),
      ).toThrow(/Harga satuan tidak perlu diisi/);
    });

    it('names EVERY offending material, not just the first', () => {
      expect(() =>
        assertUnitPriceRule(
          [
            { rawMaterialId: 'm1', name: 'Gula', unitPrice: undefined },
            { rawMaterialId: 'm2', name: 'Kopi', unitPrice: undefined },
          ],
          new Set(),
        ),
      ).toThrow(/Gula.*Kopi/);
    });
  });

  describe('assertOpeningStockNotNegative', () => {
    const delta = (rawMaterialId: string, resultingStock: string) => ({
      rawMaterialId,
      delta: d('-1.0000'),
      direction: 'OUT' as const,
      quantity: d('1.0000'),
      resultingStock: d(resultingStock),
    });

    it('accepts a resulting stock of exactly zero', () => {
      expect(() =>
        assertOpeningStockNotNegative(
          [delta('m1', '0.0000')],
          new Map([['m1', 'Gula']]),
        ),
      ).not.toThrow();
    });

    it('rejects a negative resulting stock and names the material', () => {
      expect(() =>
        assertOpeningStockNotNegative(
          [delta('m1', '-0.0001')],
          new Map([['m1', 'Gula']]),
        ),
      ).toThrow(/Gula/);
    });

    it('names every offender at once', () => {
      expect(() =>
        assertOpeningStockNotNegative(
          [delta('m1', '-1.0000'), delta('m2', '-2.0000')],
          new Map([
            ['m1', 'Gula'],
            ['m2', 'Kopi'],
          ]),
        ),
      ).toThrow(/Gula.*Kopi/);
    });
  });
});
