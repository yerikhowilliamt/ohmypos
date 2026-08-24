import { describe, expect, it } from 'vitest';
import {
  BROWSER_API_BASE_URL,
  normalizeBackendApiBaseUrl,
  resolveBackendApiBaseUrl,
} from './api-url';

describe('API URL routing', () => {
  it('keeps browser API calls on the Next.js origin', () => {
    expect(BROWSER_API_BASE_URL).toBe('/api/v1');
  });

  it('normalizes a backend origin for the reverse proxy', () => {
    expect(normalizeBackendApiBaseUrl('https://api.example.com/')).toBe(
      'https://api.example.com/api/v1',
    );
    expect(normalizeBackendApiBaseUrl('https://api.example.com/api/v1/')).toBe(
      'https://api.example.com/api/v1',
    );
  });

  it('prefers the server-only backend URL over legacy public configuration', () => {
    expect(
      resolveBackendApiBaseUrl({
        INTERNAL_API_BASE_URL: 'https://internal.example.com',
        NEXT_PUBLIC_API_BASE_URL: 'https://legacy.example.com/api/v1',
      }),
    ).toBe('https://internal.example.com/api/v1');
  });

  it('rejects a relative backend target that would recursively hit Next.js', () => {
    expect(() => normalizeBackendApiBaseUrl('/api/v1')).toThrow();
  });
});
