'use client';

import * as React from 'react';
import { Button } from '@ohmypos/ui/components/button';
import { useActivateDevice } from '@/hooks/useDevices';

export function ActivateDeviceClient({ code }: { code: string }) {
  const activateMutation = useActivateDevice();
  const [result, setResult] = React.useState<'idle' | 'success' | 'error'>(
    'idle',
  );
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);

  const handleActivate = async () => {
    setResult('idle');
    setErrorMessage(null);
    try {
      await activateMutation.mutateAsync(code);
      setResult('success');
    } catch (error) {
      setResult('error');
      setErrorMessage(
        error instanceof Error
          ? error.message
          : 'Perangkat belum aktif. Periksa koneksi lalu coba lagi, atau minta Owner menyalin tautan aktivasi yang baru.',
      );
    }
  };

  if (!code) {
    return (
      <p className="text-sm text-status-danger">
        Kode aktivasi tidak ditemukan di tautan ini.
      </p>
    );
  }

  return (
    <div className="w-full max-w-sm rounded-sm border border-border-default bg-surface-raised p-6 shadow-1 text-center space-y-4">
      <h1 className="text-lg font-semibold text-text-primary">
        Aktivasi Perangkat
      </h1>
      <p className="text-sm text-text-secondary">
        Pastikan halaman ini dibuka langsung di browser tablet atau HP yang akan
        dipakai kasir di toko — bukan di perangkat pribadi Anda.
      </p>

      {result === 'success' ? (
        <p className="text-sm text-status-success">
          Perangkat berhasil diaktifkan. Kasir sekarang bisa login dan absensi
          dari perangkat ini.
        </p>
      ) : (
        <>
          <Button
            type="button"
            onClick={handleActivate}
            disabled={activateMutation.isPending}
          >
            {activateMutation.isPending
              ? 'Mengaktifkan…'
              : 'Aktifkan Perangkat Ini'}
          </Button>
          {result === 'error' && errorMessage && (
            <p role="alert" className="text-xs text-status-danger">
              {errorMessage}
            </p>
          )}
        </>
      )}
    </div>
  );
}
