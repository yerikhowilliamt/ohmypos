import { AppShell } from '@/components/shell/AppShell';
import { getImpersonationLabel } from '@/lib/impersonation';
import { getInitialTheme, requireRole } from '@/lib/session';

/**
 * Routes reachable by every authenticated role — self-service profile (Phase
 * 10a) and the help page (Phase 13). Neither `(back-office)`
 * (`requireRole(['ADMIN', 'OWNER'])`) nor `(pos)` (`requireRole(['KASIR'])`)
 * admits all three roles, so a page every role needs cannot live in either
 * without excluding someone — this third group is `requireRole` with every
 * role listed, which is exactly "any authenticated user."
 */
export default async function SharedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireRole(['KASIR', 'ADMIN', 'OWNER']);
  const initialTheme = await getInitialTheme();
  // ADR-025 Decision 8 — null for every ordinary session, so the banner is
  // structurally absent rather than conditionally hidden.
  const impersonatedLabel = await getImpersonationLabel();
  return (
    <AppShell
      user={user}
      enableDarkMode
      initialTheme={initialTheme}
      impersonatedLabel={impersonatedLabel}
    >
      {children}
    </AppShell>
  );
}
