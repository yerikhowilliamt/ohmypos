'use client';

import * as React from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  CreateDeviceSchema,
  type CreateDevice,
  type BranchResponse,
  type DeviceResponse,
} from '@ohmypos/api-contracts';
import { Button } from '@ohmypos/ui/components/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@ohmypos/ui/components/dialog';
import { Input } from '@ohmypos/ui/components/input';
import { Label } from '@ohmypos/ui/components/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@ohmypos/ui/components/select';

interface DeviceFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  branches: BranchResponse[];
  /** Absent/null = create a device. Present = edit that one. */
  device?: DeviceResponse | null;
  onSubmit: (data: CreateDevice) => Promise<unknown>;
}

const EMPTY: CreateDevice = { branchId: '', label: '' };

export function DeviceFormDialog({
  open,
  onOpenChange,
  branches,
  device,
  onSubmit,
}: DeviceFormDialogProps) {
  const [serverError, setServerError] = React.useState<string | null>(null);
  const isEdit = Boolean(device);
  // An active terminal's branch is an access-control input — AuthService
  // matches a cashier's branch against it — so moving one without the physical
  // re-activation ceremony (ADR-021) is refused by the API. The picker says so
  // rather than letting the Owner discover it through a 400.
  const branchLocked = Boolean(device?.isActive);

  const {
    register,
    handleSubmit,
    control,
    reset,
    formState: { errors, isSubmitting },
  } = useForm({
    // CreateDeviceSchema in both modes, not the partial UpdateDeviceSchema:
    // both fields are always on screen and neither may be blanked, so the
    // stricter one is the accurate description of this form. A PATCH carrying
    // both fields still validates against the partial schema server-side.
    resolver: zodResolver(CreateDeviceSchema),
    // Seeded once per mount rather than synced in an effect. The caller keys
    // the edit instance by device id, so switching devices remounts this and
    // picks up the new defaults — no setState-in-effect, no stale prefill.
    defaultValues: device
      ? { branchId: device.branchId, label: device.label }
      : EMPTY,
  });

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) {
      reset(
        device ? { branchId: device.branchId, label: device.label } : EMPTY,
      );
      setServerError(null);
    }
    onOpenChange(nextOpen);
  };

  const submit = async (values: CreateDevice) => {
    setServerError(null);
    try {
      await onSubmit(values);
      handleOpenChange(false);
    } catch (error) {
      setServerError(
        error instanceof Error
          ? error.message
          : isEdit
            ? 'Perubahan belum tersimpan. Periksa koneksi lalu coba lagi.'
            : 'Perangkat belum tersimpan. Periksa koneksi lalu coba lagi.',
      );
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-[420px]">
        <form onSubmit={handleSubmit(submit)} noValidate>
          <DialogHeader>
            <DialogTitle>
              {isEdit ? 'Edit Perangkat' : 'Tambah Perangkat'}
            </DialogTitle>
            <DialogDescription>
              {isEdit
                ? 'Ubah nama perangkat. Cabang hanya bisa dipindah saat perangkat nonaktif.'
                : 'Setelah perangkat dibuat, buka link aktivasinya langsung di browser tablet kasir toko tersebut.'}
            </DialogDescription>
          </DialogHeader>

          <div className="mt-4 space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="device-branch">Cabang</Label>
              <Controller
                name="branchId"
                control={control}
                render={({ field }) => (
                  <Select
                    value={field.value}
                    onValueChange={field.onChange}
                    disabled={branchLocked}
                  >
                    <SelectTrigger
                      id="device-branch"
                      aria-invalid={Boolean(errors.branchId)}
                    >
                      <SelectValue placeholder="Pilih cabang" />
                    </SelectTrigger>
                    <SelectContent>
                      {branches.map((branch) => (
                        <SelectItem key={branch.id} value={branch.id}>
                          {branch.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
              {branchLocked && (
                <p className="text-xs text-text-tertiary">
                  Nonaktifkan perangkat dulu untuk memindahkannya ke cabang
                  lain, lalu aktifkan ulang di terminalnya.
                </p>
              )}
              {errors.branchId && (
                <p role="alert" className="text-xs text-status-danger">
                  {errors.branchId.message}
                </p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="device-label">Label</Label>
              <Input
                id="device-label"
                placeholder="Contoh: Tablet Kasir 1"
                autoComplete="off"
                aria-invalid={Boolean(errors.label)}
                {...register('label')}
              />
              {errors.label && (
                <p role="alert" className="text-xs text-status-danger">
                  {errors.label.message}
                </p>
              )}
            </div>

            {serverError && (
              <div
                role="alert"
                className="rounded-sm border border-status-danger/30 bg-status-danger/10 p-3 text-xs text-status-danger"
              >
                {serverError}
              </div>
            )}
          </div>

          <DialogFooter className="mt-6 gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={isSubmitting}
              onClick={() => handleOpenChange(false)}
            >
              Batal
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting
                ? 'Menyimpan…'
                : isEdit
                  ? 'Simpan Perubahan'
                  : 'Tambah Perangkat'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
