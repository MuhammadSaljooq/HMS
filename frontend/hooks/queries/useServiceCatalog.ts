"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api } from "@/lib/api";
import { getApiErrorMessage } from "@/lib/api-errors";
import type { ServiceCatalogItem } from "@/types";

export function useServiceCatalog(activeOnly = false) {
  const queryClient = useQueryClient();

  const listQuery = useQuery({
    queryKey: ["service-catalog", { activeOnly }],
    queryFn: async (): Promise<ServiceCatalogItem[]> => {
      const { data } = await api.get<ServiceCatalogItem[]>("/billing/service-catalog", {
        params: { active_only: activeOnly || undefined },
      });
      return data;
    },
    staleTime: 30_000,
  });

  const createMutation = useMutation({
    mutationFn: async (body: { code: string; name: string; description?: string | null; default_price: string }) => {
      const { data } = await api.post<ServiceCatalogItem>("/billing/service-catalog", body);
      return data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["service-catalog"] }),
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, body }: { id: string; body: Record<string, unknown> }) => {
      const { data } = await api.patch<ServiceCatalogItem>(`/billing/service-catalog/${id}`, body);
      return data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["service-catalog"] }),
  });

  return {
    services: listQuery.data ?? [],
    loading: listQuery.isLoading,
    error: listQuery.isError ? getApiErrorMessage(listQuery.error, "Could not load services.") : null,
    createMutation,
    updateMutation,
  };
}
