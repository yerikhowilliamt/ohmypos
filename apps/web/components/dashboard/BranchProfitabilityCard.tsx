'use client';

import * as React from 'react';
import Link from 'next/link';
import { useQueries } from '@tanstack/react-query';
import { useBranches } from '@/hooks/useBranches';
import { REPORTS_QUERY_KEYS } from '@/hooks/useReports';
import type { ProfitLossResponse } from '@ohmypos/api-contracts';
import { apiFetch } from '@/lib/api';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@ohmypos/ui/components/card';
import { Badge } from '@ohmypos/ui/components/badge';
import { Skeleton } from '@ohmypos/ui/components/skeleton';
import { formatCurrency } from '@/lib/formatters';
import { Building2, ArrowRight } from 'lucide-react';

interface BranchProfitabilityCardProps {
  range: { startDate: string; endDate: string };
}

export function BranchProfitabilityCard({
  range,
}: BranchProfitabilityCardProps) {
  const { data: branches = [], isLoading: isBranchesLoading } = useBranches();

  // Filter out Central / Pusat kitchen inventory pool
  const retailBranches = React.useMemo(
    () => branches.filter((b) => !b.name.toLowerCase().includes('pusat')),
    [branches],
  );

  const branchQueries = useQueries({
    queries: retailBranches.map((branch) => ({
      queryKey: REPORTS_QUERY_KEYS.profitLoss({
        ...range,
        branchId: branch.id,
      }),
      queryFn: () => {
        const params = new URLSearchParams({
          startDate: range.startDate,
          endDate: range.endDate,
          branchId: branch.id,
        });
        return apiFetch<ProfitLossResponse>(
          `/reports/profit-loss?${params.toString()}`,
        );
      },
      enabled: Boolean(branch.id && range.startDate && range.endDate),
    })),
  });

  const isLoading = isBranchesLoading || branchQueries.some((q) => q.isLoading);

  const branchResults = React.useMemo(() => {
    const list = retailBranches.map((branch, index) => {
      const plData = branchQueries[index]?.data;
      const netProfitNum = plData ? Number(plData.netProfit) : 0;
      const revenueNum = plData ? Number(plData.totalIncome) : 0;
      const isProfitable = netProfitNum > 0;

      return {
        name: branch.name,
        branchId: branch.id,
        revenue: plData ? plData.totalIncome : '0.00',
        revenueNum,
        netProfitNum,
        isProfitable,
      };
    });

    // Sort by revenue descending, take maximum 3
    return list.sort((a, b) => b.revenueNum - a.revenueNum).slice(0, 3);
  }, [retailBranches, branchQueries]);

  const maxRevenue = React.useMemo(() => {
    const values = branchResults.map((b) => b.revenueNum);
    return Math.max(...values, 100000);
  }, [branchResults]);

  return (
    <Card className="p-4 shadow-1 bg-surface-raised border-border-default">
      <CardHeader className="px-0 pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Building2 className="size-4 text-brand-primary" />
            <CardTitle className="text-sm font-semibold text-text-primary">
              Profitabilitas Cabang
            </CardTitle>
          </div>
          <Link
            href="/reports"
            className="text-xs text-brand-primary hover:underline inline-flex items-center gap-1"
          >
            Semua <ArrowRight className="size-3" />
          </Link>
        </div>
      </CardHeader>

      <CardContent className="px-0 pt-1">
        {isLoading ? (
          <div className="space-y-3">
            {[1, 2].map((n) => (
              <Skeleton key={n} className="h-12 w-full rounded-md" />
            ))}
          </div>
        ) : branchResults.length === 0 ? (
          <p className="text-xs text-text-secondary py-4 text-center">
            Belum ada data transaksi cabang bulan ini.
          </p>
        ) : (
          <div className="space-y-3.5">
            {branchResults.map((item) => {
              const widthPct = Math.min(
                100,
                Math.max(6, (item.revenueNum / maxRevenue) * 100),
              );

              return (
                <div key={item.branchId} className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-text-primary">
                        {item.name}
                      </span>
                      {item.isProfitable ? (
                        <Badge
                          variant="secondary"
                          className="h-5 px-2 text-[10px] font-semibold bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-950/50 dark:text-emerald-300 dark:border-emerald-800"
                        >
                          Profit
                        </Badge>
                      ) : (
                        <Badge
                          variant="destructive"
                          className="h-5 px-2 text-[10px] font-semibold"
                        >
                          Tidak Profit
                        </Badge>
                      )}
                    </div>

                    <div className="flex items-center gap-1.5 font-mono">
                      <span className="text-[11px] text-text-tertiary">
                        Omset:
                      </span>
                      <span className="font-semibold text-text-primary">
                        {formatCurrency(item.revenue)}
                      </span>
                    </div>
                  </div>

                  {/* Horizontal Bar */}
                  <div className="h-2 w-full overflow-hidden rounded-full bg-surface-muted">
                    <div
                      style={{ width: `${widthPct}%` }}
                      className={`h-full rounded-full transition-all duration-500 ${
                        item.isProfitable
                          ? 'bg-accent-inflow'
                          : 'bg-status-danger'
                      }`}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
