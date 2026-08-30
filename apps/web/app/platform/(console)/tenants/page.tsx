import type { Metadata } from 'next';
import { TenantsClient } from './TenantsClient';

export const metadata: Metadata = {
  title: 'Tenant',
  description: 'Daftar bisnis yang berjalan di atas OhMyPos',
};

export default function PlatformTenantsPage() {
  return <TenantsClient />;
}
