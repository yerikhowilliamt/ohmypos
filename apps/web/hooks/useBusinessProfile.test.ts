import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestQueryClient } from '@/test/test-utils';
import { QueryClientProvider } from '@tanstack/react-query';
import * as React from 'react';
import {
  useBusinessProfile,
  useUpdateBusinessProfile,
  useUploadBusinessLogo,
} from './useBusinessProfile';
import { apiFetch } from '@/lib/api';

vi.mock('@/lib/api', () => ({
  apiFetch: vi.fn(),
}));

function createWrapper() {
  const queryClient = createTestQueryClient();
  return function TestWrapper({ children }: { children: React.ReactNode }) {
    return React.createElement(
      QueryClientProvider,
      { client: queryClient },
      children,
    );
  };
}

describe('useBusinessProfile', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('fetches current business profile', async () => {
    const mockProfile = {
      id: 'biz-1',
      name: 'Kedai Kopi',
      logoUrl: null,
      address: 'Jl. Merdeka No. 1',
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
    };
    vi.mocked(apiFetch).mockResolvedValueOnce(mockProfile);

    const { result } = renderHook(() => useBusinessProfile(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(mockProfile);
    expect(apiFetch).toHaveBeenCalledWith('/business-profile');
  });

  it('updates business profile', async () => {
    const updatedProfile = {
      id: 'biz-1',
      name: 'Kedai Kopi Baru',
      logoUrl: null,
      address: 'Jl. Baru No. 2',
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-02T00:00:00Z',
    };
    vi.mocked(apiFetch).mockResolvedValueOnce(updatedProfile);

    const { result } = renderHook(() => useUpdateBusinessProfile(), {
      wrapper: createWrapper(),
    });

    result.current.mutate({
      name: 'Kedai Kopi Baru',
      address: 'Jl. Baru No. 2',
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(apiFetch).toHaveBeenCalledWith('/business-profile', {
      method: 'PATCH',
      body: JSON.stringify({
        name: 'Kedai Kopi Baru',
        address: 'Jl. Baru No. 2',
      }),
    });
  });

  it('uploads logo file via FormData', async () => {
    const logoResponse = { logoUrl: 'http://example.com/logo.png' };
    vi.mocked(apiFetch).mockResolvedValueOnce(logoResponse);

    const { result } = renderHook(() => useUploadBusinessLogo(), {
      wrapper: createWrapper(),
    });

    const file = new File(['dummy'], 'logo.png', { type: 'image/png' });
    result.current.mutate(file);

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(apiFetch).toHaveBeenCalledWith(
      '/business-profile/logo',
      expect.objectContaining({
        method: 'POST',
        body: expect.any(FormData),
      }),
    );
  });
});
