'use client';

import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import type {
  CreateLeaveRequest,
  LeaveRequestListResponse,
  LeaveRequestResponse,
  LeaveRequestSortBy,
  LeaveRequestStatus,
  SortOrder,
} from '@ohmypos/api-contracts';
import { apiFetch } from '@/lib/api';

/**
 * Caller-side shape: every field optional. `LeaveRequestListQuery` is the
 * schema's *output* type, where `page`/`limit` carry defaults and are therefore
 * required — the server fills them in, the caller should not have to.
 */
export type LeaveRequestFilterParams = {
  status?: LeaveRequestStatus;
  userId?: string;
  /** Overlap window, not containment — see useAllLeaveRequests below. */
  overlapsFrom?: string;
  overlapsTo?: string;
  sortBy?: LeaveRequestSortBy;
  sortOrder?: SortOrder;
  page?: number;
  limit?: number;
};

export const LEAVE_REQUESTS_QUERY_KEYS = {
  mine: ['leave-requests', 'me'] as const,
  all: (query: LeaveRequestFilterParams) =>
    ['leave-requests', 'all', query] as const,
};

export function useMyLeaveRequests() {
  return useQuery({
    queryKey: LEAVE_REQUESTS_QUERY_KEYS.mine,
    queryFn: () => apiFetch<LeaveRequestResponse[]>('/leave-requests/me'),
  });
}

/**
 * `overlapsFrom`/`overlapsTo` bound the result to leave that *overlaps* the
 * window, so a request spanning a month boundary belongs to both months. The
 * calendar matrix uses this instead of pulling every approved request in
 * company history to shade a single month.
 */
export function useAllLeaveRequests(query: LeaveRequestFilterParams = {}) {
  const params = new URLSearchParams();
  if (query.status) params.set('status', query.status);
  if (query.userId) params.set('userId', query.userId);
  if (query.overlapsFrom) params.set('overlapsFrom', query.overlapsFrom);
  if (query.overlapsTo) params.set('overlapsTo', query.overlapsTo);
  if (query.sortBy) params.set('sortBy', query.sortBy);
  if (query.sortOrder) params.set('sortOrder', query.sortOrder);
  if (query.page) params.set('page', String(query.page));
  if (query.limit) params.set('limit', String(query.limit));
  const qs = params.toString();

  return useQuery({
    queryKey: LEAVE_REQUESTS_QUERY_KEYS.all(query),
    queryFn: () =>
      apiFetch<LeaveRequestListResponse>(
        `/leave-requests${qs ? `?${qs}` : ''}`,
      ),
    placeholderData: keepPreviousData,
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
