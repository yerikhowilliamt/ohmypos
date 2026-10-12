import { Building2, Store } from 'lucide-react';
import { Badge } from '@ohmypos/ui/components/badge';

interface CentralBranchTagProps {
  branchId: string | null;
  branchName?: string | null;
}

/** Central vs branch tag with icon and label, not colour alone (design.md §19). */
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
