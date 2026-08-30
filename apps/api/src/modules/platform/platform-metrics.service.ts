import { Injectable } from '@nestjs/common';
import type {
  PlatformMetricsOverview,
  TenantListItem,
} from '@ohmypos/api-contracts';
import { UnscopedPrismaService } from '../../common/prisma/prisma.service';
import { Prisma } from '../../generated/prisma/client';

const RECENT_TENANT_LIMIT = 5;

/**
 * ADR-025 §4 — the platform dashboard's aggregates.
 *
 * Every figure here is computed at query time, consistent with ADR-008. The
 * counts are cheap; `grossRevenue` is a single indexed aggregate over `sales`.
 * If this endpoint ever becomes the slow one, that is the signal to revisit
 * ADR-008 for the platform layer specifically — not to cache it here.
 */
@Injectable()
export class PlatformMetricsService {
  // Cross-tenant by definition.
  constructor(private readonly prisma: UnscopedPrismaService) {}

  async overview(): Promise<PlatformMetricsOverview> {
    const [
      tenantCount,
      activeTenantCount,
      suspendedTenantCount,
      userCount,
      saleCount,
      revenue,
      recent,
    ] = await Promise.all([
      this.prisma.tenant.count(),
      this.prisma.tenant.count({ where: { status: 'ACTIVE' } }),
      this.prisma.tenant.count({ where: { status: 'SUSPENDED' } }),
      this.prisma.user.count({ where: { isActive: true } }),
      this.prisma.sale.count({ where: { status: { not: 'VOIDED' } } }),
      // VOIDED excluded so this agrees with what each tenant sees in its own
      // profit-and-loss report (DEBT-010).
      this.prisma.sale.aggregate({
        where: { status: { not: 'VOIDED' } },
        _sum: { totalAmount: true },
      }),
      this.prisma.tenant.findMany({
        take: RECENT_TENANT_LIMIT,
        orderBy: { createdAt: 'desc' },
        include: {
          _count: { select: { users: true, branches: true, sales: true } },
        },
      }),
    ]);

    const recentTenants: TenantListItem[] = recent.map((tenant) => ({
      id: tenant.id,
      name: tenant.name,
      slug: tenant.slug,
      status: tenant.status,
      createdAt: tenant.createdAt,
      updatedAt: tenant.updatedAt,
      userCount: tenant._count.users,
      branchCount: tenant._count.branches,
      saleCount: tenant._count.sales,
    }));

    return {
      tenantCount,
      activeTenantCount,
      suspendedTenantCount,
      userCount,
      saleCount,
      // `.toFixed(2)` rather than the Decimal's own JSON form: Playbook §5
      // requires the exact scale of the column to cross the boundary, and
      // Prisma.Decimal's default serialisation drops trailing zeroes.
      grossRevenue: (revenue._sum.totalAmount ?? new Prisma.Decimal(0)).toFixed(
        2,
      ),
      recentTenants,
    };
  }
}
