import type { TenantStatus } from '@ohmypos/api-contracts';
import { Badge } from '@ohmypos/ui/components/badge';

/**
 * ADR-025 — one place that turns `TenantStatus` into words and colour, so the
 * dashboard, the list and the detail page cannot drift apart. Same reason
 * `lib/vocabulary.ts` exists for the tenant-facing enums (DEBT-003).
 */
const LABEL: Record<TenantStatus, string> = {
  ACTIVE: 'Aktif',
  SUSPENDED: 'Ditangguhkan',
};

export function TenantStatusBadge({ status }: { status: TenantStatus }) {
  return (
    <Badge variant={status === 'ACTIVE' ? 'success' : 'danger'}>
      {LABEL[status]}
    </Badge>
  );
}
