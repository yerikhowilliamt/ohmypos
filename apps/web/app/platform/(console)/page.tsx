import type { Metadata } from 'next';
import { PlatformOverviewClient } from './PlatformOverviewClient';

export const metadata: Metadata = {
  title: 'Ringkasan Platform',
  description: 'Agregat lintas tenant untuk operator OhMyPos',
};

export default function PlatformOverviewPage() {
  return <PlatformOverviewClient />;
}
