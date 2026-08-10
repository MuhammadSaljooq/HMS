"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";

import { api } from "@/lib/api";
import type { MedicalRecord } from "@/types";

/**
 * Creates a medical record via POST /records and invalidates any cached record
 * lists / patient-detail bundles so callers can rely on fresh data afterwards.
 */
export function useCreateRecord(patientId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payload: Record<string, unknown>): Promise<MedicalRecord> => {
      const { data } = await api.post<MedicalRecord>("/records", payload);
      return data;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["patient-detail", patientId] });
    },
  });
}
