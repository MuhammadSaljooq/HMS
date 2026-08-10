"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api } from "@/lib/api";
import { getApiErrorMessage } from "@/lib/api-errors";
import type {
  Invoice, InvoiceDetail, InvoiceLineItem, PatientLookupItem, Payment, PaymentMethod, PaymentType,
} from "@/types";

export async function lookupPatients(q: string): Promise<PatientLookupItem[]> {
  const { data } = await api.get<PatientLookupItem[]>("/billing/patients/lookup", { params: { q } });
  return data;
}

export function useInvoiceDetail(id: string) {
  const queryClient = useQueryClient();
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["invoice-detail", id] });

  const detailQuery = useQuery({
    queryKey: ["invoice-detail", id],
    enabled: !!id,
    queryFn: async (): Promise<InvoiceDetail> => {
      const { data } = await api.get<InvoiceDetail>(`/billing/invoices/${id}`);
      return data;
    },
  });

  const addLineItem = useMutation({
    mutationFn: async (body: {
      service_id?: string | null;
      description?: string | null;
      unit_price?: string | null;
      quantity: number;
    }): Promise<InvoiceLineItem> => {
      const { data } = await api.post<InvoiceLineItem>(`/billing/invoices/${id}/line-items`, body);
      return data;
    },
    onSuccess: invalidate,
  });

  const removeLineItem = useMutation({
    mutationFn: async (itemId: string) => {
      await api.delete(`/billing/invoices/${id}/line-items/${itemId}`);
    },
    onSuccess: invalidate,
  });

  const issueInvoice = useMutation({
    mutationFn: async (): Promise<Invoice> => {
      const { data } = await api.post<Invoice>(`/billing/invoices/${id}/issue`);
      return data;
    },
    onSuccess: () => {
      invalidate();
      queryClient.invalidateQueries({ queryKey: ["invoice-list"] });
    },
  });

  const recordPayment = useMutation({
    mutationFn: async (body: {
      method: PaymentMethod;
      amount: string;
      payment_type?: PaymentType;
      reference?: string | null;
      notes?: string | null;
    }): Promise<Payment> => {
      const { data } = await api.post<Payment>(`/billing/invoices/${id}/payments`, body);
      return data;
    },
    onSuccess: () => {
      invalidate();
      queryClient.invalidateQueries({ queryKey: ["billing-daily"] });
    },
  });

  const voidInvoice = useMutation({
    mutationFn: async (reason: string): Promise<Invoice> => {
      const { data } = await api.post<Invoice>(`/billing/invoices/${id}/void`, { reason });
      return data;
    },
    onSuccess: () => {
      invalidate();
      queryClient.invalidateQueries({ queryKey: ["invoice-list"] });
    },
  });

  return {
    invoice: detailQuery.data ?? null,
    loading: detailQuery.isLoading,
    error: detailQuery.isError ? getApiErrorMessage(detailQuery.error, "Could not load invoice.") : null,
    addLineItem,
    removeLineItem,
    issueInvoice,
    recordPayment,
    voidInvoice,
  };
}
