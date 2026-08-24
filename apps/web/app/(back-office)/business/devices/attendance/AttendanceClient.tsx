'use client';

import * as React from 'react';
import { Calendar, List } from 'lucide-react';
import { useBranches } from '@/hooks/useBranches';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@ohmypos/ui/components/tabs';
import { AttendanceLogTable } from '../AttendanceLogTable';
import { AttendanceCalendarMatrix } from '../AttendanceCalendarMatrix';

export function AttendanceClient() {
  const { data: branches = [] } = useBranches();

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-text-primary">
            Log Absensi Kasir
          </h1>
          <p className="mt-1 text-sm text-text-secondary">
            Pantau kehadiran kasir, validasi perangkat toko, serta jadwal cuti
            karyawan.
          </p>
        </div>
      </div>

      <Tabs defaultValue="calendar" className="space-y-4">
        <TabsList className="grid w-full max-w-[360px] grid-cols-2">
          <TabsTrigger value="calendar" className="gap-2">
            <Calendar className="size-4" />
            Kalender Matriks
          </TabsTrigger>
          <TabsTrigger value="table" className="gap-2">
            <List className="size-4" />
            Riwayat Log Detail
          </TabsTrigger>
        </TabsList>

        <TabsContent value="calendar" className="space-y-4">
          <AttendanceCalendarMatrix branches={branches} />
        </TabsContent>

        <TabsContent value="table" className="space-y-4">
          <AttendanceLogTable branches={branches} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
