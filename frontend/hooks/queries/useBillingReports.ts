"use client";

import { useQuery } from "@tanstack/react-query";

import { api } from "@/lib/api";
import { getApiErrorMessage } from "@/lib/api-errors";
import type { DailyReport, OutstandingItem, ReconciliationReport } from "@/types";

export function useDailyReport(date: string) {
  const query = useQuery({
    queryKey: ["billing-daily", date],
    queryFn: async (): Promise<DailyReport> => {
      const { data } = await api.get<DailyReport>("/billing/reports/daily", { params: { date } });
      return data;
    },
    staleTime: 15_000,
  });
  return {
    report: query.data ?? null,
    loading: query.isLoading,
    error: query.isError ? getApiErrorMessage(query.error, "Could not load report.") : null,
  };
}

export function useReconciliation(date: string, cashierId?: string) {
  const query = useQuery({
    queryKey: ["billing-reconciliation", date, cashierId ?? "self"],
    queryFn: async (): Promise<ReconciliationReport> => {
      const { data } = await api.get<ReconciliationReport>("/billing/reports/reconciliation", {
        params: { date, cashier_id: cashierId || undefined },
      });
      return data;
    },
    staleTime: 15_000,
  });
  return {
    report: query.data ?? null,
    loading: query.isLoading,
    error: query.isError ? getApiErrorMessage(query.error, "Could not load reconciliation.") : null,
  };
}

export function useOutstanding() {
  const query = useQuery({
    queryKey: ["billing-outstanding"],
    queryFn: async (): Promise<OutstandingItem[]> => {
      const { data } = await api.get<OutstandingItem[]>("/billing/reports/outstanding");
      return data;
    },
    staleTime: 30_000,
  });
  return {
    items: query.data ?? [],
    loading: query.isLoading,
    error: query.isError ? getApiErrorMessage(query.error, "Could not load outstanding balances.") : null,
  };
}
