"use client";

import { useQuery } from "@tanstack/react-query";

import { api } from "@/lib/api";
import { getApiErrorMessage } from "@/lib/api-errors";
import type { PatientListResponse } from "@/types";

type PatientDirectoryParams = {
  search?: string;
  skip: number;
  limit: number;
  sort_by: string;
  sort_order: "asc" | "desc";
};

export function usePatientDirectoryQuery(params: PatientDirectoryParams) {
  const query = useQuery({
    queryKey: ["patient-directory", params],
    queryFn: async (): Promise<PatientListResponse> => {
      const { data } = await api.get<PatientListResponse>("/patients", {
        params: {
          search: params.search || undefined,
          skip: params.skip,
          limit: params.limit,
          sort_by: params.sort_by,
          sort_order: params.sort_order,
        },
      });
      return data;
    },
    staleTime: 15_000,
  });

  return {
    items: query.data?.items ?? [],
    total: query.data?.total ?? 0,
    loading: query.isLoading,
    error: query.isError ? getApiErrorMessage(query.error, "Could not load patients. Try again.") : null,
    refetch: query.refetch,
  };
}
