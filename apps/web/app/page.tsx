import { redirect } from 'next/navigation';
import { getSession } from '@/lib/session';

/**
 * Sends each role to its own landing screen (System Design §5): KASIR to the
 * POS, ADMIN and OWNER into the back office.
 */
export default async function Home() {
  const user = await getSession();

  if (!user) {
    redirect('/login');
  }

  redirect(user.role === 'KASIR' ? '/sales' : '/master-data');
}
