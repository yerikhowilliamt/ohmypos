import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Workspace packages ship TypeScript source rather than a build step, so Next
  // compiles them itself (ADR-002 — shared packages, one repo).
  transpilePackages: ['@ohmypos/ui'],
};

export default nextConfig;
