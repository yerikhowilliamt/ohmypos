'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  AttendanceRecordResponse,
  CreateDevice,
  DeviceResponse,
} from '@ohmypos/api-contracts';
import { apiFetch } from '@/lib/api';

export const DEVICES_QUERY_KEYS = {
  devices: ['devices'] as const,
  attendance: (params?: { branchId?: string; violationOnly?: boolean }) =>
    ['devices', 'attendance', params] as const,
};

export function useDevices() {
  return useQuery({
    queryKey: DEVICES_QUERY_KEYS.devices,
    queryFn: () => apiFetch<DeviceResponse[]>('/devices'),
  });
}

export function useAttendanceRecords(params?: {
  branchId?: string;
  violationOnly?: boolean;
}) {
  const query = new URLSearchParams();
  if (params?.branchId) query.set('branchId', params.branchId);
  if (params?.violationOnly) query.set('violationOnly', 'true');

  const queryString = query.toString();
  const endpoint = `/devices/attendance${queryString ? `?${queryString}` : ''}`;

  return useQuery({
    queryKey: DEVICES_QUERY_KEYS.attendance(params),
    queryFn: () => apiFetch<AttendanceRecordResponse[]>(endpoint),
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
