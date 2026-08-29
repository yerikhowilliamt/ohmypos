import * as React from 'react';
import { screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { BranchResponse } from '@ohmypos/api-contracts';
import { renderWithClient } from '@/test/test-utils';
import { BranchesTable } from './BranchesTable';

vi.mock('@/lib/api', () => ({
  apiFetch: vi.fn(),
  API_BASE_URL: 'http://localhost:4015/api/v1',
}));

const base = {
  address: null,
  isSystem: false,
  createdAt: '2026-08-29T00:00:00.000Z',
  updatedAt: '2026-08-29T00:00:00.000Z',
};

const branches: BranchResponse[] = [
  {
    ...base,
    id: '11111111-1111-4111-8111-111111111111',
    name: 'Toko Melati',
    isMainStore: true,
  },
  {
    ...base,
    id: '22222222-2222-4222-8222-222222222222',
    name: 'Toko Kenanga',
    isMainStore: false,
  },
];

describe('BranchesTable', () => {
  beforeEach(() => vi.clearAllMocks());

  it('badges the main store and offers promotion only to the others', () => {
    renderWithClient(<BranchesTable branches={branches} />);

    expect(screen.getByText('Toko Utama')).toBeDefined();
    expect(screen.getByText('Cabang')).toBeDefined();

    // The holder cannot be promoted to what it already is.
    expect(
      screen.queryByRole('button', { name: 'Jadikan toko utama Toko Melati' }),
    ).toBeNull();
    expect(
      screen.getByRole('button', { name: 'Jadikan toko utama Toko Kenanga' }),
    ).toBeDefined();
  });

  it('keeps edit and delete available on every store', () => {
    renderWithClient(<BranchesTable branches={branches} />);
    expect(screen.getAllByRole('button', { name: 'Edit' })).toHaveLength(2);
    expect(screen.getAllByRole('button', { name: 'Hapus' })).toHaveLength(2);
  });
});
