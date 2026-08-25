import * as React from 'react';
import { fireEvent, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CategoryResponse } from '@ohmypos/api-contracts';
import { renderWithClient } from '@/test/test-utils';
import { ExpenseCategoriesTable } from './ExpenseCategoriesTable';

vi.mock('@/lib/api', () => ({
  apiFetch: vi.fn(),
  API_BASE_URL: 'http://localhost:4015/api/v1',
}));

const categories: CategoryResponse[] = [
  {
    id: '11111111-1111-4111-8111-111111111111',
    name: 'Pembelian Bahan Baku',
    type: 'OUTFLOW',
    isSystem: true,
    createdAt: '2026-08-25T00:00:00.000Z',
    updatedAt: '2026-08-25T00:00:00.000Z',
  },
  {
    id: '22222222-2222-4222-8222-222222222222',
    name: 'Operasional',
    type: 'OUTFLOW',
    isSystem: false,
    createdAt: '2026-08-25T00:00:00.000Z',
    updatedAt: '2026-08-25T00:00:00.000Z',
  },
];

describe('ExpenseCategoriesTable', () => {
  beforeEach(() => vi.clearAllMocks());

  it('labels system categories and hides their edit/delete actions', () => {
    renderWithClient(<ExpenseCategoriesTable categories={categories} />);

    expect(screen.getByText('Sistem')).toBeDefined();
    expect(screen.getByText('Dilindungi sistem')).toBeDefined();
    expect(
      screen.queryByRole('button', {
        name: 'Edit Pembelian Bahan Baku',
      }),
    ).toBeNull();
    expect(
      screen.getByRole('button', { name: 'Edit Operasional' }),
    ).toBeDefined();
  });

  it('opens the create dialog with an outflow-specific form', () => {
    renderWithClient(<ExpenseCategoriesTable categories={categories} />);

    fireEvent.click(screen.getByRole('button', { name: 'Tambah Kategori' }));

    expect(
      screen.getByRole('heading', { name: 'Tambah Kategori Pengeluaran' }),
    ).toBeDefined();
    expect(screen.getByLabelText('Nama kategori')).toBeDefined();
  });

  it('opens delete confirmation only for an ordinary category', () => {
    renderWithClient(<ExpenseCategoriesTable categories={categories} />);

    fireEvent.click(screen.getByRole('button', { name: 'Hapus Operasional' }));

    expect(
      screen.getByRole('heading', { name: 'Hapus Kategori Pengeluaran' }),
    ).toBeDefined();
    expect(screen.getByText('"Operasional"')).toBeDefined();
  });
});
