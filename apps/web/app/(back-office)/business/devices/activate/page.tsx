import type { Metadata } from 'next';
import { requireRole } from '@/lib/session';
import { ActivateDeviceClient } from './ActivateDeviceClient';

export const metadata: Metadata = {
  title: 'Aktivasi Perangkat — OhMyPos',
};

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ code?: string }>;
}) {
  await requireRole(['OWNER']);
  const { code } = await searchParams;

  return (
    <main className="flex flex-1 items-center justify-center p-4">
      <ActivateDeviceClient code={code ?? ''} />
    </main>
  );
}
