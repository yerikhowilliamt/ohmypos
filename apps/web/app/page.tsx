import { redirect } from 'next/navigation';
import { getSession } from '@/lib/session';

/** Role landing: KASIR → POS, OWNER → Dashboard, ADMIN → Data Master. */
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
