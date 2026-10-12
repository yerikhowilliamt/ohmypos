import { PlatformShell } from '@/components/platform/PlatformShell';
import { requirePlatformAdmin } from '@/lib/platform-session';

/**
 * Every `/platform` page except login. A route group under a literal `platform/`
 * segment, so URLs keep the `/platform` prefix that `proxy.ts` gates on.
 */
export default async function PlatformConsoleLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const admin = await requirePlatformAdmin();
  return <PlatformShell admin={admin}>{children}</PlatformShell>;
}
