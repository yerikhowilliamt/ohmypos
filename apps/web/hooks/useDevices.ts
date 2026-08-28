'use client';

import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import type {
  AttendanceListResponse,
  AttendanceRecordResponse,
  AttendanceSortBy,
  CreateDevice,
  DeviceResponse,
  SortOrder,
  UpdateDevice,
} from '@ohmypos/api-contracts';
import { apiFetch } from '@/lib/api';

export type AttendanceFilterParams = {
  /**
   * Free-text search, matched server-side against employee name, employee
   * email, branch name and device label. The calendar matrix never sends it.
   */
  search?: string;
  branchId?: string;
  violationOnly?: boolean;
  /**
   * Both bounds filter `loginAt` server-side. The calendar matrix sends the
   * month it is displaying; before these existed it fetched the N most recent
   * logins globally and filtered client-side, so every month but the newest
   * rendered blank.
   */
  startDate?: string;
  endDate?: string;
  sortBy?: AttendanceSortBy;
  sortOrder?: SortOrder;
  page?: number;
  limit?: number;
};

export const DEVICES_QUERY_KEYS = {
  devices: ['devices'] as const,
  attendance: (params?: AttendanceFilterParams) =>
    ['devices', 'attendance', params] as const,
};

export function useDevices() {
  return useQuery({
    queryKey: DEVICES_QUERY_KEYS.devices,
    queryFn: () => apiFetch<DeviceResponse[]>('/devices'),
  });
}

function buildAttendanceQuery(params?: AttendanceFilterParams): string {
  const query = new URLSearchParams();
  if (params?.search) query.set('search', params.search);
  if (params?.branchId) query.set('branchId', params.branchId);
  if (params?.violationOnly) query.set('violationOnly', 'true');
  if (params?.startDate) query.set('startDate', params.startDate);
  if (params?.endDate) query.set('endDate', params.endDate);
  if (params?.sortBy) query.set('sortBy', params.sortBy);
  if (params?.sortOrder) query.set('sortOrder', params.sortOrder);
  if (params?.page) query.set('page', String(params.page));
  if (params?.limit) query.set('limit', String(params.limit));
  return query.toString();
}

/**
 * One page, outside React Query — the Export button's `fetchAllPages` loop needs
 * it (DEBT-048). Shares `buildAttendanceQuery` with the hook so the exported set
 * can never drift from the one on screen.
 */
export function fetchAttendanceRecordsPage(params?: AttendanceFilterParams) {
  const queryString = buildAttendanceQuery(params);
  return apiFetch<AttendanceListResponse>(
    `/devices/attendance${queryString ? `?${queryString}` : ''}`,
  );
}

export function useAttendanceRecords(params?: AttendanceFilterParams) {
  return useQuery({
    queryKey: DEVICES_QUERY_KEYS.attendance(params),
    queryFn: () => fetchAttendanceRecordsPage(params),
    // The 30s poll would otherwise drop the reader back to a loading skeleton
    // on whatever page they were reading.
    placeholderData: keepPreviousData,
    refetchInterval: 30000,
  });
}

export function useCreateDevice() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateDevice) =>
      apiFetch<DeviceResponse>('/devices', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: DEVICES_QUERY_KEYS.devices });
    },
  });
}

export function useUpdateDevice() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateDevice }) =>
      apiFetch<DeviceResponse>(`/devices/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: DEVICES_QUERY_KEYS.devices });
      // A renamed device changes `deviceLabel` on every row of the log.
      queryClient.invalidateQueries({ queryKey: ['devices', 'attendance'] });
    },
  });
}

export function useDeleteDevice() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch<DeviceResponse>(`/devices/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: DEVICES_QUERY_KEYS.devices });
      queryClient.invalidateQueries({ queryKey: ['devices', 'attendance'] });
    },
  });
}

export function useDeactivateDevice() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch<DeviceResponse>(`/devices/${id}/deactivate`, {
        method: 'PATCH',
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: DEVICES_QUERY_KEYS.devices });
    },
  });
}

export function useActivateDevice() {
  return useMutation({
    mutationFn: (code: string) =>
      apiFetch<DeviceResponse>('/devices/activate', {
        method: 'POST',
        body: JSON.stringify({ code }),
      }),
  });
}

export function useUpdateAttendanceStatus() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      isValid,
      violationReason,
    }: {
      id: string;
      isValid: boolean;
      violationReason?: string | null;
    }) =>
      apiFetch<AttendanceRecordResponse>(`/devices/attendance/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ isValid, violationReason }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['devices', 'attendance'] });
    },
  });
}
