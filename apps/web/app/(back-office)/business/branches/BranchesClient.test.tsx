import * as React from 'react';
import { screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { BranchResponse } from '@ohmypos/api-contracts';
import { renderWithClient } from '@/test/test-utils';
import * as apiModule from '@/lib/api';
import { BranchesClient } from './BranchesClient';

vi.mock('@/lib/api', () => ({
  apiFetch: vi.fn(),
  API_BASE_URL: 'http://localhost:4015/api/v1',
}));

const base = {
  address: null,
  createdAt: '2026-08-29T00:00:00.000Z',
  updatedAt: '2026-08-29T00:00:00.000Z',
};

const branches: BranchResponse[] = [
  {
    ...base,
    id: '00000000-0000-4000-8000-000000000001',
    name: 'Umum',
    isSystem: true,
    isMainStore: false,
  },
  {
    ...base,
    id: '11111111-1111-4111-8111-111111111111',
    name: 'Toko Melati',
    isSystem: false,
    isMainStore: true,
  },
];

describe('BranchesClient', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(apiModule.apiFetch).mockResolvedValue(branches);
  });

  it('hides the system location from the store list', async () => {
    renderWithClient(<BranchesClient />);

    // The Owner's own store is listed…
    expect(await screen.findByText('Toko Melati')).toBeDefined();
    // …and the ledger scope is not, which is what made it look like a flagship
    // store that mysteriously could not sell anything.
    expect(screen.queryByText('Umum')).toBeNull();
  });
});
