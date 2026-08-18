import { redirect } from 'next/navigation';
import { getSession } from '@/lib/session';

/**
 * Sends each role to its own landing screen (System Design §5): KASIR to the
 * POS, OWNER to the Dashboard, ADMIN into Data Master (ADMIN has no dashboard
 * access — AGENTS.md's deliberate v1 scope boundary).
 */
export default async function Home() {
  const user = await getSession();

  if (!user) {
    redirect('/login');
  }

  if (user.role === 'KASIR') {
    redirect('/sales');
  }
  if (user.role === 'OWNER') {
    redirect('/dashboard');
  }
  redirect('/master-data');
}
