"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api } from "@/lib/api";
import { getApiErrorMessage } from "@/lib/api-errors";
import type { Invoice, InvoiceListResponse, InvoiceStatus } from "@/types";

type InvoiceListParams = {
  patientId?: string;
  status?: InvoiceStatus;
  skip: number;
  limit: number;
};

export function useInvoiceList(params: InvoiceListParams) {
  const queryClient = useQueryClient();

  const listQuery = useQuery({
    queryKey: ["invoice-list", params],
    queryFn: async (): Promise<InvoiceListResponse> => {
      const { data } = await api.get<InvoiceListResponse>("/billing/invoices", {
        params: {
          patient_id: params.patientId || undefined,
          status: params.status || undefined,
          skip: params.skip,
          limit: params.limit,
        },
      });
      return data;
    },
    staleTime: 15_000,
  });

  const createInvoice = useMutation({
    mutationFn: async (body: {
      patient_id: string;
      appointment_id?: string | null;
      notes?: string | null;
      discount_total?: string;
    }): Promise<Invoice> => {
      const { data } = await api.post<Invoice>("/billing/invoices", body);
      return data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["invoice-list"] }),
  });

  return {
    items: listQuery.data?.items ?? [],
    total: listQuery.data?.total ?? 0,
    loading: listQuery.isLoading,
    error: listQuery.isError ? getApiErrorMessage(listQuery.error, "Could not load invoices.") : null,
    createInvoice,
  };
}
