"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { ArrowLeft } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useAppointments } from "@/hooks/useAppointments";
import { appointmentStatusBadgeClass } from "@/lib/appointment-styles";
import { getApiErrorMessage } from "@/lib/api-errors";
import { calculateAge, formatDate } from "@/lib/patient-utils";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/store/authStore";
import type { AppointmentDetail, AppointmentStatus, User } from "@/types";

import styles from "../../theme-dashboard.module.css";

const STATUSES: AppointmentStatus[] = ["scheduled", "completed", "cancelled", "no_show"];

function canManage(user: User | null, row: AppointmentDetail): boolean {
  if (!user) return false;
  if (user.role === "admin" || user.role === "receptionist") return true;
  if (user.role === "doctor" && row.doctor_id === user.id) return true;
  return false;
}

export default function AppointmentDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const id = params?.id ?? "";
  const user = useAuthStore((s) => s.user);
  const { detail, update, cancel } = useAppointments();

  const [row, setRow] = useState<AppointmentDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [notes, setNotes] = useState("");

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      const data = await detail(id);
      setRow(data);
      setNotes(data.notes ?? "");
    } catch {
      setRow(null);
      setError("Appointment not found or access denied.");
    } finally {
      setLoading(false);
    }
  }, [id, detail]);

  useEffect(() => {
    void load();
  }, [load]);

  async function saveNotes() {
    if (!row) return;
    setActionError(null);
    try {
      const updated = await update(row.id, { notes: notes || null });
      setRow((r) => (r ? { ...r, notes: updated.notes } : null));
    } catch (e: unknown) {
      setActionError(getApiErrorMessage(e, "Could not save notes."));
    }
  }

  async function onStatusChange(next: AppointmentStatus) {
    if (!row || next === row.status) return;
    setActionError(null);
    try {
      const updated = await update(row.id, { status: next });
      setRow((r) => (r ? { ...r, status: updated.status } : null));
    } catch (e: unknown) {
      setActionError(getApiErrorMessage(e, "Could not update status."));
    }
  }

  async function onCancelAppt() {
    if (!row || !window.confirm("Cancel this appointment?")) return;
    setActionError(null);
    try {
      await cancel(row.id);
      await load();
    } catch (e: unknown) {
      setActionError(getApiErrorMessage(e, "Could not cancel the appointment."));
    }
  }

  if (loading) {
    return (
      <>
        <main className={styles.main}>
          <p className={styles.sectionSubtitle}>Loading appointment…</p>
        </main>
        <aside className={styles.rightPanel}>
          <header className={styles.panelHeader}>
            <h3 className={styles.panelTitle}>Visit</h3>
            <span className={styles.smallBtn}>⏳</span>
          </header>
        </aside>
      </>
    );
  }

  if (error || !row) {
    return (
      <>
        <main className={styles.main}>
          <p className={styles.errorText}>{error}</p>
          <Button asChild variant="outline">
            <Link href="/dashboard/appointments">Back to appointments</Link>
          </Button>
        </main>
        <aside className={styles.rightPanel}>
          <header className={styles.panelHeader}>
            <h3 className={styles.panelTitle}>Visit</h3>
          </header>
          <div className={styles.reminderCard}>
            <span className={styles.reminderIcon}>⚠️</span>
            <p className={styles.reminderText}>Check the appointment ID or return to the schedule list.</p>
          </div>
        </aside>
      </>
    );
  }

  const patient = row.patient;
  const doctor = row.doctor;

  return (
    <>
      <main className={styles.main}>
        <div className={styles.contentColumn}>
          <div>
            <Button type="button" variant="ghost" size="sm" className="gap-1 px-0" onClick={() => router.push("/dashboard/appointments")}>
              <ArrowLeft className="h-4 w-4" />
              Appointments
            </Button>
          </div>

          <div className={styles.heroRow}>
            <div>
              <h1 className={styles.heroTitle}>Appointment</h1>
              <p className={styles.heroSubtitle}>
                {new Date(row.scheduled_at).toLocaleString(undefined, { dateStyle: "full", timeStyle: "short" })}
              </p>
            </div>
            <Badge variant="outline" className={cn("border shrink-0", appointmentStatusBadgeClass(row.status))}>
              {row.status}
            </Badge>
          </div>

          <div className={styles.dataCard}>
            <header className={styles.dataHeader}>
              <h3 className={styles.dataTitle}>Patient</h3>
            </header>
            <p className={styles.heroSubtitle} style={{ margin: 0 }}>
              Linked patient record
            </p>
            <div className="mt-3 space-y-1 text-sm">
              {patient ? (
                <>
                  <p className="font-medium">{patient.full_name}</p>
                  <p className="font-mono text-xs text-muted-foreground">{patient.mrn}</p>
                  <p className="text-muted-foreground">
                    DOB {formatDate(patient.date_of_birth)} · {calculateAge(patient.date_of_birth)} yrs
                  </p>
                  <Button asChild variant="link" className="h-auto px-0">
                    <Link href={`/dashboard/patients/${patient.id}`}>Open patient profile</Link>
                  </Button>
                </>
              ) : (
                <p className="text-muted-foreground">Patient details unavailable.</p>
              )}
            </div>
          </div>

          <div className={styles.dataCard}>
            <header className={styles.dataHeader}>
              <h3 className={styles.dataTitle}>Doctor</h3>
            </header>
            <div className="text-sm">{doctor ? <p className="font-medium">{doctor.full_name}</p> : <p className="text-muted-foreground">—</p>}</div>
          </div>

          <div className={styles.dataCard}>
            <header className={styles.dataHeader}>
              <h3 className={styles.dataTitle}>Chief complaint</h3>
            </header>
            <div className="text-sm whitespace-pre-wrap">{row.chief_complaint || "—"}</div>
          </div>

          {canManage(user, row) && (
            <div className={styles.dataCard}>
              <header className={styles.dataHeader}>
                <h3 className={styles.dataTitle}>Manage</h3>
                <span className={styles.dropdown}>Actions ▾</span>
              </header>
              <p className={styles.heroSubtitle} style={{ margin: 0 }}>
                Update status, notes, or cancel.
              </p>
              <div className="mt-4 space-y-4">
                <div className="space-y-2">
                  <Label>Status</Label>
                  <Select value={row.status} onValueChange={(v) => void onStatusChange(v as AppointmentStatus)}>
                    <SelectTrigger className="max-w-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {STATUSES.map((s) => (
                        <SelectItem key={s} value={s}>
                          {s}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="notes">Notes</Label>
                  <Textarea id="notes" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
                  <Button type="button" size="sm" variant="secondary" onClick={() => void saveNotes()}>
                    Save notes
                  </Button>
                </div>
                {row.status !== "cancelled" && (
                  <Button type="button" variant="destructive" onClick={() => void onCancelAppt()}>
                    Cancel appointment
                  </Button>
                )}
                {actionError && (
                  <p className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-600">
                    {actionError}
                  </p>
                )}
              </div>
            </div>
          )}
        </div>
      </main>

      <aside className={styles.rightPanel}>
        <header className={styles.panelHeader}>
          <h3 className={styles.panelTitle}>Visit checklist</h3>
          <span className={styles.smallBtn}>📋</span>
        </header>
        <div className={styles.reminderCard}>
          <span className={styles.reminderIcon}>✓</span>
          <p className={styles.reminderText}>Confirm patient identity and chief complaint before changing status.</p>
        </div>
        <div className={styles.summaryCard}>
          <p className={styles.summaryLabel}>Quick links</p>
          <div className="mt-2 flex flex-col gap-2">
            <Button asChild variant="outline" size="sm">
              <Link href="/dashboard/appointments">All appointments</Link>
            </Button>
            {patient ? (
              <Button asChild variant="outline" size="sm">
                <Link href={`/dashboard/patients/${patient.id}`}>Patient chart</Link>
              </Button>
            ) : null}
          </div>
        </div>
      </aside>
    </>
  );
}
