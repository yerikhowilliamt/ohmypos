'use client';

import { useQuery } from '@tanstack/react-query';
import type { PlatformMetricsOverview } from '@ohmypos/api-contracts';
import { apiFetch } from '@/lib/api';
import { PLATFORM_TENANT_QUERY_KEYS } from './usePlatformTenants';

export function usePlatformMetrics() {
  return useQuery({
    queryKey: PLATFORM_TENANT_QUERY_KEYS.metrics,
    queryFn: () =>
      apiFetch<PlatformMetricsOverview>('/platform/metrics/overview'),
  });
}
