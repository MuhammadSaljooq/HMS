"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { ArrowLeft } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAppointments } from "@/hooks/useAppointments";
import { appointmentStatusBadgeClass } from "@/lib/appointment-styles";
import { calculateAge, formatDate } from "@/lib/patient-utils";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/store/authStore";
import type { AppointmentDetail, AppointmentStatus, User } from "@/types";

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
    try {
      const updated = await update(row.id, { notes: notes || null });
      setRow((r) => (r ? { ...r, notes: updated.notes } : null));
    } catch {
      /* ignore */
    }
  }

  async function onStatusChange(next: AppointmentStatus) {
    if (!row || next === row.status) return;
    try {
      const updated = await update(row.id, { status: next });
      setRow((r) => (r ? { ...r, status: updated.status } : null));
    } catch {
      /* ignore */
    }
  }

  async function onCancelAppt() {
    if (!row || !window.confirm("Cancel this appointment?")) return;
    try {
      await cancel(row.id);
      await load();
    } catch {
      /* ignore */
    }
  }

  if (loading) {
    return (
      <div className="mx-auto max-w-2xl py-10 text-sm text-muted-foreground">
        Loading appointment…
      </div>
    );
  }

  if (error || !row) {
    return (
      <div className="mx-auto max-w-2xl space-y-4 py-10">
        <p className="text-destructive">{error}</p>
        <Button asChild variant="outline">
          <Link href="/dashboard/appointments">Back to appointments</Link>
        </Button>
      </div>
    );
  }

  const patient = row.patient;
  const doctor = row.doctor;

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <Button type="button" variant="ghost" size="sm" className="gap-1 px-0" onClick={() => router.push("/dashboard/appointments")}>
          <ArrowLeft className="h-4 w-4" />
          Appointments
        </Button>
      </div>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Appointment</h1>
          <p className="text-sm text-muted-foreground">
            {new Date(row.scheduled_at).toLocaleString(undefined, { dateStyle: "full", timeStyle: "short" })}
          </p>
        </div>
        <Badge variant="outline" className={cn("border", appointmentStatusBadgeClass(row.status))}>
          {row.status}
        </Badge>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Patient</CardTitle>
          <CardDescription>Linked patient record</CardDescription>
        </CardHeader>
        <CardContent className="space-y-1 text-sm">
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
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Doctor</CardTitle>
        </CardHeader>
        <CardContent className="text-sm">
          {doctor ? <p className="font-medium">{doctor.full_name}</p> : <p className="text-muted-foreground">—</p>}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Chief complaint</CardTitle>
        </CardHeader>
        <CardContent className="text-sm whitespace-pre-wrap">{row.chief_complaint || "—"}</CardContent>
      </Card>

      {canManage(user, row) && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Manage</CardTitle>
            <CardDescription>Update status, notes, or cancel.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
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
          </CardContent>
        </Card>
      )}
    </div>
  );
}
