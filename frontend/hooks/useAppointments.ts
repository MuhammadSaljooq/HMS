"use client";

import { useCallback, useState } from "react";

import { api } from "@/lib/api";
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

  const list = useCallback(async (params?: AppointmentListParams) => {
    setLoading(true);
    setError(null);
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
      setLoading(false);
      return data;
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Failed to load appointments";
      setLoading(false);
      setError(msg);
      throw e;
    }
  }, []);

  const fetchSlots = useCallback(async (doctorId: string, date: string) => {
    const { data } = await api.get<AppointmentSlot[]>(`/appointments/slots/${doctorId}`, {
      params: { date },
    });
    return data;
  }, []);

  const create = useCallback(async (body: Record<string, unknown>) => {
    const { data } = await api.post<Appointment>("/appointments", body);
    return data;
  }, []);

  const update = useCallback(async (id: string, body: Partial<Appointment>) => {
    const { data } = await api.patch<Appointment>(`/appointments/${id}`, body);
    return data;
  }, []);

  const cancel = useCallback(async (id: string) => {
    await api.delete(`/appointments/${id}`);
  }, []);

  const detail = useCallback(async (id: string) => {
    const { data } = await api.get<AppointmentDetail>(`/appointments/${id}`);
    return data;
  }, []);

  return { loading, error, list, fetchSlots, create, update, cancel, detail };
}
