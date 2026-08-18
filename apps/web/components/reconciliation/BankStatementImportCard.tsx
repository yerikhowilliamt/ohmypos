'use client';

import * as React from 'react';
import { Upload } from 'lucide-react';
import { Alert, AlertDescription } from '@ohmypos/ui/components/alert';
import { Button } from '@ohmypos/ui/components/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@ohmypos/ui/components/card';
import { Input } from '@ohmypos/ui/components/input';
import { Label } from '@ohmypos/ui/components/label';
import { NativeSelect } from '@ohmypos/ui/components/native-select';
import type { AccountResponse, ImportResult } from '@ohmypos/api-contracts';
import { useImportBankStatement } from '@/hooks/useReconciliation';

/** The two formats BankParserFactory actually supports (bank-parser.factory.ts:9). */
const FORMATS = ['BCA', 'MANDIRI'] as const;
type BankFormat = (typeof FORMATS)[number];

/** import.controller.ts:52 — MaxFileSizeValidator({ maxSize: 5 * 1024 * 1024 }). */
const MAX_FILE_BYTES = 5 * 1024 * 1024;

interface BankStatementImportCardProps {
  accounts: AccountResponse[];
  defaultAccountId?: string;
}

export function BankStatementImportCard({
  accounts,
  defaultAccountId,
}: BankStatementImportCardProps) {
  const [accountId, setAccountId] = React.useState(defaultAccountId ?? '');
  const [format, setFormat] = React.useState<BankFormat>('BCA');
  const [file, setFile] = React.useState<File | null>(null);
  const [result, setResult] = React.useState<ImportResult | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const importMutation = useImportBankStatement();

  const tooLarge = file !== null && file.size > MAX_FILE_BYTES;
  const canSubmit =
    accountId !== '' && file !== null && !tooLarge && !importMutation.isPending;

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!canSubmit || !file) return;

    setError(null);
    setResult(null);
    try {
      setResult(await importMutation.mutateAsync({ accountId, format, file }));
      setFile(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : 'Gagal mengimpor rekening koran.',
      );
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Impor Rekening Koran</CardTitle>
        <CardDescription>
          Unggah file CSV rekening koran (maks. 5 MB). Baris yang sudah pernah
          diimpor akan dilewati otomatis.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} noValidate className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label htmlFor="import-account">Akun Bank</Label>
              <NativeSelect
                id="import-account"
                value={accountId}
                onChange={(event) => setAccountId(event.target.value)}
              >
                <option value="">-- Pilih Akun --</option>
                {accounts.map((account) => (
                  <option key={account.id} value={account.id}>
                    {account.name}
                  </option>
                ))}
              </NativeSelect>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="import-format">Format Bank</Label>
              <NativeSelect
                id="import-format"
                value={format}
                onChange={(event) =>
                  setFormat(event.target.value as BankFormat)
                }
              >
                {FORMATS.map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </NativeSelect>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="import-file">File CSV</Label>
              <Input
                id="import-file"
                data-testid="import-file-input"
                ref={fileInputRef}
                type="file"
                accept=".csv,text/csv"
                onChange={(event) => setFile(event.target.files?.[0] ?? null)}
              />
            </div>
          </div>

          {tooLarge && (
            <Alert variant="destructive" data-testid="import-too-large">
              <AlertDescription>
                Ukuran file melebihi batas 5 MB.
              </AlertDescription>
            </Alert>
          )}

          {error && (
            <Alert variant="destructive" data-testid="import-error">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {result && (
            <Alert variant="success" data-testid="import-result">
              <AlertDescription>
                <span className="font-mono font-semibold">
                  {result.imported}
                </span>{' '}
                baris diimpor,{' '}
                <span className="font-mono font-semibold">
                  {result.skipped}
                </span>{' '}
                dilewati (duplikat), dari total{' '}
                <span className="font-mono font-semibold">{result.total}</span>{' '}
                baris.
              </AlertDescription>
            </Alert>
          )}

          <Button type="submit" disabled={!canSubmit} className="gap-2">
            <Upload className="size-4" />
            {importMutation.isPending ? 'Mengimpor…' : 'Impor CSV'}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
