import { AppShell } from '@/components/shell/AppShell';
import { getImpersonationLabel } from '@/lib/impersonation';
import { getInitialTheme, requireRole } from '@/lib/session';

/** Routes for every authenticated role (profile, help). */
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
