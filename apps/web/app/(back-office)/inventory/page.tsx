import { requireRole } from '@/lib/session';

export default async function Page() {
  await requireRole(['OWNER']);

  return (
    <main className="flex-1 p-6">
      <h1 className="text-xl font-bold text-text-primary">Inventori</h1>
      <p className="mt-2 text-sm text-text-secondary">Dibangun di Phase 3.</p>
    </main>
  );
}
