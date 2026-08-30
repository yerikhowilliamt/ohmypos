import { PlatformShell } from '@/components/platform/PlatformShell';
import { requirePlatformAdmin } from '@/lib/platform-session';

/**
 * ADR-025 — everything under `/platform` except the login page.
 *
 * `(console)` is a route group, so it adds no URL segment: the pages inside it
 * are still `/platform`, `/platform/tenants`, `/platform/tenants/[id]`. That
 * prefix is load-bearing — `proxy.ts` gates on it, and the API's own routes sit
 * under `/api/v1/platform`.
 *
 * The plan sketched this as a top-level `app/(platform)/` group. That would
 * have put the dashboard at `/` (colliding with `app/page.tsx`, which is a
 * build error) and the tenant list at `/tenants`, which the plan's own proxy
 * rule — "path berawalan /platform" — would then never match. Nesting the group
 * under a literal `platform/` segment is what makes both halves of the plan
 * true at once.
 */
export default async function PlatformConsoleLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const admin = await requirePlatformAdmin();
  return <PlatformShell admin={admin}>{children}</PlatformShell>;
}
