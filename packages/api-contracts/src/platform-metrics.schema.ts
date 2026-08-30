import { z } from 'zod';
import { MoneyString } from './primitives';
import { TenantListItemSchema } from './tenant.schema';

/**
 * The platform dashboard's single aggregate call (ADR-025 §4).
 *
 * Cross-tenant aggregates are a plain `GROUP BY` here rather than N queries —
 * that was one of the stated reasons for choosing a shared database over
 * database-per-tenant, so this endpoint is where that benefit is actually
 * spent.
 *
 * `grossRevenue` sums non-voided sales across every tenant, matching how
 * `reports.service.ts` defines revenue (DEBT-010). It is a decimal string, not
 * a number, for the same reason every other money field is (Playbook §5) — the
 * sum across all tenants is the largest figure this system produces and the
 * worst place to hand a JSON double.
 */
export const PlatformMetricsOverviewSchema = z.object({
  tenantCount: z.number().int(),
  activeTenantCount: z.number().int(),
  suspendedTenantCount: z.number().int(),
  userCount: z.number().int(),
  saleCount: z.number().int(),
  grossRevenue: MoneyString,
  /** Newest tenants first — the operator's "what changed" list. */
  recentTenants: z.array(TenantListItemSchema),
});
export type PlatformMetricsOverview = z.infer<
  typeof PlatformMetricsOverviewSchema
>;
