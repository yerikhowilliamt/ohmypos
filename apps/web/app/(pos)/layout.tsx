import { AppShell } from '@/components/shell/AppShell';
import { requireRole } from '@/lib/session';

/** `(pos)/*` is KASIR-only (System Design §5, ADR-011). */
export default async function PosLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireRole(['KASIR']);
  return <AppShell user={user}>{children}</AppShell>;
}
