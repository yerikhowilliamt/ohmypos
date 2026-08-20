'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  CreateLeaveRequest,
  LeaveRequestListQuery,
  LeaveRequestResponse,
} from '@ohmypos/api-contracts';
import { apiFetch } from '@/lib/api';

export const LEAVE_REQUESTS_QUERY_KEYS = {
  mine: ['leave-requests', 'me'] as const,
  all: (query: LeaveRequestListQuery) =>
    ['leave-requests', 'all', query] as const,
};

export function useMyLeaveRequests() {
  return useQuery({
    queryKey: LEAVE_REQUESTS_QUERY_KEYS.mine,
    queryFn: () => apiFetch<LeaveRequestResponse[]>('/leave-requests/me'),
  });
}

export function useAllLeaveRequests(query: LeaveRequestListQuery = {}) {
  const params = new URLSearchParams();
  if (query.status) params.set('status', query.status);
  if (query.userId) params.set('userId', query.userId);
  const qs = params.toString();

  return useQuery({
    queryKey: LEAVE_REQUESTS_QUERY_KEYS.all(query),
    queryFn: () =>
      apiFetch<LeaveRequestResponse[]>(`/leave-requests${qs ? `?${qs}` : ''}`),
  });
}

export function useCreateLeaveRequest() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateLeaveRequest) =>
      apiFetch<LeaveRequestResponse>('/leave-requests', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: LEAVE_REQUESTS_QUERY_KEYS.mine,
      });
    },
  });
}

function useReviewLeaveRequest(action: 'approve' | 'reject') {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch<LeaveRequestResponse>(`/leave-requests/${id}/${action}`, {
        method: 'PATCH',
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['leave-requests'] });
    },
  });
}

export function useApproveLeaveRequest() {
  return useReviewLeaveRequest('approve');
}

export function useRejectLeaveRequest() {
  return useReviewLeaveRequest('reject');
}
