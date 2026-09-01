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

    fireEvent.click(screen.getByRole('button', { name: /impor mutasi/i }));

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
    fireEvent.click(screen.getByRole('button', { name: /impor mutasi/i }));

    expect(await screen.findByTestId('import-error')).toHaveTextContent(
      /unsupported format/i,
    );
  });

  it('posts a PDF format to the PDF route and offers a .pdf file picker', async () => {
    vi.mocked(apiModule.apiFetch).mockResolvedValue({
      imported: 57,
      skipped: 0,
      total: 57,
    });

    renderWithClient(<BankStatementImportCard accounts={accounts} />);

    fireEvent.click(screen.getByLabelText(/akun bank/i));
    fireEvent.click(
      await screen.findByRole('option', { name: accounts[0].name }),
    );

    fireEvent.click(screen.getByLabelText(/format bank/i));
    fireEvent.click(
      await screen.findByRole('option', { name: /mandiri \(pdf/i }),
    );

    // The picker must follow the chosen format, not stay on CSV.
    expect(screen.getByTestId('import-file-input')).toHaveAttribute(
      'accept',
      '.pdf,application/pdf',
    );

    fireEvent.change(screen.getByTestId('import-file-input'), {
      target: { files: [new File(['%PDF-1.5'], 'mutasi.pdf')] },
    });

    const passwordInput = screen.getByTestId('import-password-input');
    expect(passwordInput).toBeInTheDocument();
    fireEvent.change(passwordInput, { target: { value: '010190' } });

    fireEvent.click(screen.getByRole('button', { name: /impor mutasi/i }));

    await waitFor(() => {
      expect(apiModule.apiFetch).toHaveBeenCalledWith(
        `/import/pdf/${accounts[0].id}?format=MANDIRI_PDF&password=010190`,
        expect.objectContaining({ method: 'POST' }),
      );
    });
  });

  it('routes the BCA PDF format to the PDF route, not the CSV one', async () => {
    // `BCA` and `BCA_PDF` differ only by container, so a picker that keyed off
    // the bank name rather than `BANK_IMPORT_FORMATS.container` would send this
    // to /import/csv and the API would reject it as a PDF fed to a CSV parser.
    vi.mocked(apiModule.apiFetch).mockResolvedValue({
      imported: 63,
      skipped: 0,
      total: 63,
    });

    renderWithClient(<BankStatementImportCard accounts={accounts} />);

    fireEvent.click(screen.getByLabelText(/akun bank/i));
    fireEvent.click(
      await screen.findByRole('option', { name: accounts[0].name }),
    );

    fireEvent.click(screen.getByLabelText(/format bank/i));
    fireEvent.click(await screen.findByRole('option', { name: /bca \(pdf/i }));

    expect(screen.getByTestId('import-file-input')).toHaveAttribute(
      'accept',
      '.pdf,application/pdf',
    );

    fireEvent.change(screen.getByTestId('import-file-input'), {
      target: { files: [new File(['%PDF-1.5'], 'mutasi-bca.pdf')] },
    });

    fireEvent.click(screen.getByRole('button', { name: /impor mutasi/i }));

    await waitFor(() => {
      expect(apiModule.apiFetch).toHaveBeenCalledWith(
        `/import/pdf/${accounts[0].id}?format=BCA_PDF`,
        expect.objectContaining({ method: 'POST' }),
      );
    });
  });

  it('drops an already-chosen file when the format changes', async () => {
    renderWithClient(<BankStatementImportCard accounts={accounts} />);

    fireEvent.click(screen.getByLabelText(/akun bank/i));
    fireEvent.click(
      await screen.findByRole('option', { name: accounts[0].name }),
    );
    fireEvent.change(screen.getByTestId('import-file-input'), {
      target: { files: [new File(['x'], 'bca.csv')] },
    });
    expect(screen.getByRole('button', { name: /impor mutasi/i })).toBeEnabled();

    // Switching to PDF must not leave the CSV staged for upload.
    fireEvent.click(screen.getByLabelText(/format bank/i));
    fireEvent.click(
      await screen.findByRole('option', { name: /mandiri \(pdf/i }),
    );

    expect(
      screen.getByRole('button', { name: /impor mutasi/i }),
    ).toBeDisabled();
  });

  it('requires an account before the import button becomes enabled', () => {
    renderWithClient(<BankStatementImportCard accounts={accounts} />);

    fireEvent.change(screen.getByTestId('import-file-input'), {
      target: { files: [new File(['x'], 'bca.csv')] },
    });

    expect(
      screen.getByRole('button', { name: /impor mutasi/i }),
    ).toBeDisabled();
  });
});
