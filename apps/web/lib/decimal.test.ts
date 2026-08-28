import { describe, expect, it } from 'vitest';
import {
  addFixed,
  compareFixed,
  divFixed,
  divFloorToInt,
  formatFixed,
  fromInt,
  mulFixed,
  parseFixed,
  roundHalfUp,
  subFixed,
  MONEY_SCALE,
  QUANTITY_SCALE,
} from './decimal';

describe('parseFixed / formatFixed', () => {
  it('round-trips wire-format decimal strings at their declared scale', () => {
    expect(formatFixed(parseFixed('36000.00', MONEY_SCALE))).toBe('36000.00');
    expect(formatFixed(parseFixed('24.5000', QUANTITY_SCALE))).toBe('24.5000');
  });

  it('pads a short fraction up to scale', () => {
    expect(formatFixed(parseFixed('1.5', QUANTITY_SCALE))).toBe('1.5000');
  });

  it('handles negatives, which remaining stock can legitimately be', () => {
    expect(
      formatFixed(subFixed(parseFixed('1.0000', 4), parseFixed('3.0000', 4))),
    ).toBe('-2.0000');
  });

  it('rejects a non-decimal string rather than silently producing zero', () => {
    expect(() => parseFixed('abc', MONEY_SCALE)).toThrow();
    expect(() => parseFixed('', MONEY_SCALE)).toThrow();
  });
});

describe('roundHalfUp', () => {
  it('rounds .005 up — the case binary floats get wrong', () => {
    // 1.005 as a float is 1.00499999999999989...; naive Math.round gives 1.00.
    expect(formatFixed(roundHalfUp(parseFixed('1.005', 3), 2), 2)).toBe('1.01');
    expect(formatFixed(roundHalfUp(parseFixed('2.675', 3), 2), 2)).toBe('2.68');
  });

  it('leaves an already-exact value alone', () => {
    expect(formatFixed(roundHalfUp(parseFixed('12.50', 2), 2), 2)).toBe(
      '12.50',
    );
  });

  it('rounds a negative magnitude away from zero, matching ROUND_HALF_UP', () => {
    expect(formatFixed(roundHalfUp(parseFixed('-1.005', 3), 2), 2)).toBe(
      '-1.01',
    );
  });
});

describe('mulFixed', () => {
  it('is exact — the scale widens instead of rounding', () => {
    const quantity = fromInt(3, 0);
    const used = parseFixed('0.0180', QUANTITY_SCALE);
    expect(
      formatFixed(roundHalfUp(mulFixed(quantity, used), QUANTITY_SCALE)),
    ).toBe('0.0540');
  });

  it('multiplies a 4dp quantity by a 2dp price without float drift', () => {
    const quantity = parseFixed('2.5000', QUANTITY_SCALE);
    const price = parseFixed('15000.00', MONEY_SCALE);
    expect(
      formatFixed(
        roundHalfUp(mulFixed(quantity, price), MONEY_SCALE),
        MONEY_SCALE,
      ),
    ).toBe('37500.00');
  });
});

describe('the two opposite rounding rules (ADR-015)', () => {
  /**
   * ADR-015 sets round-PER-LINE-then-sum for sale totals and round-ONCE for the
   * stock fan-out. This pins a case where the two genuinely diverge, so a future
   * change that swaps them fails here rather than drifting into currentStock.
   */
  it('produces different answers, proving the rules are not interchangeable', () => {
    const parts = ['0.3333', '0.3333', '0.3333'].map((v) => parseFixed(v, 4));

    const roundedPerPartThenSummed = parts
      .map((p) => roundHalfUp(p, 2))
      .reduce((sum, p) => addFixed(sum, p), parseFixed('0.00', 2));

    const summedThenRoundedOnce = roundHalfUp(
      parts.reduce((sum, p) => addFixed(sum, p), parseFixed('0.0000', 4)),
      2,
    );

    expect(formatFixed(roundedPerPartThenSummed, 2)).toBe('0.99');
    expect(formatFixed(summedThenRoundedOnce, 2)).toBe('1.00');
    expect(formatFixed(roundedPerPartThenSummed, 2)).not.toBe(
      formatFixed(summedThenRoundedOnce, 2),
    );
  });
});

describe('divFloorToInt', () => {
  it('floors exactly at a whole boundary — the float-division trap', () => {
    // 3.0000 / 1.0000 must be 3, never 2 via 2.9999999996.
    expect(
      divFloorToInt(parseFixed('3.0000', 4), parseFixed('1.0000', 4)),
    ).toBe(3);
  });

  it('floors a fractional result down', () => {
    expect(
      divFloorToInt(parseFixed('2.9999', 4), parseFixed('1.0000', 4)),
    ).toBe(2);
  });

  it('handles a small divisor, as recipe quantities usually are', () => {
    // 5.0000 kg of beans at 0.0180 kg per cup = 277 cups.
    expect(
      divFloorToInt(parseFixed('5.0000', 4), parseFixed('0.0180', 4)),
    ).toBe(277);
  });

  it('clamps a negative numerator to zero — you cannot make a negative number', () => {
    expect(
      divFloorToInt(parseFixed('-1.0000', 4), parseFixed('0.5000', 4)),
    ).toBe(0);
  });

  it('returns null for a zero divisor rather than dividing by zero', () => {
    expect(
      divFloorToInt(parseFixed('5.0000', 4), parseFixed('0.0000', 4)),
    ).toBeNull();
  });
});

describe('compareFixed', () => {
  it('compares across differing scales', () => {
    expect(compareFixed(parseFixed('1.50', 2), parseFixed('1.5000', 4))).toBe(
      0,
    );
    expect(compareFixed(parseFixed('1.51', 2), parseFixed('1.5000', 4))).toBe(
      1,
    );
    expect(compareFixed(parseFixed('1.49', 2), parseFixed('1.5000', 4))).toBe(
      -1,
    );
  });

  describe('divFixed', () => {
    it('mirrors the API normalization: Rp45.000 over 2.000 ml = Rp22,50/ml', () => {
      const result = divFixed(
        parseFixed('45000.00', MONEY_SCALE),
        parseFixed('2000.0000', QUANTITY_SCALE),
        6,
      );
      expect(result).not.toBeNull();
      expect(formatFixed(result!, 6)).toBe('22.500000');
    });

    it('keeps a repeating rate at six decimals instead of collapsing it', () => {
      // Rp10.000 over 3.000 gram. At two decimals this would be 3,33 and a
      // 3.000-gram recipe would cost Rp9.990 instead of Rp10.000 (ADR-024).
      const result = divFixed(
        parseFixed('10000.00', MONEY_SCALE),
        parseFixed('3000.0000', QUANTITY_SCALE),
        6,
      );
      expect(formatFixed(result!, 6)).toBe('3.333333');
    });

    it('rounds HALF_UP at the requested scale', () => {
      // 1 / 8 = 0,125 → 0,13 at two decimals.
      const result = divFixed(
        parseFixed('1.00', MONEY_SCALE),
        parseFixed('8.0000', QUANTITY_SCALE),
        2,
      );
      expect(formatFixed(result!, 2)).toBe('0.13');
    });

    it('returns null on a zero divisor rather than Infinity', () => {
      expect(
        divFixed(
          parseFixed('45000.00', MONEY_SCALE),
          parseFixed('0.0000', QUANTITY_SCALE),
          6,
        ),
      ).toBeNull();
    });
  });
});
