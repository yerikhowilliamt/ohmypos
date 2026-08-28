'use client';

import * as React from 'react';
import { cn } from '@ohmypos/ui/lib/utils';
import { Input } from './input';

export interface CurrencyInputProps extends Omit<
  React.ComponentProps<typeof Input>,
  'value' | 'onChange' | 'prefix'
> {
  value?: string | number;
  onChange?: (value: string) => void;
  prefix?: string | null;
}

/**
 * Formats a raw number string into Indonesian thousand-separated display format with dots.
 * e.g. "20000" -> "20.000", "1500000" -> "1.500.000"
 *
 * An all-zero decimal part is dropped whatever its length, so a per-unit cost
 * stored at `Decimal(18,6)` (ADR-024) reads as "10.000" rather than
 * "10.000,000000". Only zeros are trimmed — a real fraction is shown in full
 * ("3,333333"), and a partially typed one is left exactly as typed.
 */
export function formatThousands(
  value: string | number | null | undefined,
): string {
  if (value === null || value === undefined || value === '') return '';
  const str = String(value);
  const parts = str.split('.');
  const intPart = parts[0] ?? '';
  const decPart = parts[1];

  const cleanInt = intPart.replace(/[^\d-]/g, '');
  if (!cleanInt) return '';

  const formattedInt = cleanInt.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  if (decPart !== undefined && decPart !== '' && !/^0+$/.test(decPart)) {
    return `${formattedInt},${decPart}`;
  }
  return formattedInt;
}

/**
 * Strips formatting (dots for thousands, converts comma to dot for decimal) to return raw decimal string.
 * e.g. "20.000" -> "20000", "1.500.000,50" -> "1500000.50"
 */
export function unformatThousands(value: string | null | undefined): string {
  if (!value) return '';
  const withoutDots = value.replace(/\./g, '');
  const normalized = withoutDots.replace(',', '.');
  return normalized.replace(/[^\d.-]/g, '');
}

const CurrencyInput = React.forwardRef<HTMLInputElement, CurrencyInputProps>(
  ({ value = '', onChange, className, prefix = 'Rp', ...props }, ref) => {
    const displayValue = React.useMemo(() => formatThousands(value), [value]);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const raw = unformatThousands(e.target.value);
      onChange?.(raw);
    };

    return (
      <div className="relative flex items-center w-full">
        {prefix && (
          <span className="absolute left-3 text-sm text-text-tertiary select-none font-mono pointer-events-none">
            {prefix}
          </span>
        )}
        <Input
          ref={ref}
          type="text"
          inputMode="numeric"
          value={displayValue}
          onChange={handleChange}
          className={cn('numeric font-mono', prefix ? 'pl-9' : '', className)}
          {...props}
        />
      </div>
    );
  },
);
CurrencyInput.displayName = 'CurrencyInput';

export { CurrencyInput };
