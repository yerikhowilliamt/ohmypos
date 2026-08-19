'use client';

import * as React from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  CreateDeviceSchema,
  type CreateDevice,
  type BranchResponse,
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

interface AddDeviceDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  branches: BranchResponse[];
  onSubmit: (data: CreateDevice) => Promise<unknown>;
}

export function AddDeviceDialog({
  open,
  onOpenChange,
  branches,
  onSubmit,
}: AddDeviceDialogProps) {
  const [serverError, setServerError] = React.useState<string | null>(null);

  const {
    register,
    handleSubmit,
    control,
    reset,
    formState: { errors, isSubmitting },
  } = useForm({
    resolver: zodResolver(CreateDeviceSchema),
    defaultValues: { branchId: '', label: '' },
  });

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) {
      reset({ branchId: '', label: '' });
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
        error instanceof Error ? error.message : 'Gagal menambah perangkat.',
      );
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-[420px]">
        <form onSubmit={handleSubmit(submit)} noValidate>
          <DialogHeader>
            <DialogTitle>Tambah Perangkat</DialogTitle>
            <DialogDescription>
              Setelah dibuat, buka kode aktivasi di browser tablet/terminal yang
              sesungguhnya, sambil login sebagai OWNER di perangkat itu.
            </DialogDescription>
          </DialogHeader>

          <div className="mt-4 space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="device-branch">Cabang</Label>
              <Controller
                name="branchId"
                control={control}
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
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
              {isSubmitting ? 'Menyimpan…' : 'Tambah Perangkat'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
