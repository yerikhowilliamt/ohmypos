'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  CreateProduct,
  CreateRawMaterial,
  ProductWithHppResponse,
  RawMaterialResponse,
  RecipeEnvelopeResponse,
  ReplaceRecipe,
  UpdateProduct,
  UpdateRawMaterial,
} from '@ohmypos/api-contracts';
import { apiFetch } from '@/lib/api';

export const MASTER_DATA_QUERY_KEYS = {
  rawMaterials: ['raw-materials'] as const,
  products: ['products'] as const,
  recipe: (productId: string) => ['products', productId, 'recipe'] as const,
};

// --- Raw Materials Hooks ---

export function useRawMaterials() {
  return useQuery({
    queryKey: MASTER_DATA_QUERY_KEYS.rawMaterials,
    queryFn: () => apiFetch<RawMaterialResponse[]>('/raw-materials'),
  });
}

export function useCreateRawMaterial() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateRawMaterial) =>
      apiFetch<RawMaterialResponse>('/raw-materials', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: MASTER_DATA_QUERY_KEYS.rawMaterials,
      });
    },
  });
}

export function useUpdateRawMaterial() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateRawMaterial }) =>
      apiFetch<RawMaterialResponse>(`/raw-materials/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: MASTER_DATA_QUERY_KEYS.rawMaterials,
      });
      // Updating rawMaterial.unitCost recalculates live HPP for products (ADR-005)
      queryClient.invalidateQueries({
        queryKey: MASTER_DATA_QUERY_KEYS.products,
      });
    },
  });
}

export function useDeleteRawMaterial() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch<void>(`/raw-materials/${id}`, {
        method: 'DELETE',
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: MASTER_DATA_QUERY_KEYS.rawMaterials,
      });
    },
  });
}

// --- Products Hooks ---

export function useProducts() {
  return useQuery({
    queryKey: MASTER_DATA_QUERY_KEYS.products,
    queryFn: () => apiFetch<ProductWithHppResponse[]>('/products'),
  });
}

export function useCreateProduct() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateProduct) =>
      apiFetch<ProductWithHppResponse>('/products', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: MASTER_DATA_QUERY_KEYS.products,
      });
    },
  });
}

export function useUpdateProduct() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateProduct }) =>
      apiFetch<ProductWithHppResponse>(`/products/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: MASTER_DATA_QUERY_KEYS.products,
      });
    },
  });
}

export function useDeleteProduct() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch<void>(`/products/${id}`, {
        method: 'DELETE',
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: MASTER_DATA_QUERY_KEYS.products,
      });
    },
  });
}

export function useUploadProductPhoto() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: { id: string; file: File }) => {
      const formData = new FormData();
      formData.append('file', data.file);
      return apiFetch<{ photoUrl: string }>(`/products/${data.id}/photo`, {
        method: 'POST',
        body: formData,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: MASTER_DATA_QUERY_KEYS.products,
      });
    },
  });
}

// --- Recipe Hooks ---

export function useProductRecipe(productId: string | null) {
  return useQuery({
    queryKey: productId
      ? MASTER_DATA_QUERY_KEYS.recipe(productId)
      : ['products', 'null', 'recipe'],
    queryFn: () =>
      productId
        ? apiFetch<RecipeEnvelopeResponse>(`/products/${productId}/recipe`)
        : null,
    enabled: Boolean(productId),
  });
}

export function useReplaceRecipe() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      productId,
      data,
    }: {
      productId: string;
      data: ReplaceRecipe;
    }) =>
      apiFetch<RecipeEnvelopeResponse>(`/products/${productId}/recipe`, {
        method: 'PUT',
        body: JSON.stringify(data),
      }),
    onSuccess: (_res, variables) => {
      queryClient.invalidateQueries({
        queryKey: MASTER_DATA_QUERY_KEYS.products,
      });
      queryClient.invalidateQueries({
        queryKey: MASTER_DATA_QUERY_KEYS.recipe(variables.productId),
      });
    },
  });
}
