"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api } from "@/lib/api";
import { getApiErrorMessage } from "@/lib/api-errors";
import type { Appointment, MedicalRecord, MedicalRecordDetail, Patient, Transcription, Vitals } from "@/types";

type PatientDetailBundle = {
  patient: Patient;
  vitals: Vitals[];
  appointments: Appointment[];
  records: MedicalRecord[];
  transcriptions: Transcription[];
};

export function usePatientDetailData(id: string) {
  const queryClient = useQueryClient();

  const detailQuery = useQuery({
    queryKey: ["patient-detail", id],
    enabled: !!id,
    queryFn: async (): Promise<PatientDetailBundle> => {
      const [p, v, a, r, t] = await Promise.all([
        api.get<Patient>(`/patients/${id}`),
        api.get<Vitals[]>(`/patients/${id}/vitals`),
        api.get<Appointment[]>("/appointments", { params: { patient_id: id } }),
        api.get<MedicalRecord[]>("/records", { params: { patient_id: id } }),
        api.get<Transcription[]>(`/patients/${id}/transcriptions`),
      ]);
      return {
        patient: p.data,
        vitals: v.data,
        appointments: a.data,
        records: r.data,
        transcriptions: t.data,
      };
    },
  });

  const addVitalsMutation = useMutation({
    mutationFn: async (body: Record<string, unknown>) => {
      await api.post(`/patients/${id}/vitals`, body);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["patient-detail", id] });
    },
    onError: (error: unknown) => {
      // Surface the failure so the caller can keep the form open and show why.
      return getApiErrorMessage(error, "Could not save vitals.");
    },
  });

  const fetchRecordDetail = async (recordId: string): Promise<MedicalRecordDetail> => {
    return queryClient.fetchQuery({
      queryKey: ["record-detail", recordId],
      queryFn: async () => {
        const { data } = await api.get<MedicalRecordDetail>(`/records/${recordId}`);
        return data;
      },
      staleTime: 60_000,
    });
  };

  return { detailQuery, addVitalsMutation, fetchRecordDetail };
}
