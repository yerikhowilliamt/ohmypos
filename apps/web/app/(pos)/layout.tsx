import { requireRole } from '@/lib/session';

/** `(pos)/*` is KASIR-only (System Design §5, ADR-011). */
export default async function PosLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireRole(['KASIR']);
  return <>{children}</>;
}
