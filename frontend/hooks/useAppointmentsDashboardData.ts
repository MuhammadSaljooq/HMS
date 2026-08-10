"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { useAppointments } from "@/hooks/useAppointments";
import { api } from "@/lib/api";
import { getApiErrorMessage } from "@/lib/api-errors";
import type { AppointmentListItem, AppointmentStatus, User } from "@/types";

export const APPOINTMENT_STATUSES: AppointmentStatus[] = ["scheduled", "completed", "cancelled", "no_show"];

function localDateInputValue(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function dayKeyFromIso(iso: string) {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function useAppointmentsDashboardData() {
  const { list, update, cancel } = useAppointments();
  const [rows, setRows] = useState<AppointmentListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [filterDate, setFilterDate] = useState(() => localDateInputValue(new Date()));
  const [filterDoctor, setFilterDoctor] = useState<string>("");
  const [filterStatus, setFilterStatus] = useState<string>("");
  const [doctors, setDoctors] = useState<User[]>([]);
  const [formOpen, setFormOpen] = useState(false);
  const [calendarMonth, setCalendarMonth] = useState(() => {
    const t = new Date();
    return new Date(t.getFullYear(), t.getMonth(), 1);
  });
  const [markedDates, setMarkedDates] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!filterDate) return;
    const t = new Date(`${filterDate}T12:00:00`);
    setCalendarMonth(new Date(t.getFullYear(), t.getMonth(), 1));
  }, [filterDate]);

  useEffect(() => {
    const y = calendarMonth.getFullYear();
    const m = calendarMonth.getMonth();
    const from = new Date(y, m, 1);
    const to = new Date(y, m + 1, 0, 23, 59, 59, 999);
    let isCancelled = false;
    (async () => {
      try {
        const data = await list({
          from_date: from.toISOString(),
          to_date: to.toISOString(),
          doctor_id: filterDoctor || undefined,
          status: (filterStatus as AppointmentStatus) || undefined,
        });
        if (!isCancelled) setMarkedDates(new Set(data.map((r) => dayKeyFromIso(r.scheduled_at))));
      } catch {
        if (!isCancelled) setMarkedDates(new Set());
      }
    })();
    return () => {
      isCancelled = true;
    };
  }, [calendarMonth, filterDoctor, filterStatus, list]);

  const reloadRows = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const data = await list({
        date: filterDate,
        doctor_id: filterDoctor || undefined,
        status: (filterStatus as AppointmentStatus) || undefined,
      });
      setRows(data);
    } catch (e: unknown) {
      setRows([]);
      setLoadError(getApiErrorMessage(e, "Could not load appointments."));
    } finally {
      setLoading(false);
    }
  }, [filterDate, filterDoctor, filterStatus, list]);

  useEffect(() => {
    void reloadRows();
  }, [reloadRows]);

  useEffect(() => {
    let isCancelled = false;
    (async () => {
      try {
        const { data } = await api.get<User[]>("/users/doctors");
        if (!isCancelled) setDoctors(data);
      } catch {
        if (!isCancelled) setDoctors([]);
      }
    })();
    return () => {
      isCancelled = true;
    };
  }, []);

  const statusLabel = useMemo(
    () =>
      ({
        scheduled: "Scheduled",
        completed: "Completed",
        cancelled: "Cancelled",
        no_show: "No-show",
      }) as Record<AppointmentStatus, string>,
    [],
  );

  const onStatusChange = useCallback(
    async (row: AppointmentListItem, next: AppointmentStatus) => {
      if (next === row.status) return;
      try {
        setActionError(null);
        await update(row.id, { status: next });
        await reloadRows();
      } catch (e: unknown) {
        setActionError(getApiErrorMessage(e, "Could not update appointment status."));
      }
    },
    [reloadRows, update],
  );

  const onCancel = useCallback(
    async (row: AppointmentListItem) => {
      if (!window.confirm("Cancel this appointment?")) return;
      try {
        setActionError(null);
        await cancel(row.id);
        await reloadRows();
      } catch (e: unknown) {
        setActionError(getApiErrorMessage(e, "Could not cancel appointment."));
      }
    },
    [cancel, reloadRows],
  );

  return {
    rows,
    loading,
    loadError,
    actionError,
    filterDate,
    filterDoctor,
    filterStatus,
    doctors,
    formOpen,
    calendarMonth,
    markedDates,
    statusLabel,
    setFilterDate,
    setFilterDoctor,
    setFilterStatus,
    setFormOpen,
    setCalendarMonth,
    onStatusChange,
    onCancel,
    reloadRows,
  };
}
