import { z } from 'zod';
import { MoneyString } from './primitives';
import { TenantListItemSchema } from './tenant.schema';

/** Cross-tenant dashboard aggregates. `grossRevenue` excludes voided sales. */
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
