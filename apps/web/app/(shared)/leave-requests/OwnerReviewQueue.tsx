'use client';

import { Badge } from '@ohmypos/ui/components/badge';
import { Button } from '@ohmypos/ui/components/button';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@ohmypos/ui/components/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@ohmypos/ui/components/table';
import {
  useAllLeaveRequests,
  useApproveLeaveRequest,
  useRejectLeaveRequest,
} from '@/hooks/useLeaveRequests';

export function OwnerReviewQueue() {
  const { data: requests = [], isLoading } = useAllLeaveRequests({
    status: 'PENDING',
  });
  const approveMutation = useApproveLeaveRequest();
  const rejectMutation = useRejectLeaveRequest();

  return (
    <Card>
      <CardHeader>
        <CardTitle>Menunggu Persetujuan</CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <p className="text-sm text-text-tertiary">Memuat…</p>
        ) : requests.length === 0 ? (
          <p className="text-sm text-text-tertiary">
            Tidak ada pengajuan cuti yang menunggu.
          </p>
        ) : (
          <div className="rounded-md border border-border-default">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Periode</TableHead>
                  <TableHead>Alasan</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Aksi</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {requests.map((request) => (
                  <TableRow key={request.id}>
                    <TableCell className="font-medium whitespace-nowrap">
                      {request.startDate} — {request.endDate}
                    </TableCell>
                    <TableCell className="text-text-secondary">
                      {request.reason}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant="secondary"
                        className="bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-950/50 dark:text-amber-300 dark:border-amber-800"
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
  );
}
