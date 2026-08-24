import path from 'node:path';
import { withSentryConfig } from '@sentry/nextjs';
import type { NextConfig } from 'next';

const securityHeaders = [
  {
    key: 'X-DNS-Prefetch-Control',
    value: 'on',
  },
  {
    key: 'X-Frame-Options',
    value: 'DENY',
  },
  {
    key: 'X-Content-Type-Options',
    value: 'nosniff',
  },
  {
    key: 'Referrer-Policy',
    value: 'strict-origin-when-cross-origin',
  },
  {
    key: 'Permissions-Policy',
    value: 'camera=(), microphone=(), geolocation=()',
  },
  {
    key: 'Content-Security-Policy',
    value:
      "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https://res.cloudinary.com; font-src 'self' data:; connect-src 'self' http://localhost:* http://127.0.0.1:* ws://localhost:* ws://127.0.0.1:*; frame-ancestors 'none';",
  },
];

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
  async redirects() {
    return [
      { source: '/users', destination: '/business/users', permanent: true },
      {
        source: '/branches',
        destination: '/business/branches',
        permanent: true,
      },
      { source: '/devices', destination: '/business/devices', permanent: true },
      {
        source: '/devices/attendance',
        destination: '/business/devices/attendance',
        permanent: true,
      },
      {
        source: '/leave-requests',
        destination: '/business/leave-requests',
        permanent: true,
      },
    ];
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: securityHeaders,
      },
    ];
  },
  images: {
    remotePatterns: [
      new URL('https://res.cloudinary.com/erz2stvz/image/upload/**'),
    ],
  },
};

export default withSentryConfig(nextConfig, {
  silent: true,
  tunnelRoute: '/monitoring-tunnel',
  disableLogger: true,
});
