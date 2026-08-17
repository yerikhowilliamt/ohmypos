'use client';

import * as React from 'react';
import { Button } from '@ohmypos/ui/components/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@ohmypos/ui/components/table';
import { Badge } from '@ohmypos/ui/components/badge';
import { Plus } from 'lucide-react';
import { formatCurrency } from '@/lib/formatters';
import { formatLedgerSourceType } from '@/lib/vocabulary';
import { useLedgerEntries } from '@/hooks/useExpenses';
import { GeneralExpenseFormDialog } from './GeneralExpenseFormDialog';

export function GeneralExpenseTab() {
  const [isCreateOpen, setIsCreateOpen] = React.useState(false);
  const { data, isLoading } = useLedgerEntries();
  const entries = data?.data ?? [];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-text-primary">
            Pengeluaran Umum
          </h2>
          <p className="text-xs text-text-secondary">
            Semua pengeluaran (OUTFLOW) — manual maupun hasil
            pembelian/pelunasan utang.
          </p>
        </div>
        <Button
          onClick={() => setIsCreateOpen(true)}
          className="gap-2 shrink-0"
        >
          <Plus className="size-4" />
          Tambah Pengeluaran
        </Button>
      </div>

      <div className="rounded-md border border-border-default bg-surface-raised shadow-1 overflow-hidden">
        <Table className="min-w-[640px]">
          <TableHeader>
            <TableRow>
              <TableHead className="min-w-[120px]">Tanggal</TableHead>
              <TableHead className="min-w-[220px]">Catatan</TableHead>
              <TableHead className="min-w-[140px]">Sumber</TableHead>
              <TableHead className="text-right min-w-[140px]">Jumlah</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell
                  colSpan={4}
                  className="h-32 text-center text-text-secondary"
                >
                  Memuat data pengeluaran…
                </TableCell>
              </TableRow>
            ) : entries.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={4}
                  className="h-32 text-center text-text-secondary"
                >
                  Belum ada pengeluaran tercatat.
                </TableCell>
              </TableRow>
            ) : (
              entries.map((entry) => (
                <TableRow key={entry.id}>
                  <TableCell className="text-text-secondary">
                    {new Date(entry.entryDate).toLocaleDateString('id-ID')}
                  </TableCell>
                  <TableCell className="text-text-primary">
                    {entry.note ?? (
                      <span className="text-text-tertiary">—</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={
                        entry.sourceType === 'MANUAL' ? 'outline' : 'secondary'
                      }
                      className="text-[11px]"
                    >
                      {formatLedgerSourceType(entry.sourceType)}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right numeric font-mono font-medium text-accent-outflow">
                    {formatCurrency(entry.amount)}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <GeneralExpenseFormDialog
        open={isCreateOpen}
        onOpenChange={setIsCreateOpen}
      />
    </div>
  );
}
