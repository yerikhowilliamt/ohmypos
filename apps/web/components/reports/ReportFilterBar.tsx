'use client';

import * as React from 'react';
import type { BranchResponse } from '@ohmypos/api-contracts';
import { DatePicker } from '@ohmypos/ui/components/date-picker';
import { Label } from '@ohmypos/ui/components/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@ohmypos/ui/components/select';
import { AlertCircle } from 'lucide-react';
import { ScopeHint } from '@/components/branches/ScopeHint';

/** Sentinel Select value for "all branches" — Radix Select rejects an empty string value. */
export const ALL_BRANCHES_VALUE = 'ALL';

interface ReportFilterBarProps {
  startDate: string;
  endDate: string;
  branchId?: string;
  branches: BranchResponse[];
  onStartDateChange: (value: string) => void;
  onEndDateChange: (value: string) => void;
  onBranchChange: (branchId: string | undefined) => void;
  disabled?: boolean;
}

/**
 * Shared date-range + branch filter for every Dashboard 3 report view
 * (PRD §5.4: "support filtering by date range and (where applicable)
 * branch"). One instance sits above the report Tabs in ReportsClient — every
 * report reads the same {startDate, endDate, branchId} rather than each view
 * carrying its own filter UI.
 */
export function ReportFilterBar({
  startDate,
  endDate,
  branchId,
  branches,
  onStartDateChange,
  onEndDateChange,
  onBranchChange,
  disabled = false,
}: ReportFilterBarProps) {
  const isRangeInvalid = Boolean(startDate && endDate && startDate > endDate);
  const hasSystemBranch = branches.some((b) => b.isSystem);

  return (
    <div className="rounded-md border border-border-default bg-surface-raised p-4">
      <div className="flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-end">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="report-start-date">Dari Tanggal</Label>
          <DatePicker
            id="report-start-date"
            value={startDate}
            onChange={(value) => onStartDateChange(value ?? '')}
            maxDate={endDate ? new Date(endDate) : undefined}
            ariaLabel="Dari tanggal"
            ariaInvalid={isRangeInvalid}
            className="sm:w-[180px]"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="report-end-date">Sampai Tanggal</Label>
          <DatePicker
            id="report-end-date"
            value={endDate}
            onChange={(value) => onEndDateChange(value ?? '')}
            minDate={startDate ? new Date(startDate) : undefined}
            ariaLabel="Sampai tanggal"
            ariaInvalid={isRangeInvalid}
            className="sm:w-[180px]"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="report-branch">Cabang</Label>
          <Select
            value={branchId ?? ALL_BRANCHES_VALUE}
            onValueChange={(value) =>
              onBranchChange(value === ALL_BRANCHES_VALUE ? undefined : value)
            }
            disabled={disabled}
          >
            <SelectTrigger id="report-branch" className="sm:w-[200px]">
              <SelectValue placeholder="Semua Cabang" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_BRANCHES_VALUE}>Semua Cabang</SelectItem>
              {branches.map((b) => (
                <SelectItem key={b.id} value={b.id}>
                  {b.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {hasSystemBranch && (
        <div className="mt-3">
          <ScopeHint>
            <strong className="font-medium text-text-primary">Umum</strong>{' '}
            berisi transaksi yang tidak dibebankan ke satu cabang, misalnya
            belanja bahan terpusat.{' '}
            <strong className="font-medium text-text-primary">
              Semua Cabang
            </strong>{' '}
            mencakup seluruh cabang beserta Umum.
          </ScopeHint>
        </div>
      )}

      {isRangeInvalid && (
        <div
          role="alert"
          className="mt-3 flex items-center gap-2 text-xs text-status-danger"
        >
          <AlertCircle className="size-3.5 shrink-0" />
          <span>
            Tanggal &quot;Sampai&quot; tidak boleh sebelum &quot;Dari&quot;.
          </span>
        </div>
      )}
    </div>
  );
}
