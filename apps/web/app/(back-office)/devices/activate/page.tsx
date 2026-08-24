import { redirect } from 'next/navigation';

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ code?: string }>;
}) {
  const { code } = await searchParams;
  redirect(
    code
      ? `/business/devices/activate?code=${encodeURIComponent(code)}`
      : '/business/devices/activate',
  );
}
