import type { Metadata } from 'next';
import { TenantDetailClient } from './TenantDetailClient';

export const metadata: Metadata = {
  title: 'Detail Tenant',
  description: 'Pemakaian, status, dan jejak impersonasi satu tenant',
};

export default async function PlatformTenantDetailPage({
  params,
}: PageProps<'/platform/tenants/[id]'>) {
  const { id } = await params;
  return <TenantDetailClient tenantId={id} />;
}
