"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

import { AppointmentCalendar } from "@/components/appointments/AppointmentCalendar";
import { AppointmentForm } from "@/components/appointments/AppointmentForm";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useAppointments } from "@/hooks/useAppointments";
import { appointmentStatusBadgeClass } from "@/lib/appointment-styles";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/store/authStore";
import type { AppointmentListItem, AppointmentStatus, User } from "@/types";

const STATUSES: AppointmentStatus[] = ["scheduled", "completed", "cancelled", "no_show"];

function localDateInputValue(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function dayKeyFromIso(iso: string) {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function canManageRow(user: User | null, row: AppointmentListItem): boolean {
  if (!user) return false;
  if (user.role === "admin" || user.role === "receptionist") return true;
  if (user.role === "doctor" && row.doctor_id === user.id) return true;
  return false;
}

export default function AppointmentsPage() {
  const user = useAuthStore((s) => s.user);
  const { list, update, cancel } = useAppointments();

  const [rows, setRows] = useState<AppointmentListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
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
    let cancelled = false;
    (async () => {
      try {
        const data = await list({
          from_date: from.toISOString(),
          to_date: to.toISOString(),
          doctor_id: filterDoctor || undefined,
          status: (filterStatus as AppointmentStatus) || undefined,
        });
        if (!cancelled) setMarkedDates(new Set(data.map((r) => dayKeyFromIso(r.scheduled_at))));
      } catch {
        if (!cancelled) setMarkedDates(new Set());
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [calendarMonth, filterDoctor, filterStatus, list]);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const data = await list({
        date: filterDate,
        doctor_id: filterDoctor || undefined,
        status: (filterStatus as AppointmentStatus) || undefined,
      });
      setRows(data);
    } catch {
      setRows([]);
      setLoadError("Could not load appointments.");
    } finally {
      setLoading(false);
    }
  }, [list, filterDate, filterDoctor, filterStatus]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data } = await api.get<User[]>("/users/doctors");
        if (!cancelled) setDoctors(data);
      } catch {
        if (!cancelled) setDoctors([]);
      }
    })();
    return () => {
      cancelled = true;
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

  async function onStatusChange(row: AppointmentListItem, next: AppointmentStatus) {
    if (next === row.status) return;
    try {
      await update(row.id, { status: next });
      await load();
    } catch {
      /* toast optional */
    }
  }

  async function onCancel(row: AppointmentListItem) {
    if (!window.confirm("Cancel this appointment?")) return;
    try {
      await cancel(row.id);
      await load();
    } catch {
      /* ignore */
    }
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Appointments</h1>
          <p className="text-sm text-muted-foreground">Filter by day, doctor, and status. Slots are 30 minutes, 9:00–17:00.</p>
        </div>
        <Button className="bg-primary text-primary-foreground shrink-0" onClick={() => setFormOpen(true)}>
          New appointment
        </Button>
      </div>

      <AppointmentCalendar
        month={calendarMonth}
        onMonthChange={setCalendarMonth}
        selectedDate={filterDate}
        onSelectDate={setFilterDate}
        markedDates={markedDates}
      />

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Filters</CardTitle>
          <CardDescription>Defaults to today. Updates the list automatically.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-end">
          <div className="space-y-2">
            <Label htmlFor="f-date">Date</Label>
            <Input id="f-date" type="date" value={filterDate} onChange={(e) => setFilterDate(e.target.value)} />
          </div>
          <div className="space-y-2 sm:min-w-[200px]">
            <Label>Doctor</Label>
            <Select value={filterDoctor || "__all__"} onValueChange={(v) => setFilterDoctor(v === "__all__" ? "" : v)}>
              <SelectTrigger>
                <SelectValue placeholder="All doctors" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">All doctors</SelectItem>
                {doctors.map((d) => (
                  <SelectItem key={d.id} value={d.id}>
                    {d.full_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2 sm:min-w-[180px]">
            <Label>Status</Label>
            <Select value={filterStatus || "__all__"} onValueChange={(v) => setFilterStatus(v === "__all__" ? "" : v)}>
              <SelectTrigger>
                <SelectValue placeholder="All statuses" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">All statuses</SelectItem>
                {STATUSES.map((s) => (
                  <SelectItem key={s} value={s}>
                    {statusLabel[s]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {loadError && <p className="text-sm text-destructive">{loadError}</p>}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Schedule</CardTitle>
          <CardDescription>Times shown in your local timezone.</CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Time</TableHead>
                <TableHead>Patient</TableHead>
                <TableHead>Doctor</TableHead>
                <TableHead>Chief complaint</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading && (
                <TableRow>
                  <TableCell colSpan={6} className="text-muted-foreground">
                    Loading…
                  </TableCell>
                </TableRow>
              )}
              {!loading && rows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground">
                    No appointments for this filter.
                  </TableCell>
                </TableRow>
              )}
              {!loading &&
                rows.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="whitespace-nowrap font-medium">
                      <Link className="text-primary hover:underline" href={`/dashboard/appointments/${row.id}`}>
                        {formatDateTime(row.scheduled_at)}
                      </Link>
                    </TableCell>
                    <TableCell>{row.patient_full_name}</TableCell>
                    <TableCell>{row.doctor_full_name}</TableCell>
                    <TableCell className="max-w-[220px] truncate text-muted-foreground text-sm">
                      {row.chief_complaint || "—"}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={cn("border", appointmentStatusBadgeClass(row.status))}>
                        {statusLabel[row.status]}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex flex-wrap justify-end gap-2">
                        {canManageRow(user, row) && row.status !== "cancelled" && (
                          <>
                            <Select
                              value={row.status}
                              onValueChange={(v) => void onStatusChange(row, v as AppointmentStatus)}
                            >
                              <SelectTrigger className="h-8 w-[130px]">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {STATUSES.map((s) => (
                                  <SelectItem key={s} value={s}>
                                    {statusLabel[s]}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <Button type="button" variant="outline" size="sm" onClick={() => void onCancel(row)}>
                              Cancel
                            </Button>
                          </>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <AppointmentForm
        open={formOpen}
        onOpenChange={setFormOpen}
        doctors={doctors}
        defaultDate={filterDate}
        defaultDoctorId={filterDoctor}
        onSaved={() => void load()}
      />
    </div>
  );
}
