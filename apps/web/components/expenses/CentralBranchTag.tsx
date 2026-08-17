import { Building2, Store } from 'lucide-react';
import { Badge } from '@ohmypos/ui/components/badge';

interface CentralBranchTagProps {
  branchId: string | null;
  branchName?: string | null;
}

/**
 * DESIGN.md §31 — CENTRAL/BRANCH must stay distinguishable without relying on
 * color alone, so each state carries its own icon and label in addition to
 * the badge tint (ADR-004's central-purchase marker is `branchId === null`).
 */
export function CentralBranchTag({
  branchId,
  branchName,
}: CentralBranchTagProps) {
  if (branchId === null) {
    return (
      <Badge variant="info" className="gap-1 text-[11px]">
        <Building2 className="size-3" />
        PUSAT
      </Badge>
    );
  }

  return (
    <Badge variant="outline" className="gap-1 text-[11px]">
      <Store className="size-3" />
      {branchName ?? 'CABANG'}
    </Badge>
  );
}
