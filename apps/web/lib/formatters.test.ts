import { describe, expect, it } from 'vitest';
import {
  formatCurrency,
  formatQuantity,
  formatLongDate,
  formatMarginPercentage,
  formatPercent,
  formatThousands,
  unformatThousands,
} from './formatters';

describe('formatters', () => {
  describe('formatCurrency', () => {
    it('formats string amount as IDR', () => {
      const result = formatCurrency('15000');
      expect(result.replace(/\s/g, ' ')).toMatch(/Rp\s*15\.000/);
    });

    it('formats decimal amount', () => {
      const result = formatCurrency('15000.50');
      expect(result.replace(/\s/g, ' ')).toMatch(/Rp\s*15\.000,5/);
    });

    it('returns fallback for null/undefined/empty/NaN', () => {
      expect(formatCurrency(null)).toBe('—');
      expect(formatCurrency(undefined)).toBe('—');
      expect(formatCurrency('')).toBe('—');
      expect(formatCurrency('abc')).toBe('—');
    });
  });

  describe('formatQuantity', () => {
    it('formats quantity without unit', () => {
      expect(formatQuantity('1.5000')).toBe('1,5');
      expect(formatQuantity('100.0000')).toBe('100');
      expect(formatQuantity('0.2500')).toBe('0,25');
    });

    it('formats quantity with unit', () => {
      expect(formatQuantity('1.5000', 'kg')).toBe('1,5 kg');
      expect(formatQuantity('250', 'gr')).toBe('250 gr');
    });

    it('returns fallback for null/undefined/empty/NaN', () => {
      expect(formatQuantity(null)).toBe('—');
      expect(formatQuantity(undefined)).toBe('—');
      expect(formatQuantity('')).toBe('—');
      expect(formatQuantity('invalid', 'kg')).toBe('—');
    });
  });

  describe('formatMarginPercentage', () => {
    it('calculates and formats margin percentage correctly', () => {
      // Sell 20.000, HPP 10.000 -> 50%
      expect(formatMarginPercentage('20000', '10000')).toBe('50.0%');
      // Sell 25.000, HPP 15.000 -> 40%
      expect(formatMarginPercentage('25000', '15000')).toBe('40.0%');
      // Sell 30.000, HPP 12.500 -> 58.333% -> 58.3%
      expect(formatMarginPercentage('30000', '12500')).toBe('58.3%');
    });

    it('returns null when HPP is missing or null', () => {
      expect(formatMarginPercentage('20000', null)).toBeNull();
      expect(formatMarginPercentage('20000', undefined)).toBeNull();
      expect(formatMarginPercentage('20000', '')).toBeNull();
    });

    it('returns null when sellPrice is zero or negative', () => {
      expect(formatMarginPercentage('0', '5000')).toBeNull();
      expect(formatMarginPercentage('-1000', '5000')).toBeNull();
    });
  });

  describe('formatPercent', () => {
    it('formats a positive percentage', () => {
      expect(formatPercent(62.75)).toBe('62,75%');
    });

    it('formats a negative percentage (a loss margin)', () => {
      expect(formatPercent(-50)).toBe('-50%');
    });

    it('formats zero', () => {
      expect(formatPercent(0)).toBe('0%');
    });

    it('returns fallback for null/undefined — the API "denominator was zero" case', () => {
      expect(formatPercent(null)).toBe('—');
      expect(formatPercent(undefined)).toBe('—');
    });
  });

  describe('formatThousands & unformatThousands', () => {
    it('formats raw string to Indonesian dot-separated format for UI display', () => {
      expect(formatThousands('20000')).toBe('20.000');
      expect(formatThousands('1500000')).toBe('1.500.000');
      expect(formatThousands('20000.00')).toBe('20.000');
      expect(formatThousands('350')).toBe('350');
      expect(formatThousands('')).toBe('');
      expect(formatThousands(null)).toBe('');
    });

    it('unformats display string with dots back to raw string for backend payload', () => {
      expect(unformatThousands('20.000')).toBe('20000');
      expect(unformatThousands('1.500.000')).toBe('1500000');
      expect(unformatThousands('20000')).toBe('20000');
      expect(unformatThousands('')).toBe('');
      expect(unformatThousands(null)).toBe('');
    });
  });

  describe('formatLongDate', () => {
    it('formats an instant as the Indonesian long date in WIB', () => {
      // 2026-08-20T02:00:00Z is 09:00 on 20 August in Jakarta (UTC+7).
      expect(formatLongDate(new Date('2026-08-20T02:00:00.000Z'))).toBe(
        'Kamis, 20 Agustus 2026',
      );
    });

    it('uses the Jakarta day, not UTC, across the date boundary', () => {
      // 2026-08-19T18:00:00Z is already 01:00 on 20 August in Jakarta.
      expect(formatLongDate(new Date('2026-08-19T18:00:00.000Z'))).toBe(
        'Kamis, 20 Agustus 2026',
      );
    });
  });
});
