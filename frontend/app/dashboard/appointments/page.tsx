"use client";

import Link from "next/link";
import { useMemo } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

import { AppointmentCalendar } from "@/components/appointments/AppointmentCalendar";
import { AppointmentForm } from "@/components/appointments/AppointmentForm";
import { MockupDashboardShell } from "@/components/layout/MockupDashboardShell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
import { APPOINTMENT_STATUSES, useAppointmentsDashboardData } from "@/hooks/useAppointmentsDashboardData";
import { appointmentStatusBadgeClass } from "@/lib/appointment-styles";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/store/authStore";
import type { AppointmentListItem, AppointmentStatus, User } from "@/types";

import styles from "../theme-dashboard.module.css";

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function canManageRow(user: User | null, row: AppointmentListItem): boolean {
  if (!user) return false;
  if (user.role === "admin" || user.role === "receptionist") return true;
  if (user.role === "doctor" && row.doctor_id === user.id) return true;
  return false;
}

export default function AppointmentsPage() {
  const user = useAuthStore((s) => s.user);
  const {
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
  } = useAppointmentsDashboardData();

  const statusSummary = useMemo(() => {
    const buckets: Record<AppointmentStatus, number> = {
      scheduled: 0,
      completed: 0,
      cancelled: 0,
      no_show: 0,
    };
    for (const row of rows) {
      buckets[row.status] += 1;
    }
    return buckets;
  }, [rows]);

  return (
    <MockupDashboardShell styles={styles} user={user} activeSection="Appointments">
      <main className={styles.main}>
          <div className={styles.heroRow}>
            <div>
              <h1 className={styles.heroTitle}>Appointments</h1>
              <p className={styles.heroSubtitle}>Filter by day, doctor, and status. Slots are 30 minutes, 9:00–17:00.</p>
            </div>
            <button type="button" className={styles.makeConfBtn} onClick={() => setFormOpen(true)}>
              + New appointment
            </button>
          </div>

          <div className={styles.contentColumn}>
            <div className={styles.dataCard}>
              <header className={styles.dataHeader}>
                <div>
                  <h3 className={styles.dataTitle}>Calendar</h3>
                  <p className={styles.heroSubtitle} style={{ margin: 0 }}>
                    Days with dots have appointments. Select a day to filter the table.
                  </p>
                </div>
                <div className="flex items-center gap-1">
                  <Button
                    type="button"
                    size="icon"
                    variant="outline"
                    className="h-8 w-8"
                    onClick={() => setCalendarMonth(new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() - 1, 1))}
                    aria-label="Previous month"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <span className="min-w-[140px] text-center text-sm font-medium">
                    {calendarMonth.toLocaleString(undefined, { month: "long", year: "numeric" })}
                  </span>
                  <Button
                    type="button"
                    size="icon"
                    variant="outline"
                    className="h-8 w-8"
                    onClick={() => setCalendarMonth(new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + 1, 1))}
                    aria-label="Next month"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </header>
              <AppointmentCalendar
                embedded
                month={calendarMonth}
                onMonthChange={setCalendarMonth}
                selectedDate={filterDate}
                onSelectDate={setFilterDate}
                markedDates={markedDates}
              />
            </div>

            <div className={styles.dataCard}>
              <header className={styles.dataHeader}>
                <h3 className={styles.dataTitle}>Filters</h3>
              </header>
              <p className={styles.heroSubtitle} style={{ marginTop: 0, marginBottom: 12 }}>
                Defaults to today. Updates the list automatically.
              </p>
              <div className="flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-end">
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
                      {APPOINTMENT_STATUSES.map((s) => (
                        <SelectItem key={s} value={s}>
                          {statusLabel[s]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>

            {loadError && <p className={styles.errorText}>{loadError}</p>}
            {actionError && <p className={styles.errorText}>{actionError}</p>}

            <div className={styles.dataCard}>
              <header className={styles.dataHeader}>
                <h3 className={styles.dataTitle}>Schedule</h3>
                <span className={styles.dropdown}>Local time ▾</span>
              </header>
              <p className={styles.heroSubtitle} style={{ marginTop: 0, marginBottom: 10 }}>
                Times shown in your local timezone.
              </p>
              <div className="overflow-x-auto -mx-1">
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
                                      {APPOINTMENT_STATUSES.map((s) => (
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
              </div>
            </div>
          </div>
      </main>

      <aside className={styles.rightPanel}>
          <header className={styles.panelHeader}>
            <h3 className={styles.panelTitle}>Day overview</h3>
            <span className={styles.smallBtn}>📅</span>
          </header>

          <div className={styles.summaryCard}>
            <p className={styles.summaryLabel}>Visible appointments</p>
            <p className={styles.summaryValue}>{loading ? "…" : rows.length}</p>
            <p className={styles.summarySub}>for selected filters</p>
          </div>

          <div className={styles.summaryCard}>
            <p className={styles.summaryLabel}>Status split</p>
            <div className={styles.badgeRow}>
              <span className={styles.statBadge}>Sch {statusSummary.scheduled}</span>
              <span className={styles.statBadge}>Done {statusSummary.completed}</span>
              <span className={styles.statBadge}>Can {statusSummary.cancelled}</span>
              <span className={styles.statBadge}>NS {statusSummary.no_show}</span>
            </div>
          </div>

          <div className={styles.reminderCard}>
            <span className={styles.reminderIcon}>⏱</span>
            <p className={styles.reminderText}>Standard slots are 30 minutes between 9:00 and 17:00.</p>
          </div>

          <Link href="/dashboard/patients" className={styles.makeConfBtn} style={{ marginTop: "auto" }}>
            Patient registry
          </Link>
      </aside>

      <AppointmentForm
        open={formOpen}
        onOpenChange={setFormOpen}
        doctors={doctors}
        defaultDate={filterDate}
        defaultDoctorId={filterDoctor}
        onSaved={() => void reloadRows()}
      />
    </MockupDashboardShell>
  );
}
