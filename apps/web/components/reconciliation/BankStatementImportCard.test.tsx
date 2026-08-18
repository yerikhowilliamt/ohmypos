import * as React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import type { AccountResponse } from '@ohmypos/api-contracts';
import { renderWithClient } from '@/test/test-utils';
import { BankStatementImportCard } from './BankStatementImportCard';
import * as apiModule from '@/lib/api';

vi.mock('@/lib/api', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api')>('@/lib/api');
  return { ...actual, apiFetch: vi.fn() };
});

const accounts: AccountResponse[] = [
  {
    id: 'cccccccc-1111-4111-8111-111111111111',
    name: 'BCA Operasional',
    type: 'BANK',
    openingBalance: '0.00',
    createdAt: '2026-08-16T00:00:00.000Z',
    updatedAt: '2026-08-16T00:00:00.000Z',
  },
];

describe('BankStatementImportCard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('posts the CSV as multipart FormData under the field name "file"', async () => {
    vi.mocked(apiModule.apiFetch).mockResolvedValue({
      imported: 12,
      skipped: 3,
      total: 15,
    });

    renderWithClient(<BankStatementImportCard accounts={accounts} />);

    fireEvent.click(screen.getByLabelText(/akun bank/i));
    fireEvent.click(
      await screen.findByRole('option', { name: accounts[0].name }),
    );
    fireEvent.change(screen.getByTestId('import-file-input'), {
      target: {
        files: [new File(['tanggal,jumlah\n2026-02-01,1000'], 'bca.csv')],
      },
    });

    fireEvent.click(screen.getByRole('button', { name: /impor csv/i }));

    await waitFor(() => {
      expect(apiModule.apiFetch).toHaveBeenCalledWith(
        `/import/csv/${accounts[0].id}?format=BCA`,
        expect.objectContaining({ method: 'POST' }),
      );
    });

    const call = vi.mocked(apiModule.apiFetch).mock.calls[0];
    const body = call?.[1]?.body;
    expect(body).toBeInstanceOf(FormData);
    expect((body as FormData).get('file')).toBeInstanceOf(File);
    // No explicit Content-Type — the browser must set the multipart boundary.
    expect(call?.[1]?.headers).toBeUndefined();

    expect(await screen.findByTestId('import-result')).toHaveTextContent('12');
    expect(screen.getByTestId('import-result')).toHaveTextContent('3');
  });

  it('surfaces a failed import without clearing the form', async () => {
    vi.mocked(apiModule.apiFetch).mockRejectedValue(
      new apiModule.ApiError('Unsupported format: XYZ', 400),
    );

    renderWithClient(<BankStatementImportCard accounts={accounts} />);

    fireEvent.click(screen.getByLabelText(/akun bank/i));
    fireEvent.click(
      await screen.findByRole('option', { name: accounts[0].name }),
    );
    fireEvent.change(screen.getByTestId('import-file-input'), {
      target: { files: [new File(['x'], 'bca.csv')] },
    });
    fireEvent.click(screen.getByRole('button', { name: /impor csv/i }));

    expect(await screen.findByTestId('import-error')).toHaveTextContent(
      /unsupported format/i,
    );
  });

  it('requires an account before the import button becomes enabled', () => {
    renderWithClient(<BankStatementImportCard accounts={accounts} />);

    fireEvent.change(screen.getByTestId('import-file-input'), {
      target: { files: [new File(['x'], 'bca.csv')] },
    });

    expect(screen.getByRole('button', { name: /impor csv/i })).toBeDisabled();
  });
});
