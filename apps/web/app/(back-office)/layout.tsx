import { AppShell } from '@/components/shell/AppShell';
import { getImpersonationLabel } from '@/lib/impersonation';
import { getInitialTheme, requireRole } from '@/lib/session';

/**
 * ADMIN and OWNER only; pages narrow further (System Design §5). The only route
 * group with dark mode.
 */
export default async function BackOfficeLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireRole(['ADMIN', 'OWNER']);
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
