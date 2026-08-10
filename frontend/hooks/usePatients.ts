"use client";

import { useCallback, useState } from "react";

import { api } from "@/lib/api";
import { getApiErrorMessage } from "@/lib/api-errors";
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
  loadingByOperation: Partial<Record<"list" | "getById" | "create" | "update" | "remove", boolean>>;
  errorByOperation: Partial<Record<"list" | "getById" | "create" | "update" | "remove", string | null>>;
};

export function usePatients() {
  const [state, setState] = useState<UsePatientsState>({
    loading: false,
    error: null,
    loadingByOperation: {},
    errorByOperation: {},
  });

  const begin = useCallback((op: keyof UsePatientsState["loadingByOperation"]) => {
    setState((prev) => ({
      ...prev,
      loading: true,
      error: null,
      loadingByOperation: { ...prev.loadingByOperation, [op]: true },
      errorByOperation: { ...prev.errorByOperation, [op]: null },
    }));
  }, []);

  const succeed = useCallback((op: keyof UsePatientsState["loadingByOperation"]) => {
    setState((prev) => {
      const nextLoadingByOperation = { ...prev.loadingByOperation, [op]: false };
      return {
        ...prev,
        loading: Object.values(nextLoadingByOperation).some(Boolean),
        loadingByOperation: nextLoadingByOperation,
      };
    });
  }, []);

  const fail = useCallback((op: keyof UsePatientsState["loadingByOperation"], e: unknown, fallback: string) => {
    const msg = getApiErrorMessage(e, fallback);
    setState((prev) => {
      const nextLoadingByOperation = { ...prev.loadingByOperation, [op]: false };
      return {
        ...prev,
        loading: Object.values(nextLoadingByOperation).some(Boolean),
        error: msg,
        loadingByOperation: nextLoadingByOperation,
        errorByOperation: { ...prev.errorByOperation, [op]: msg },
      };
    });
  }, []);

  const list = useCallback(
    async (params?: {
      search?: string;
      skip?: number;
      limit?: number;
      sort_by?: string;
      sort_order?: "asc" | "desc";
    }) => {
      begin("list");
      try {
        const { data } = await api.get<PatientListResponse>("/patients", { params });
        succeed("list");
        return data;
      } catch (e: unknown) {
        fail("list", e, "Failed to load patients");
        throw e;
      }
    },
    [begin, fail, succeed],
  );

  const getById = useCallback(async (id: string) => {
    begin("getById");
    try {
      const { data } = await api.get<Patient>(`/patients/${id}`);
      succeed("getById");
      return data;
    } catch (e: unknown) {
      fail("getById", e, "Failed to load patient");
      throw e;
    }
  }, [begin, fail, succeed]);

  const create = useCallback(async (body: Record<string, unknown>) => {
    begin("create");
    try {
      const { data } = await api.post<Patient>("/patients", body);
      succeed("create");
      return data;
    } catch (e: unknown) {
      fail("create", e, "Failed to create patient");
      throw e;
    }
  }, [begin, fail, succeed]);

  const update = useCallback(async (id: string, body: Partial<Patient>) => {
    begin("update");
    try {
      const { data } = await api.patch<Patient>(`/patients/${id}`, body);
      succeed("update");
      return data;
    } catch (e: unknown) {
      fail("update", e, "Failed to update patient");
      throw e;
    }
  }, [begin, fail, succeed]);

  const remove = useCallback(async (id: string) => {
    begin("remove");
    try {
      await api.delete(`/patients/${id}`);
      succeed("remove");
    } catch (e: unknown) {
      fail("remove", e, "Failed to delete patient");
      throw e;
    }
  }, [begin, fail, succeed]);

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
