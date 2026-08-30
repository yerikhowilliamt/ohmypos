'use client';

import Link from 'next/link';
import { Building2, CircleAlert, Receipt, Users, Wallet } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Skeleton } from '@ohmypos/ui/components/skeleton';
import { usePlatformMetrics } from '@/hooks/usePlatformMetrics';
import { formatCurrency, formatThousands } from '@/lib/formatters';
import { TenantStatusBadge } from '@/components/platform/TenantStatusBadge';

/**
 * ADR-025 §4 — the operator's landing screen.
 *
 * Everything here is a cross-tenant aggregate, which is the one thing a
 * database-per-tenant design would have made hard and this one makes a
 * `GROUP BY` (ADR-025, Consequences). Figures are computed at query time
 * (ADR-008); nothing is cached client-side beyond TanStack's default.
 */
export function PlatformOverviewClient() {
  const { data, isLoading, isError, error } = usePlatformMetrics();

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6">
      <header className="space-y-1">
        <h1 className="font-serif text-2xl font-semibold text-text-primary">
          Ringkasan Platform
        </h1>
        <p className="text-sm text-text-secondary">
          Angka gabungan dari seluruh tenant yang berjalan di atas OhMyPos.
        </p>
      </header>

      {isError && (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-sm border border-status-danger/30 bg-status-danger/10 p-4 text-sm text-status-danger"
        >
          <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
          <span>
            {error instanceof Error
              ? error.message
              : 'Data ringkasan belum bisa dimuat.'}
          </span>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          icon={Building2}
          label="Tenant aktif"
          value={
            data ? `${data.activeTenantCount} / ${data.tenantCount}` : undefined
          }
          hint={
            data && data.suspendedTenantCount > 0
              ? `${data.suspendedTenantCount} ditangguhkan`
              : 'Tidak ada yang ditangguhkan'
          }
          isLoading={isLoading}
        />
        <MetricCard
          icon={Users}
          label="Pengguna aktif"
          value={data ? formatThousands(data.userCount) : undefined}
          hint="Seluruh tenant"
          isLoading={isLoading}
        />
        <MetricCard
          icon={Receipt}
          label="Transaksi penjualan"
          value={data ? formatThousands(data.saleCount) : undefined}
          hint="Tidak termasuk yang dibatalkan"
          isLoading={isLoading}
        />
        <MetricCard
          icon={Wallet}
          label="Omzet kotor"
          value={data ? formatCurrency(data.grossRevenue) : undefined}
          hint="Tidak termasuk yang dibatalkan"
          isLoading={isLoading}
        />
      </div>

      <section className="rounded-md border border-border-default bg-surface-raised">
        <div className="flex items-center justify-between border-b border-border-default px-4 py-3">
          <h2 className="text-sm font-semibold text-text-primary">
            Tenant terbaru
          </h2>
          <Link
            href="/platform/tenants"
            className="text-xs font-medium text-brand-primary hover:underline"
          >
            Lihat semua
          </Link>
        </div>

        {isLoading && (
          <div className="space-y-2 p-4">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        )}

        {data && data.recentTenants.length === 0 && (
          <p className="p-6 text-center text-sm text-text-tertiary">
            Belum ada tenant. Buat yang pertama dari halaman Tenant.
          </p>
        )}

        {data && data.recentTenants.length > 0 && (
          <ul className="divide-y divide-border-default">
            {data.recentTenants.map((tenant) => (
              <li key={tenant.id}>
                <Link
                  href={`/platform/tenants/${tenant.id}`}
                  className="flex items-center justify-between gap-3 px-4 py-3 transition-colors hover:bg-surface-muted"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium text-text-primary">
                      {tenant.name}
                    </span>
                    <span className="block truncate font-mono text-[11px] text-text-tertiary">
                      {tenant.slug}
                    </span>
                  </span>
                  <span className="flex shrink-0 items-center gap-3">
                    <span className="hidden font-mono text-xs text-text-secondary sm:inline">
                      {tenant.userCount} pengguna · {tenant.saleCount} transaksi
                    </span>
                    <TenantStatusBadge status={tenant.status} />
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function MetricCard({
  icon: Icon,
  label,
  value,
  hint,
  isLoading,
}: {
  icon: LucideIcon;
  label: string;
  value: string | undefined;
  hint: string;
  isLoading: boolean;
}) {
  return (
    <div className="rounded-md border border-border-default bg-surface-raised p-4">
      <div className="flex items-center gap-2 text-text-tertiary">
        <Icon className="size-4" aria-hidden />
        <span className="text-xs font-medium uppercase tracking-wide">
          {label}
        </span>
      </div>
      {isLoading ? (
        <Skeleton className="mt-2 h-7 w-24" />
      ) : (
        <p className="mt-2 font-mono text-xl font-semibold text-text-primary">
          {value ?? '—'}
        </p>
      )}
      <p className="mt-1 text-[11px] text-text-tertiary">{hint}</p>
    </div>
  );
}
