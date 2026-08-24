import { AppShell } from '@/components/shell/AppShell';
import { getInitialTheme, requireRole } from '@/lib/session';

/** `(pos)/*` is accessible by KASIR and OWNER (ADR-011, System Design §5). */
export default async function PosLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireRole(['KASIR', 'OWNER']);
  const initialTheme = await getInitialTheme();
  return (
    <AppShell
      user={user}
      variant="pos"
      enableDarkMode
      initialTheme={initialTheme}
    >
      {children}
    </AppShell>
  );
}
