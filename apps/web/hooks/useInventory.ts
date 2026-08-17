'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  OpeningStockWorksheetResponse,
  UpsertOpeningStock,
  UpsertOpeningStockResponse,
} from '@ohmypos/api-contracts';
import { apiFetch } from '@/lib/api';

export const INVENTORY_QUERY_KEYS = {
  openingStockWorksheet: (period: string) =>
    ['inventory', 'opening-stock', 'worksheet', period] as const,
};

export function useOpeningStockWorksheet(period: string) {
  return useQuery({
    queryKey: INVENTORY_QUERY_KEYS.openingStockWorksheet(period),
    queryFn: () =>
      apiFetch<OpeningStockWorksheetResponse>(
        `/inventory/opening-stock?period=${encodeURIComponent(period)}`,
      ),
    enabled: Boolean(period),
  });
}

export function useUpsertOpeningStock() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: UpsertOpeningStock) =>
      apiFetch<UpsertOpeningStockResponse>('/inventory/opening-stock', {
        method: 'PUT',
        body: JSON.stringify(data),
      }),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: INVENTORY_QUERY_KEYS.openingStockWorksheet(
          variables.periodMonth,
        ),
      });
    },
  });
}
