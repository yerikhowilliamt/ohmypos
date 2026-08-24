import { AppShell } from '@/components/shell/AppShell';
import { getInitialTheme, requireRole } from '@/lib/session';

/**
 * Everything under `(back-office)` excludes KASIR. Individual routes narrow it
 * further — reports, inventory, expenses and users are OWNER-only, while
 * ADMIN also gets master data and reconciliation (System Design §5).
 *
 * This is also the only layout that enables dark mode — night-shift back
 * office staff asked for it. POS and `(shared)` never read or forward the
 * theme cookie, so they can never render dark regardless of its value.
 */
export default async function BackOfficeLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireRole(['ADMIN', 'OWNER']);
  const initialTheme = await getInitialTheme();
  return (
    <AppShell user={user} enableDarkMode initialTheme={initialTheme}>
      {children}
    </AppShell>
  );
}
