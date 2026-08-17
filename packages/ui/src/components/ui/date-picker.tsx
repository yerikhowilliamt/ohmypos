'use client';

import * as React from 'react';
import { CalendarDays } from 'lucide-react';
import { cn } from '@ohmypos/ui/lib/utils';
import { Button } from './button';
import { Calendar } from './calendar';
import { Popover, PopoverContent, PopoverTrigger } from './popover';

function toIsoDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export interface DatePickerProps {
  value?: string | null;
  onChange?: (value: string | null) => void;
  id?: string;
  placeholder?: string;
  ariaLabel?: string;
  ariaInvalid?: boolean;
  minDate?: Date;
  maxDate?: Date;
  className?: string;
}

const MONTH_NAMES = [
  'Januari',
  'Februari',
  'Maret',
  'April',
  'Mei',
  'Juni',
  'Juli',
  'Agustus',
  'September',
  'Oktober',
  'November',
  'Desember',
];

function formatDisplayDate(value?: string | null): string {
  if (!value) return '';
  const [y, m, d] = value.split('-');
  const monthIndex = parseInt(m ?? '1', 10) - 1;
  return `${MONTH_NAMES[monthIndex] ?? ''} ${parseInt(d ?? '1', 10)}, ${y}`;
}

export function DatePicker({
  value,
  onChange,
  id,
  placeholder = 'Pilih Tanggal',
  ariaLabel,
  ariaInvalid = false,
  minDate,
  maxDate,
  className,
}: DatePickerProps) {
  const [open, setOpen] = React.useState(false);

  const selectedDate = React.useMemo(() => {
    if (!value) return null;
    const [y, m, d] = value.split('-').map((part) => parseInt(part, 10));
    if (!y || !m || !d) return null;
    return new Date(y, m - 1, d);
  }, [value]);

  const handleSelect = (date: Date | null) => {
    onChange?.(date ? toIsoDate(date) : null);
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          id={id}
          variant="outline"
          aria-label={ariaLabel}
          aria-invalid={ariaInvalid}
          className={cn(
            'h-9 w-full justify-start gap-2 rounded-sm border-border-default bg-surface-raised px-3 py-2 text-left text-sm font-normal text-text-primary shadow-none',
            !value && 'text-text-tertiary',
            className,
          )}
        >
          <CalendarDays className="size-4 shrink-0 text-text-tertiary" />
          {value ? formatDisplayDate(value) : placeholder}
        </Button>
      </PopoverTrigger>
      {/* side="top" + avoidCollisions={false}: content stays anchored ABOVE the
          trigger and never flips below, regardless of available space */}
      <PopoverContent
        className="w-auto p-0"
        align="start"
        side="top"
        avoidCollisions={false}
      >
        <Calendar
          selected={selectedDate}
          onSelect={handleSelect}
          minDate={minDate}
          maxDate={maxDate}
        />
      </PopoverContent>
    </Popover>
  );
}
