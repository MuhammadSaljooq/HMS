"use client";

import { useQuery } from "@tanstack/react-query";

import { api } from "@/lib/api";
import { getApiErrorMessage } from "@/lib/api-errors";
import type { AppointmentListItem, DashboardStats } from "@/types";

type DashboardOverviewData = {
  stats: DashboardStats;
  appointments: AppointmentListItem[];
};

export function useDashboardOverviewData() {
  const query = useQuery({
    queryKey: ["dashboard-overview"],
    queryFn: async (): Promise<DashboardOverviewData> => {
      const [statsRes, appointmentsRes] = await Promise.all([
        api.get<DashboardStats>("/dashboard/stats"),
        api.get<AppointmentListItem[]>("/appointments"),
      ]);
      return {
        stats: statsRes.data,
        appointments: appointmentsRes.data,
      };
    },
    staleTime: 30_000,
  });

  return {
    stats: query.data?.stats ?? null,
    appointments: query.data?.appointments ?? [],
    loading: query.isLoading,
    error: query.isError ? getApiErrorMessage(query.error, "Could not load dashboard overview.") : null,
    refetch: query.refetch,
  };
}
