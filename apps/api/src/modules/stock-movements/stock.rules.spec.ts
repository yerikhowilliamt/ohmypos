/**
 * OhMyPos — unit tests for the sale-time stock sufficiency rule (ADR-007, plan §10.7 Tier 1).
 *
 * Playbook §10 puts the Sale flow's stock check in the "must have thorough
 * tests" tier. The row lock that makes this hold under concurrency is covered
 * separately by the e2e concurrency cases (plan §10.7 cases 7-8).
 */
import { Prisma } from '../../generated/prisma/client';
import { InsufficientStockException } from './stock-movements.exceptions';
import { assertSufficientStock } from './stock.rules';

describe('Stock Sufficiency Rule (stock.rules.ts)', () => {
  it('passes when available stock exceeds the requirement', () => {
    const available = new Map([['gula', new Prisma.Decimal('10.0000')]]);
    expect(() =>
      assertSufficientStock(
        [
          {
            rawMaterialId: 'gula',
            name: 'Gula',
            quantity: new Prisma.Decimal('5.0000'),
          },
        ],
        available,
      ),
    ).not.toThrow();
  });

  it('passes when available stock exactly equals the requirement (selling the last unit)', () => {
    const available = new Map([['gula', new Prisma.Decimal('5.0000')]]);
    expect(() =>
      assertSufficientStock(
        [
          {
            rawMaterialId: 'gula',
            name: 'Gula',
            quantity: new Prisma.Decimal('5.0000'),
          },
        ],
        available,
      ),
    ).not.toThrow();
  });

  it('throws InsufficientStockException when short by even 0.0001', () => {
    const available = new Map([['gula', new Prisma.Decimal('4.9999')]]);
    expect(() =>
      assertSufficientStock(
        [
          {
            rawMaterialId: 'gula',
            name: 'Gula',
            quantity: new Prisma.Decimal('5.0000'),
          },
        ],
        available,
      ),
    ).toThrow(InsufficientStockException);
  });

  it('names every short material at once, not just the first', () => {
    const available = new Map([
      ['gula', new Prisma.Decimal('1.0000')],
      ['kopi', new Prisma.Decimal('0.0010')],
    ]);
    try {
      assertSufficientStock(
        [
          {
            rawMaterialId: 'gula',
            name: 'Gula',
            quantity: new Prisma.Decimal('5.0000'),
          },
          {
            rawMaterialId: 'kopi',
            name: 'Kopi',
            quantity: new Prisma.Decimal('0.0180'),
          },
        ],
        available,
      );
      fail('expected InsufficientStockException to be thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(InsufficientStockException);
      const message = (error as Error).message;
      expect(message).toContain('Gula');
      expect(message).toContain('Kopi');
    }
  });

  it('treats a required material absent from the available map as a shortfall (fails closed)', () => {
    const available = new Map<string, Prisma.Decimal>();
    expect(() =>
      assertSufficientStock(
        [
          {
            rawMaterialId: 'ghost',
            name: 'Ghost Material',
            quantity: new Prisma.Decimal('1.0000'),
          },
        ],
        available,
      ),
    ).toThrow(InsufficientStockException);
  });

  /**
   * The POS maps shortfalls back to the cart lines that caused them, so the 409
   * body has to carry the raw material ids — not just the human-readable message.
   * `message` stays byte-identical to the string form the assertions above rely on.
   */
  it('serialises a machine-readable shortfall payload alongside the message', () => {
    const available = new Map([['gula', new Prisma.Decimal('2.0000')]]);

    try {
      assertSufficientStock(
        [
          {
            rawMaterialId: 'gula',
            name: 'Gula',
            quantity: new Prisma.Decimal('5.0000'),
          },
          {
            rawMaterialId: 'kopi',
            name: 'Kopi',
            quantity: new Prisma.Decimal('1.0000'),
          },
        ],
        available,
      );
      fail('expected InsufficientStockException to be thrown');
    } catch (error) {
      const exception = error as InsufficientStockException;
      expect(exception.getStatus()).toBe(409);

      const body = exception.getResponse() as {
        statusCode: number;
        error: string;
        code: string;
        message: string;
        details: {
          shortfalls: {
            rawMaterialId: string;
            name: string;
            required: string;
            available: string;
          }[];
        };
      };

      expect(body.statusCode).toBe(409);
      expect(body.error).toBe('Conflict');
      expect(body.code).toBe('INSUFFICIENT_STOCK');
      // The message a client without structured handling would still show.
      expect(body.message).toBe(exception.message);
      expect(body.message).toContain('Gula (butuh 5.0000, tersedia 2.0000)');

      // Both short materials, at full 4dp scale, keyed by id.
      expect(body.details.shortfalls).toEqual([
        {
          rawMaterialId: 'gula',
          name: 'Gula',
          required: '5.0000',
          available: '2.0000',
        },
        {
          rawMaterialId: 'kopi',
          name: 'Kopi',
          required: '1.0000',
          available: '0.0000',
        },
      ]);
    }
  });
});
