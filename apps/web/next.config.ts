import path from 'node:path';
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Workspace packages ship TypeScript source rather than a build step, so Next
  // compiles them itself (ADR-002 — shared packages, one repo).
  transpilePackages: ['@ohmypos/ui'],
  // Emits a self-contained .next/standalone server (only the node_modules
  // actually used) so the production Docker image doesn't ship the whole
  // workspace's dependency tree.
  output: 'standalone',
  // pnpm hoists/symlinks workspace deps up to the repo root — without this,
  // file tracing anchors on apps/web and misses them.
  outputFileTracingRoot: path.join(__dirname, '../../'),
};

export default nextConfig;
