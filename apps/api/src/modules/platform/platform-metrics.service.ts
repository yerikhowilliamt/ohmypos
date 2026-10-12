import { Injectable } from '@nestjs/common';
import type {
  PlatformMetricsOverview,
  TenantListItem,
} from '@ohmypos/api-contracts';
import { UnscopedPrismaService } from '../../common/prisma/prisma.service';
import { Prisma } from '../../generated/prisma/client';

const RECENT_TENANT_LIMIT = 5;

/** Cross-tenant dashboard aggregates, computed at query time (ADR-008). */
@Injectable()
export class PlatformMetricsService {
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
      // VOIDED excluded to match tenant P&L reports (DEBT-010).
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
      grossRevenue: (revenue._sum.totalAmount ?? new Prisma.Decimal(0)).toFixed(
        2,
      ),
      recentTenants,
    };
  }
}
