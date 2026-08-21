'use client';

import * as React from 'react';
import type { LeaveRequestStatus } from '@ohmypos/api-contracts';
import { Badge } from '@ohmypos/ui/components/badge';
import { Button } from '@ohmypos/ui/components/button';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@ohmypos/ui/components/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@ohmypos/ui/components/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@ohmypos/ui/components/table';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@ohmypos/ui/components/tabs';
import {
  useAllLeaveRequests,
  useApproveLeaveRequest,
  useRejectLeaveRequest,
} from '@/hooks/useLeaveRequests';
import { useUsers } from '@/hooks/useUsers';

const STATUS_CONFIG = {
  PENDING: {
    label: 'Menunggu',
    variant: 'secondary' as const,
    className:
      'bg-status-warning/10 text-status-warning border-status-warning/30',
  },
  APPROVED: {
    label: 'Disetujui',
    variant: 'secondary' as const,
    className:
      'bg-status-success/10 text-status-success border-status-success/30',
  },
  REJECTED: {
    label: 'Ditolak',
    variant: 'destructive' as const,
    className: '',
  },
} as const;

export function OwnerReviewQueue() {
  const [selectedUser, setSelectedUser] = React.useState<string>('ALL');
  const [selectedStatus, setSelectedStatus] = React.useState<string>('ALL');

  const { data: pendingRequests = [], isLoading: isPendingLoading } =
    useAllLeaveRequests({
      status: 'PENDING',
    });

  const historyQuery = React.useMemo(() => {
    const q: { status?: LeaveRequestStatus; userId?: string } = {};
    if (selectedStatus !== 'ALL')
      q.status = selectedStatus as LeaveRequestStatus;
    if (selectedUser !== 'ALL') q.userId = selectedUser;
    return q;
  }, [selectedStatus, selectedUser]);

  const { data: allRequests = [], isLoading: isAllLoading } =
    useAllLeaveRequests(historyQuery);

  const { data: users = [] } = useUsers();
  const approveMutation = useApproveLeaveRequest();
  const rejectMutation = useRejectLeaveRequest();

  return (
    <Tabs defaultValue="review" className="w-full">
      <TabsList className="grid w-full grid-cols-2">
        <TabsTrigger value="review">
          Menunggu Persetujuan
          {pendingRequests.length > 0 && (
            <Badge
              variant="secondary"
              className="ml-2 bg-status-warning/10 text-status-warning text-xs px-1.5 py-0.2"
            >
              {pendingRequests.length}
            </Badge>
          )}
        </TabsTrigger>
        <TabsTrigger value="history">Riwayat Semua Cuti</TabsTrigger>
      </TabsList>

      <TabsContent value="review">
        <Card>
          <CardHeader>
            <CardTitle>Menunggu Persetujuan</CardTitle>
          </CardHeader>
          <CardContent>
            {isPendingLoading ? (
              <p className="text-sm text-text-tertiary">Memuat…</p>
            ) : pendingRequests.length === 0 ? (
              <p className="text-sm text-text-tertiary">
                Tidak ada pengajuan cuti yang menunggu.
              </p>
            ) : (
              <div className="rounded-md border border-border-default">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Karyawan</TableHead>
                      <TableHead>Periode</TableHead>
                      <TableHead>Alasan</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Aksi</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {pendingRequests.map((request) => (
                      <TableRow key={request.id}>
                        <TableCell className="font-medium whitespace-nowrap">
                          {request.user?.name ?? request.userId}
                        </TableCell>
                        <TableCell className="font-medium whitespace-nowrap">
                          {request.startDate} — {request.endDate}
                        </TableCell>
                        <TableCell className="text-text-secondary">
                          {request.reason}
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant="secondary"
                            className="bg-status-warning/10 text-status-warning border-status-warning/30"
                          >
                            Menunggu
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right whitespace-nowrap">
                          <div className="flex justify-end gap-2">
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              disabled={rejectMutation.isPending}
                              onClick={() => rejectMutation.mutate(request.id)}
                            >
                              Tolak
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              disabled={approveMutation.isPending}
                              onClick={() => approveMutation.mutate(request.id)}
                            >
                              Setujui
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </TabsContent>

      <TabsContent value="history">
        <Card>
          <CardHeader className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <CardTitle>Histori Cuti Karyawan</CardTitle>
            <div className="flex flex-wrap gap-2">
              <div className="w-[180px]">
                <Select value={selectedUser} onValueChange={setSelectedUser}>
                  <SelectTrigger aria-label="Filter Karyawan">
                    <SelectValue placeholder="Semua Karyawan" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ALL">Semua Karyawan</SelectItem>
                    {users.map((u) => (
                      <SelectItem key={u.id} value={u.id}>
                        {u.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="w-[150px]">
                <Select
                  value={selectedStatus}
                  onValueChange={setSelectedStatus}
                >
                  <SelectTrigger aria-label="Filter Status">
                    <SelectValue placeholder="Semua Status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ALL">Semua Status</SelectItem>
                    <SelectItem value="PENDING">Menunggu</SelectItem>
                    <SelectItem value="APPROVED">Disetujui</SelectItem>
                    <SelectItem value="REJECTED">Ditolak</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {isAllLoading ? (
              <p className="text-sm text-text-tertiary">Memuat…</p>
            ) : allRequests.length === 0 ? (
              <p className="text-sm text-text-tertiary">
                Belum ada data pengajuan cuti.
              </p>
            ) : (
              <div className="rounded-md border border-border-default">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Karyawan</TableHead>
                      <TableHead>Periode</TableHead>
                      <TableHead>Alasan</TableHead>
                      <TableHead className="text-right">Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {allRequests.map((request) => {
                      const statusConfig = STATUS_CONFIG[request.status];
                      return (
                        <TableRow key={request.id}>
                          <TableCell className="font-medium whitespace-nowrap">
                            <div>
                              <p>{request.user?.name ?? request.userId}</p>
                              {request.user?.email && (
                                <p className="text-xs text-text-tertiary font-normal">
                                  {request.user.email}
                                </p>
                              )}
                            </div>
                          </TableCell>
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
      </TabsContent>
    </Tabs>
  );
}
