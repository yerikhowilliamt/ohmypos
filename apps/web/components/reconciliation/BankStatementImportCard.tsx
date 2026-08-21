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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@ohmypos/ui/components/select';
import { BANK_IMPORT_FORMATS } from '@ohmypos/api-contracts';
import type {
  AccountResponse,
  BankImportFormat,
  ImportResult,
} from '@ohmypos/api-contracts';
import { useImportBankStatement } from '@/hooks/useReconciliation';

/** import.controller.ts — MaxFileSizeValidator({ maxSize: 5 * 1024 * 1024 }). */
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
  const [format, setFormat] = React.useState<BankImportFormat>('BCA');
  const [password, setPassword] = React.useState('');
  const [file, setFile] = React.useState<File | null>(null);
  const [result, setResult] = React.useState<ImportResult | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const importMutation = useImportBankStatement();

  const selectedFormat =
    BANK_IMPORT_FORMATS.find((entry) => entry.value === format) ??
    BANK_IMPORT_FORMATS[0];

  /** A file picked for one container must not be submitted under another. */
  const handleFormatChange = (value: string) => {
    setFormat(value as BankImportFormat);
    setPassword('');
    setFile(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const isPdf = selectedFormat.container === 'pdf';
  const tooLarge = file !== null && file.size > MAX_FILE_BYTES;
  const canSubmit =
    accountId !== '' && file !== null && !tooLarge && !importMutation.isPending;

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!canSubmit || !file) return;

    setError(null);
    setResult(null);
    try {
      setResult(
        await importMutation.mutateAsync({
          accountId,
          format,
          file,
          password: isPdf && password ? password : undefined,
        }),
      );
      setFile(null);
      setPassword('');
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
        <CardTitle className="text-base">Impor Mutasi Bank</CardTitle>
        <CardDescription>
          Unggah file mutasi rekening bank (CSV atau PDF e-statement) untuk
          mulai mencocokkan transaksi.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} noValidate className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label htmlFor="import-account">Akun Bank</Label>
              <Select
                value={accountId || undefined}
                onValueChange={(value) => setAccountId(value)}
              >
                <SelectTrigger id="import-account">
                  <SelectValue placeholder="-- Pilih Akun --" />
                </SelectTrigger>
                <SelectContent>
                  {accounts.map((account) => (
                    <SelectItem key={account.id} value={account.id}>
                      {account.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="import-format">Format Bank</Label>
              <Select value={format} onValueChange={handleFormatChange}>
                <SelectTrigger id="import-format">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {BANK_IMPORT_FORMATS.map((entry) => (
                    <SelectItem key={entry.value} value={entry.value}>
                      {entry.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="import-file">File Mutasi</Label>
              <Input
                id="import-file"
                data-testid="import-file-input"
                ref={fileInputRef}
                type="file"
                accept={selectedFormat.accept}
                onChange={(event) => setFile(event.target.files?.[0] ?? null)}
              />
            </div>
          </div>

          {isPdf && (
            <div className="max-w-sm space-y-1.5">
              <Label htmlFor="import-password">
                Kata Sandi PDF{' '}
                <span className="text-muted-foreground text-xs">
                  (Opsional jika terkunci)
                </span>
              </Label>
              <Input
                id="import-password"
                data-testid="import-password-input"
                type="password"
                placeholder="Contoh: Tanggal lahir (DDMMYY)"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
          )}

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
            {importMutation.isPending ? 'Mengimpor…' : 'Impor Mutasi'}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
