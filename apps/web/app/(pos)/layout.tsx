import { AppShell } from '@/components/shell/AppShell';
import { requireRole } from '@/lib/session';

/** `(pos)/*` is accessible by KASIR and OWNER (ADR-011, System Design §5). */
export default async function PosLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireRole(['KASIR', 'OWNER']);
  return <AppShell user={user}>{children}</AppShell>;
}
