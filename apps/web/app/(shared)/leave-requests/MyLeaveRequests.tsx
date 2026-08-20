'use client';

import * as React from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  CreateLeaveRequestSchema,
  type CreateLeaveRequest,
} from '@ohmypos/api-contracts';
import { Badge } from '@ohmypos/ui/components/badge';
import { Button } from '@ohmypos/ui/components/button';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@ohmypos/ui/components/card';
import { DatePicker } from '@ohmypos/ui/components/date-picker';
import { Input } from '@ohmypos/ui/components/input';
import { Label } from '@ohmypos/ui/components/label';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@ohmypos/ui/components/table';
import {
  useCreateLeaveRequest,
  useMyLeaveRequests,
} from '@/hooks/useLeaveRequests';

const STATUS_CONFIG = {
  PENDING: {
    label: 'Menunggu',
    variant: 'secondary' as const,
    className:
      'bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-950/50 dark:text-amber-300 dark:border-amber-800',
  },
  APPROVED: {
    label: 'Disetujui',
    variant: 'secondary' as const,
    className:
      'bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-950/50 dark:text-emerald-300 dark:border-emerald-800',
  },
  REJECTED: {
    label: 'Ditolak',
    variant: 'destructive' as const,
    className: '',
  },
} as const;

export function MyLeaveRequests() {
  const { data: requests = [], isLoading } = useMyLeaveRequests();
  const createMutation = useCreateLeaveRequest();
  const [serverError, setServerError] = React.useState<string | null>(null);

  const {
    register,
    control,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<CreateLeaveRequest>({
    resolver: zodResolver(CreateLeaveRequestSchema),
    defaultValues: { startDate: '', endDate: '', reason: '' },
  });

  const onSubmit = async (values: CreateLeaveRequest) => {
    setServerError(null);
    try {
      await createMutation.mutateAsync(values);
      reset({ startDate: '', endDate: '', reason: '' });
    } catch (error) {
      setServerError(
        error instanceof Error ? error.message : 'Gagal mengajukan cuti.',
      );
    }
  };

  const isPending = isSubmitting || createMutation.isPending;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Ajukan Cuti Baru</CardTitle>
        </CardHeader>
        <CardContent>
          <form
            onSubmit={handleSubmit(onSubmit)}
            noValidate
            className="space-y-3"
          >
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="leave-start">Mulai</Label>
                <Controller
                  name="startDate"
                  control={control}
                  render={({ field }) => (
                    <DatePicker
                      id="leave-start"
                      value={field.value}
                      onChange={(date) => field.onChange(date ?? '')}
                      placeholder="Pilih Tanggal Mulai"
                      ariaInvalid={Boolean(errors.startDate)}
                    />
                  )}
                />
                {errors.startDate && (
                  <p role="alert" className="text-xs text-status-danger">
                    {errors.startDate.message}
                  </p>
                )}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="leave-end">Selesai</Label>
                <Controller
                  name="endDate"
                  control={control}
                  render={({ field }) => (
                    <DatePicker
                      id="leave-end"
                      value={field.value}
                      onChange={(date) => field.onChange(date ?? '')}
                      placeholder="Pilih Tanggal Selesai"
                      ariaInvalid={Boolean(errors.endDate)}
                    />
                  )}
                />
                {errors.endDate && (
                  <p role="alert" className="text-xs text-status-danger">
                    {errors.endDate.message}
                  </p>
                )}
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="leave-reason">Alasan</Label>
              <Input
                id="leave-reason"
                placeholder="Contoh: Acara keluarga"
                aria-invalid={Boolean(errors.reason)}
                {...register('reason')}
              />
              {errors.reason && (
                <p role="alert" className="text-xs text-status-danger">
                  {errors.reason.message}
                </p>
              )}
            </div>
            {serverError && (
              <p role="alert" className="text-xs text-status-danger">
                {serverError}
              </p>
            )}
            <Button type="submit" disabled={isPending}>
              {isPending ? 'Mengajukan…' : 'Ajukan Cuti'}
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Riwayat Pengajuan</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-sm text-text-tertiary">Memuat…</p>
          ) : requests.length === 0 ? (
            <p className="text-sm text-text-tertiary">
              Belum ada pengajuan cuti.
            </p>
          ) : (
            <div className="rounded-md border border-border-default">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Periode</TableHead>
                    <TableHead>Alasan</TableHead>
                    <TableHead className="text-right">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {requests.map((request) => {
                    const statusConfig = STATUS_CONFIG[request.status];
                    return (
                      <TableRow key={request.id}>
                        <TableCell className="font-medium whitespace-nowrap">
                          {request.startDate} — {request.endDate}
                        </TableCell>
                        <TableCell className="text-text-secondary">
                          {request.reason}
                        </TableCell>
                        <TableCell className="text-right whitespace-nowrap">
                          <Badge
                            variant={statusConfig.variant}
                            className={statusConfig.className}
                          >
                            {statusConfig.label}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
