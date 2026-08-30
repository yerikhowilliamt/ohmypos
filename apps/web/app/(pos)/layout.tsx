import { AppShell } from '@/components/shell/AppShell';
import { getImpersonationLabel } from '@/lib/impersonation';
import { getInitialTheme, requireRole } from '@/lib/session';

/** `(pos)/*` is accessible by KASIR and OWNER (ADR-011, System Design §5). */
export default async function PosLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireRole(['KASIR', 'OWNER']);
  const initialTheme = await getInitialTheme();
  // ADR-025 Decision 8 — an impersonated OWNER can reach the POS too, and the
  // banner has to follow them there: a read-only till that silently refuses
  // every sale is worse than one that says why.
  const impersonatedLabel = await getImpersonationLabel();
  return (
    <AppShell
      user={user}
      variant="pos"
      enableDarkMode
      initialTheme={initialTheme}
      impersonatedLabel={impersonatedLabel}
    >
      {children}
    </AppShell>
  );
}
