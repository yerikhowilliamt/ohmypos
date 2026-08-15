import { requireRole } from '@/lib/session';

/**
 * Everything under `(back-office)` excludes KASIR. Individual routes narrow it
 * further — reports, inventory, expenses and users are OWNER-only, while
 * ADMIN also gets master data and reconciliation (System Design §5).
 */
export default async function BackOfficeLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireRole(['ADMIN', 'OWNER']);
  return <>{children}</>;
}
