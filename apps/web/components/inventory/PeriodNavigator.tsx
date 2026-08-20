'use client';

import * as React from 'react';
import { Button } from '@ohmypos/ui/components/button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@ohmypos/ui/components/popover';
import { ChevronLeft, ChevronRight, CalendarDays } from 'lucide-react';
import { cn } from '@ohmypos/ui/lib/utils';

interface PeriodNavigatorProps {
  period: string; // YYYY-MM
  onPeriodChange: (newPeriod: string) => void;
  disabled?: boolean;
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

function getAdjacentMonth(period: string, delta: number): string {
  const [yearStr, monthStr] = period.split('-');
  const year = parseInt(yearStr ?? '2026', 10);
  const month = parseInt(monthStr ?? '1', 10); // 1-12

  const d = new Date(year, month - 1 + delta, 1);
  const nextYear = d.getFullYear();
  const nextMonth = String(d.getMonth() + 1).padStart(2, '0');
  return `${nextYear}-${nextMonth}`;
}

export function PeriodNavigator({
  period,
  onPeriodChange,
  disabled = false,
}: PeriodNavigatorProps) {
  const [yearStr, monthStr] = period.split('-');
  const selectedYear = parseInt(yearStr ?? '2026', 10);
  const selectedMonth = parseInt(monthStr ?? '1', 10);
  const [open, setOpen] = React.useState(false);
  const [viewYear, setViewYear] = React.useState(selectedYear);

  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    if (next) setViewYear(selectedYear);
  };

  const handleMonthClick = (month: number) => {
    onPeriodChange(`${viewYear}-${String(month).padStart(2, '0')}`);
    setOpen(false);
  };

  return (
    <div className="flex items-center justify-between gap-2 bg-surface-raised border border-border-default rounded-sm p-1 shadow-1 w-full h-6">
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="w-5 h-5 p-0"
        onClick={() => onPeriodChange(getAdjacentMonth(period, -1))}
        disabled={disabled}
        aria-label="Bulan sebelumnya"
      >
        <ChevronLeft className="size-4" />
      </Button>

      <Popover open={open} onOpenChange={handleOpenChange}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            className="h-8 w-60 sm:max-w-sm lg:w-45 gap-1.5 px-2 text-sm font-semibold text-text-primary hover:bg-surface-muted"
            disabled={disabled}
            aria-label="Pilih Bulan Periode"
          >
            <CalendarDays className="size-4 text-text-tertiary hidden sm:inline-block" />
            {MONTH_NAMES[selectedMonth - 1]} {selectedYear}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="center">
          {/* Year header */}
          <div className="flex items-center justify-between border-b border-border-default px-2 py-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 w-7 p-0"
              onClick={() => setViewYear((y) => y - 1)}
              aria-label="Tahun sebelumnya"
            >
              <ChevronLeft className="size-4" />
            </Button>
            <span className="text-sm font-semibold text-text-primary">
              {viewYear}
            </span>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 w-7 p-0"
              onClick={() => setViewYear((y) => y + 1)}
              aria-label="Tahun berikutnya"
            >
              <ChevronRight className="size-4" />
            </Button>
          </div>

          {/* Month grid — only month names, no dates/days */}
          <div className="grid grid-cols-3 gap-1 p-2 w-full">
            {MONTH_NAMES.map((name, index) => {
              const month = index + 1;
              const isSelected =
                month === selectedMonth && viewYear === selectedYear;
              return (
                <button
                  key={name}
                  type="button"
                  onClick={() => handleMonthClick(month)}
                  className={cn(
                    'rounded-sm px-2 py-2 text-sm font-medium transition-colors outline-none cursor-pointer w-22 h-8 text-center',
                    isSelected
                      ? 'bg-brand-primary text-white font-semibold shadow-1'
                      : 'text-text-primary hover:bg-surface-muted',
                  )}
                >
                  {name}
                </button>
              );
            })}
          </div>
        </PopoverContent>
      </Popover>

      <Button
        type="button"
        variant="outline"
        size="sm"
        className="h-5 w-5 p-0"
        onClick={() => onPeriodChange(getAdjacentMonth(period, 1))}
        disabled={disabled}
        aria-label="Bulan berikutnya"
      >
        <ChevronRight className="size-4" />
      </Button>
    </div>
  );
}
