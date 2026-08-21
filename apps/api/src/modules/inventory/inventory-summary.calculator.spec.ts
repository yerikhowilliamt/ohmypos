/**
 * OhMyPos — unit tests for the Inventory Summary arithmetic (PRD §5.6,
 * Phase 6 plan §2.1, §4.1, §12.1).
 *
 * The identity `closing = opening + in − out` and its equivalence to the raw
 * signed movement sum is what this whole phase exists to guarantee. It is
 * asserted here exhaustively with no database, and again in e2e against an
 * independent SQL oracle.
 */
import { Prisma } from '../../generated/prisma/client';
import {
  assembleInventorySummary,
  sumSignedByMaterial,
  type PeriodBucket,
  type SignedBucket,
  type SummaryMaterial,
} from './inventory-summary.calculator';

const d = (value: string) => new Prisma.Decimal(value);

const material = (
  id: string,
  lowStockThreshold = '0.0000',
): SummaryMaterial => ({
  id,
  name: `Material ${id}`,
  unit: 'kg',
  lowStockThreshold: d(lowStockThreshold),
});

describe('Inventory Summary Calculator (inventory-summary.calculator.ts)', () => {
  describe('sumSignedByMaterial', () => {
    it('adds IN and subtracts OUT per material', () => {
      const totals = sumSignedByMaterial([
        { rawMaterialId: 'm1', direction: 'IN', quantity: d('40.0000') },
        { rawMaterialId: 'm1', direction: 'OUT', quantity: d('11.0000') },
        { rawMaterialId: 'm2', direction: 'OUT', quantity: d('3.0000') },
      ]);

      expect(totals.get('m1')!.toFixed(4)).toBe('29.0000');
      expect(totals.get('m2')!.toFixed(4)).toBe('-3.0000');
      expect(totals.get('m3')).toBeUndefined();
    });
  });

  describe('assembleInventorySummary', () => {
    it('computes opening / in / out / closing for a full month', () => {
      const prior: SignedBucket[] = [
        { rawMaterialId: 'm1', direction: 'IN', quantity: d('40.0000') },
      ];
      const period: PeriodBucket[] = [
        {
          rawMaterialId: 'm1',
          direction: 'OUT',
          referenceType: 'OPENING',
          quantity: d('2.0000'),
        },
        {
          rawMaterialId: 'm1',
          direction: 'IN',
          referenceType: 'PURCHASE',
          quantity: d('40.0000'),
        },
        {
          rawMaterialId: 'm1',
          direction: 'OUT',
          referenceType: 'SALE',
          quantity: d('11.0000'),
        },
      ];

      const [row] = assembleInventorySummary(
        [material('m1', '5.0000')],
        prior,
        period,
      );

      // carry-forward 40, stock-take corrected it to 38, +40 in, −11 out.
      expect(row.opening.toFixed(4)).toBe('38.0000');
      expect(row.in.toFixed(4)).toBe('40.0000');
      expect(row.out.toFixed(4)).toBe('11.0000');
      expect(row.closing.toFixed(4)).toBe('67.0000');
      expect(row.status).toBe('OK');
    });

    it('THE IDENTITY: closing equals the raw signed sum of every movement, over many shapes', () => {
      // Each case is [priorBuckets, periodBuckets]. The expected closing is not
      // hard-coded: it is re-derived independently as Σ signed(prior) +
      // Σ signed(period), which is the definition the report must never drift
      // from (plan §2.1).
      const cases: [SignedBucket[], PeriodBucket[]][] = [
        [[], []],
        [
          [{ rawMaterialId: 'm1', direction: 'IN', quantity: d('10.0000') }],
          [],
        ],
        [
          [],
          [
            {
              rawMaterialId: 'm1',
              direction: 'IN',
              referenceType: 'PURCHASE',
              quantity: d('7.5000'),
            },
          ],
        ],
        [
          [
            { rawMaterialId: 'm1', direction: 'IN', quantity: d('100.0000') },
            { rawMaterialId: 'm1', direction: 'OUT', quantity: d('40.0000') },
          ],
          [
            {
              rawMaterialId: 'm1',
              direction: 'OUT',
              referenceType: 'OPENING',
              quantity: d('5.0000'),
            },
            {
              rawMaterialId: 'm1',
              direction: 'IN',
              referenceType: 'PURCHASE',
              quantity: d('25.5000'),
            },
            {
              rawMaterialId: 'm1',
              direction: 'OUT',
              referenceType: 'SALE',
              quantity: d('12.3456'),
            },
            {
              rawMaterialId: 'm1',
              direction: 'IN',
              referenceType: 'ADJUSTMENT',
              quantity: d('0.0001'),
            },
          ],
        ],
      ];

      for (const [prior, period] of cases) {
        const [row] = assembleInventorySummary([material('m1')], prior, period);

        const expectedClosing = [...prior, ...period].reduce(
          (running, bucket) =>
            bucket.direction === 'IN'
              ? running.plus(bucket.quantity)
              : running.minus(bucket.quantity),
          d('0'),
        );

        expect(row.closing.toFixed(4)).toBe(expectedClosing.toFixed(4));
        expect(row.closing.toFixed(4)).toBe(
          row.opening.plus(row.in).minus(row.out).toFixed(4),
        );
      }
    });

    it('includes a material with no movements at all, as zeroes and OUT', () => {
      const [row] = assembleInventorySummary(
        [material('m1', '5.0000')],
        [],
        [],
      );

      expect(row.opening.toFixed(4)).toBe('0.0000');
      expect(row.in.toFixed(4)).toBe('0.0000');
      expect(row.out.toFixed(4)).toBe('0.0000');
      expect(row.closing.toFixed(4)).toBe('0.0000');
      expect(row.status).toBe('OUT');
    });

    it('carries a prior balance into opening when the period has no movements', () => {
      const [row] = assembleInventorySummary(
        [material('m1')],
        [{ rawMaterialId: 'm1', direction: 'IN', quantity: d('12.0000') }],
        [],
      );

      expect(row.opening.toFixed(4)).toBe('12.0000');
      expect(row.closing.toFixed(4)).toBe('12.0000');
    });

    it('counts an OPENING movement into opening, never into in', () => {
      const [row] = assembleInventorySummary(
        [material('m1')],
        [],
        [
          {
            rawMaterialId: 'm1',
            direction: 'IN',
            referenceType: 'OPENING',
            quantity: d('50.0000'),
          },
        ],
      );

      expect(row.opening.toFixed(4)).toBe('50.0000');
      expect(row.in.toFixed(4)).toBe('0.0000');
    });

    it('subtracts an OUT-direction OPENING movement from opening', () => {
      const [row] = assembleInventorySummary(
        [material('m1')],
        [{ rawMaterialId: 'm1', direction: 'IN', quantity: d('100.0000') }],
        [
          {
            rawMaterialId: 'm1',
            direction: 'OUT',
            referenceType: 'OPENING',
            quantity: d('10.0000'),
          },
        ],
      );

      expect(row.opening.toFixed(4)).toBe('90.0000');
    });

    it('DECISION 3: an ADJUSTMENT lands in in/out by direction, keeping the identity intact', () => {
      const [row] = assembleInventorySummary(
        [material('m1')],
        [],
        [
          {
            rawMaterialId: 'm1',
            direction: 'IN',
            referenceType: 'ADJUSTMENT',
            quantity: d('3.0000'),
          },
          {
            rawMaterialId: 'm1',
            direction: 'OUT',
            referenceType: 'ADJUSTMENT',
            quantity: d('1.0000'),
          },
        ],
      );

      expect(row.in.toFixed(4)).toBe('3.0000');
      expect(row.out.toFixed(4)).toBe('1.0000');
      expect(row.closing.toFixed(4)).toBe('2.0000');
    });

    it('DECISION 3, the v1 proof: direction bucketing equals referenceType bucketing today', () => {
      // Over v1's actual writers (PURCHASE in, SALE out, OPENING carved out),
      // the two definitions are identical — so decision 3 changes nothing now
      // and only protects the identity later.
      const period: PeriodBucket[] = [
        {
          rawMaterialId: 'm1',
          direction: 'IN',
          referenceType: 'PURCHASE',
          quantity: d('40.0000'),
        },
        {
          rawMaterialId: 'm1',
          direction: 'OUT',
          referenceType: 'SALE',
          quantity: d('11.0000'),
        },
        {
          rawMaterialId: 'm1',
          direction: 'OUT',
          referenceType: 'OPENING',
          quantity: d('2.0000'),
        },
      ];
      const [row] = assembleInventorySummary([material('m1')], [], period);

      const byReferenceTypeIn = period
        .filter((b) => b.referenceType === 'PURCHASE')
        .reduce((sum, b) => sum.plus(b.quantity), d('0'));
      const byReferenceTypeOut = period
        .filter((b) => b.referenceType === 'SALE')
        .reduce((sum, b) => sum.plus(b.quantity), d('0'));

      expect(row.in.toFixed(4)).toBe(byReferenceTypeIn.toFixed(4));
      expect(row.out.toFixed(4)).toBe(byReferenceTypeOut.toFixed(4));
    });

    it('does not drift at 4dp across many small movements', () => {
      const period: PeriodBucket[] = Array.from({ length: 10000 }, () => ({
        rawMaterialId: 'm1',
        direction: 'IN' as const,
        referenceType: 'PURCHASE' as const,
        quantity: d('0.0001'),
      }));
      const [row] = assembleInventorySummary([material('m1')], [], period);

      expect(row.in.toFixed(4)).toBe('1.0000');
      expect(row.closing.toFixed(4)).toBe('1.0000');
    });

    it('returns one row per material, in the order the caller supplied', () => {
      const rows = assembleInventorySummary(
        [material('m2'), material('m1')],
        [],
        [],
      );
      expect(rows.map((r) => r.rawMaterialId)).toEqual(['m2', 'm1']);
    });
  });
});
