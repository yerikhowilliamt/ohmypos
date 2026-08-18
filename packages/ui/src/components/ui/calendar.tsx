'use client';

import * as React from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@ohmypos/ui/lib/utils';
import { Button } from './button';

export interface CalendarProps {
  mode?: 'single';
  selected?: Date | null;
  onSelect?: (date: Date | null) => void;
  className?: string;
  minDate?: Date;
  maxDate?: Date;
}

const MONTHS = [
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

const DAYS = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];

function isSameDay(d1?: Date | null, d2?: Date | null): boolean {
  if (!d1 || !d2) return false;
  return (
    d1.getFullYear() === d2.getFullYear() &&
    d1.getMonth() === d2.getMonth() &&
    d1.getDate() === d2.getDate()
  );
}

export function Calendar({
  selected,
  onSelect,
  className,
  minDate,
  maxDate,
}: CalendarProps) {
  const [currentMonth, setCurrentMonth] = React.useState<Date>(
    () => selected ?? new Date(),
  );

  const year = currentMonth.getFullYear();
  const month = currentMonth.getMonth();

  const firstDayOfWeek = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const prevMonth = () => {
    setCurrentMonth(new Date(year, month - 1, 1));
  };

  const nextMonth = () => {
    setCurrentMonth(new Date(year, month + 1, 1));
  };

  const handleDateClick = (day: number) => {
    const clickedDate = new Date(year, month, day);
    onSelect?.(clickedDate);
  };

  const isDateDisabled = (d: Date) => {
    if (minDate && d < minDate) return true;
    if (maxDate && d > maxDate) return true;
    return false;
  };

  const cells: React.ReactNode[] = [];

  // Equal cell sizing for every cell so a month with 5 or 6 weeks never
  // changes the calendar's total height. Fixed 6-week grid: header row +
  // 6 × 7 day cells = 49 cells (like the major date-picker libraries).
  const cellClass =
    'flex h-6 w-6 items-center justify-center rounded-sm text-sm';

  // Row 0: weekday labels
  DAYS.forEach((d) =>
    cells.push(
      <span
        key={`header-${d}`}
        className={cn(cellClass, 'font-semibold text-text-tertiary')}
      >
        {d}
      </span>,
    ),
  );

  // Leading empty cells
  for (let i = 0; i < firstDayOfWeek; i++) {
    cells.push(
      <div key={`empty-${i}`} className="h-6 w-6" aria-hidden="true" />,
    );
  }

  // Days of month
  for (let day = 1; day <= daysInMonth; day++) {
    const dateObj = new Date(year, month, day);
    const isSelected = isSameDay(selected, dateObj);
    const isToday = isSameDay(new Date(), dateObj);
    const disabled = isDateDisabled(dateObj);

    cells.push(
      <button
        key={`day-${day}`}
        type="button"
        disabled={disabled}
        onClick={() => handleDateClick(day)}
        className={cn(
          cellClass,
          'cursor-pointer transition-colors outline-none',
          isSelected
            ? 'bg-brand-primary text-white font-semibold shadow-1'
            : isToday
              ? 'border border-brand-primary font-semibold text-brand-primary hover:bg-surface-muted'
              : 'text-text-primary hover:bg-surface-muted',
          disabled && 'cursor-not-allowed opacity-30 hover:bg-transparent',
        )}
      >
        {day}
      </button>,
    );
  }

  // Trailing empty cells to always fill 6 full weeks. Without these, the
  // grid's row count (and therefore the calendar's height) varies 5 vs 6
  // weeks between months, which breaks the fixed-size popover positioning.
  const totalWeekCells = 7 * 6; // header row excluded below
  const dayCellCount = firstDayOfWeek + daysInMonth;
  for (let i = dayCellCount; i < totalWeekCells; i++) {
    cells.push(
      <div key={`trailing-${i}`} className="h-6 w-6" aria-hidden="true" />,
    );
  }

  return (
    <div
      data-slot="calendar"
      className={cn(
        'p-2 bg-surface-raised rounded-md border border-border-default shadow-1 w-full',
        className,
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border-default pb-1">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 w-7 p-0"
          onClick={prevMonth}
          aria-label="Bulan sebelumnya"
        >
          <ChevronLeft className="size-4" />
        </Button>
        <span className="text-sm font-semibold text-text-primary">
          {MONTHS[month]} {year}
        </span>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 w-7 p-0"
          onClick={nextMonth}
          aria-label="Bulan berikutnya"
        >
          <ChevronRight className="size-4" />
        </Button>
      </div>

      {/* Single unified grid: weekday labels + day cells */}
      <div className="grid grid-cols-7 gap-y-1 mt-1">{cells}</div>
    </div>
  );
}
