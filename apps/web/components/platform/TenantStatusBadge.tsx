import type { TenantStatus } from '@ohmypos/api-contracts';
import { Badge } from '@ohmypos/ui/components/badge';

/** `TenantStatus` → label and colour, in one place. */
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
