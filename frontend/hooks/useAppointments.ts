"use client";

import { useCallback, useState } from "react";

import { api } from "@/lib/api";
import { getApiErrorMessage } from "@/lib/api-errors";
import type {
  Appointment,
  AppointmentDetail,
  AppointmentListItem,
  AppointmentSlot,
  AppointmentStatus,
} from "@/types";

export type AppointmentListParams = {
  date?: string;
  doctor_id?: string;
  status?: AppointmentStatus;
  patient_id?: string;
  from_date?: string;
  to_date?: string;
};

export function useAppointments() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadingByOperation, setLoadingByOperation] = useState<Record<string, boolean>>({});
  const [errorByOperation, setErrorByOperation] = useState<Record<string, string | null>>({});

  const begin = useCallback((operation: string) => {
    setLoadingByOperation((prev) => {
      const next = { ...prev, [operation]: true };
      setLoading(Object.values(next).some(Boolean));
      return next;
    });
    setError(null);
    setErrorByOperation((prev) => ({ ...prev, [operation]: null }));
  }, []);

  const end = useCallback((operation: string) => {
    setLoadingByOperation((prev) => {
      const next = { ...prev, [operation]: false };
      setLoading(Object.values(next).some(Boolean));
      return next;
    });
  }, []);

  const fail = useCallback((operation: string, e: unknown, fallback: string) => {
    const msg = getApiErrorMessage(e, fallback);
    setError(msg);
    setErrorByOperation((prev) => ({ ...prev, [operation]: msg }));
    setLoadingByOperation((prev) => {
      const next = { ...prev, [operation]: false };
      setLoading(Object.values(next).some(Boolean));
      return next;
    });
  }, []);

  const list = useCallback(async (params?: AppointmentListParams) => {
    begin("list");
    try {
      const { data } = await api.get<AppointmentListItem[]>("/appointments", {
        params: {
          date: params?.date || undefined,
          doctor_id: params?.doctor_id || undefined,
          status: params?.status || undefined,
          patient_id: params?.patient_id || undefined,
          from_date: params?.from_date || undefined,
          to_date: params?.to_date || undefined,
        },
      });
      end("list");
      return data;
    } catch (e: unknown) {
      fail("list", e, "Failed to load appointments");
      throw e;
    }
  }, [begin, end, fail]);

  const fetchSlots = useCallback(async (doctorId: string, date: string) => {
    begin("fetchSlots");
    try {
      const { data } = await api.get<AppointmentSlot[]>(`/appointments/slots/${doctorId}`, {
        params: { date },
      });
      end("fetchSlots");
      return data;
    } catch (e: unknown) {
      fail("fetchSlots", e, "Failed to load available slots");
      throw e;
    }
  }, [begin, end, fail]);

  const create = useCallback(async (body: Record<string, unknown>) => {
    begin("create");
    try {
      const { data } = await api.post<Appointment>("/appointments", body);
      end("create");
      return data;
    } catch (e: unknown) {
      fail("create", e, "Failed to create appointment");
      throw e;
    }
  }, [begin, end, fail]);

  const update = useCallback(async (id: string, body: Partial<Appointment>) => {
    begin("update");
    try {
      const { data } = await api.patch<Appointment>(`/appointments/${id}`, body);
      end("update");
      return data;
    } catch (e: unknown) {
      fail("update", e, "Failed to update appointment");
      throw e;
    }
  }, [begin, end, fail]);

  const cancel = useCallback(async (id: string) => {
    begin("cancel");
    try {
      await api.delete(`/appointments/${id}`);
      end("cancel");
    } catch (e: unknown) {
      fail("cancel", e, "Failed to cancel appointment");
      throw e;
    }
  }, [begin, end, fail]);

  const detail = useCallback(async (id: string) => {
    begin("detail");
    try {
      const { data } = await api.get<AppointmentDetail>(`/appointments/${id}`);
      end("detail");
      return data;
    } catch (e: unknown) {
      fail("detail", e, "Failed to load appointment details");
      throw e;
    }
  }, [begin, end, fail]);

  return { loading, error, loadingByOperation, errorByOperation, list, fetchSlots, create, update, cancel, detail };
}
