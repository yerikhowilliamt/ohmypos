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

const PAGE_SIZE = 25;

/**
 * Minimal pager for the two hand-rolled tables on this screen. They are not
 * DataTable instances and converting them would be unrelated refactoring, but
 * an unpaged list here silently hid every request past the first page once the
 * API started paging.
 */
function LeavePager({
  page,
  totalPages,
  total,
  shown,
  onPageChange,
  label,
}: {
  page: number;
  totalPages: number;
  total: number;
  shown: number;
  onPageChange: (next: number) => void;
  label: string;
}) {
  if (total === 0) return null;
  const from = (page - 1) * PAGE_SIZE + 1;
  const to = from + shown - 1;
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 px-1 pt-3 text-xs text-text-secondary">
      <span>
        Menampilkan {from.toLocaleString('id-ID')}–{to.toLocaleString('id-ID')}{' '}
        dari {total.toLocaleString('id-ID')} {label}
      </span>
      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-7 text-xs"
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
        >
          Sebelumnya
        </Button>
        <span className="whitespace-nowrap">
          Hal. {page} / {totalPages}
        </span>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-7 text-xs"
          disabled={page >= totalPages}
          onClick={() => onPageChange(page + 1)}
        >
          Berikutnya
        </Button>
      </div>
    </div>
  );
}

export function OwnerReviewQueue() {
  const [selectedUser, setSelectedUser] = React.useState<string>('ALL');
  const [selectedStatus, setSelectedStatus] = React.useState<string>('ALL');

  const [pendingPage, setPendingPage] = React.useState(1);
  const [historyPage, setHistoryPage] = React.useState(1);

  const { data: pendingPageData, isLoading: isPendingLoading } =
    useAllLeaveRequests({
      status: 'PENDING',
      page: pendingPage,
      limit: PAGE_SIZE,
    });
  const pendingRequests = pendingPageData?.data ?? [];
  /**
   * The tab badge counts the whole queue, not the current page — `meta.total`,
   * never `pendingRequests.length`. Once the list is paged those two diverge,
   * and a badge reading "50" while 130 requests wait for review is worse than
   * no badge at all.
   */
  const pendingTotal = pendingPageData?.meta.total ?? 0;
  const pendingTotalPages = pendingPageData?.meta.totalPages ?? 1;

  const historyQuery = React.useMemo(() => {
    const q: {
      status?: LeaveRequestStatus;
      userId?: string;
      page: number;
      limit: number;
    } = { page: historyPage, limit: PAGE_SIZE };
    if (selectedStatus !== 'ALL')
      q.status = selectedStatus as LeaveRequestStatus;
    if (selectedUser !== 'ALL') q.userId = selectedUser;
    return q;
  }, [selectedStatus, selectedUser, historyPage]);

  const { data: historyPageData, isLoading: isAllLoading } =
    useAllLeaveRequests(historyQuery);
  const allRequests = historyPageData?.data ?? [];
  const historyTotal = historyPageData?.meta.total ?? 0;
  const historyTotalPages = historyPageData?.meta.totalPages ?? 1;

  const { data: users = [] } = useUsers();
  const approveMutation = useApproveLeaveRequest();
  const rejectMutation = useRejectLeaveRequest();

  return (
    <Tabs defaultValue="review" className="w-full">
      <TabsList className="grid w-full grid-cols-2">
        <TabsTrigger value="review">
          Menunggu Persetujuan
          {pendingTotal > 0 && (
            <Badge
              variant="secondary"
              className="ml-2 bg-status-warning/10 text-status-warning text-xs px-1.5 py-0.2"
            >
              {pendingTotal}
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
                <LeavePager
                  page={pendingPage}
                  totalPages={pendingTotalPages}
                  total={pendingTotal}
                  shown={pendingRequests.length}
                  onPageChange={setPendingPage}
                  label="pengajuan menunggu"
                />
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
                <Select
                  value={selectedUser}
                  onValueChange={(next) => {
                    setSelectedUser(next);
                    setHistoryPage(1);
                  }}
                >
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
                  onValueChange={(next) => {
                    setSelectedStatus(next);
                    setHistoryPage(1);
                  }}
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
                <LeavePager
                  page={historyPage}
                  totalPages={historyTotalPages}
                  total={historyTotal}
                  shown={allRequests.length}
                  onPageChange={setHistoryPage}
                  label="pengajuan"
                />
              </div>
            )}
          </CardContent>
        </Card>
      </TabsContent>
    </Tabs>
  );
}
