"use client";

import { useCallback, useState } from "react";

import { api } from "@/lib/api";
import type {
  Appointment,
  MedicalRecord,
  MedicalRecordDetail,
  Patient,
  PatientListResponse,
  Transcription,
  Vitals,
} from "@/types";

type UsePatientsState = {
  loading: boolean;
  error: string | null;
};

export function usePatients() {
  const [state, setState] = useState<UsePatientsState>({ loading: false, error: null });

  const list = useCallback(
    async (params?: {
      search?: string;
      skip?: number;
      limit?: number;
      sort_by?: string;
      sort_order?: "asc" | "desc";
    }) => {
      setState({ loading: true, error: null });
      try {
        const { data } = await api.get<PatientListResponse>("/patients", { params });
        setState({ loading: false, error: null });
        return data;
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : "Failed to load patients";
        setState({ loading: false, error: msg });
        throw e;
      }
    },
    [],
  );

  const getById = useCallback(async (id: string) => {
    setState({ loading: true, error: null });
    try {
      const { data } = await api.get<Patient>(`/patients/${id}`);
      setState({ loading: false, error: null });
      return data;
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Failed to load patient";
      setState({ loading: false, error: msg });
      throw e;
    }
  }, []);

  const create = useCallback(async (body: Record<string, unknown>) => {
    setState({ loading: true, error: null });
    try {
      const { data } = await api.post<Patient>("/patients", body);
      setState({ loading: false, error: null });
      return data;
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Failed to create patient";
      setState({ loading: false, error: msg });
      throw e;
    }
  }, []);

  const update = useCallback(async (id: string, body: Partial<Patient>) => {
    setState({ loading: true, error: null });
    try {
      const { data } = await api.patch<Patient>(`/patients/${id}`, body);
      setState({ loading: false, error: null });
      return data;
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Failed to update patient";
      setState({ loading: false, error: msg });
      throw e;
    }
  }, []);

  const remove = useCallback(async (id: string) => {
    setState({ loading: true, error: null });
    try {
      await api.delete(`/patients/${id}`);
      setState({ loading: false, error: null });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Failed to delete patient";
      setState({ loading: false, error: msg });
      throw e;
    }
  }, []);

  const listVitals = useCallback(async (patientId: string) => {
    const { data } = await api.get<Vitals[]>(`/patients/${patientId}/vitals`);
    return data;
  }, []);

  const addVitals = useCallback(async (patientId: string, body: Record<string, unknown>) => {
    const { data } = await api.post<Vitals>(`/patients/${patientId}/vitals`, body);
    return data;
  }, []);

  const listAppointments = useCallback(async (patientId: string) => {
    const { data } = await api.get<Appointment[]>("/appointments", { params: { patient_id: patientId } });
    return data;
  }, []);

  const listRecords = useCallback(async (patientId: string) => {
    const { data } = await api.get<MedicalRecord[]>("/records", { params: { patient_id: patientId } });
    return data;
  }, []);

  const getRecordDetail = useCallback(async (recordId: string) => {
    const { data } = await api.get<MedicalRecordDetail>(`/records/${recordId}`);
    return data;
  }, []);

  const listTranscriptions = useCallback(async (patientId: string) => {
    const { data } = await api.get<Transcription[]>(`/patients/${patientId}/transcriptions`);
    return data;
  }, []);

  return {
    ...state,
    list,
    getById,
    create,
    update,
    remove,
    listVitals,
    addVitals,
    listAppointments,
    listRecords,
    getRecordDetail,
    listTranscriptions,
  };
}
