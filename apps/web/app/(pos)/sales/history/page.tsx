import { redirect } from 'next/navigation';
import { getSession } from '@/lib/session';
import { SalesHistoryClient } from './SalesHistoryClient';

/**
 * Sales History page (/sales/history).
 * Available for KASIR and OWNER.
 */
export default async function SalesHistoryPage() {
  const user = await getSession();

  if (!user) {
    redirect('/login');
  }

  return <SalesHistoryClient user={user} />;
}
