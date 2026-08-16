"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
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
import { usePatients } from "@/hooks/usePatients";
import { getApiErrorMessage } from "@/lib/api-errors";
import { cn } from "@/lib/utils";
import type { AppointmentSlot, Patient, User } from "@/types";

function localDateInputValue(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function formatSlotLabel(iso: string) {
  return new Date(iso).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

type AppointmentFormProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  doctors: User[];
  defaultDate?: string;
  defaultDoctorId?: string;
  onSaved: () => void;
};

export function AppointmentForm({
  open,
  onOpenChange,
  doctors,
  defaultDate,
  defaultDoctorId,
  onSaved,
}: AppointmentFormProps) {
  const { list: searchPatients } = usePatients();
  const { fetchSlots, create } = useAppointments();

  const [patientQuery, setPatientQuery] = useState("");
  const [patientHits, setPatientHits] = useState<Patient[]>([]);
  const [patient, setPatient] = useState<Patient | null>(null);
  const [doctorId, setDoctorId] = useState<string>(defaultDoctorId || "");
  const [date, setDate] = useState(defaultDate || localDateInputValue(new Date()));
  const [slots, setSlots] = useState<AppointmentSlot[]>([]);
  const [slotStart, setSlotStart] = useState<string | null>(null);
  const [chiefComplaint, setChiefComplaint] = useState("");
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [slotError, setSlotError] = useState<string | null>(null);
  const [searchError, setSearchError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setDate(defaultDate || localDateInputValue(new Date()));
      setDoctorId(defaultDoctorId || "");
      setPatient(null);
      setPatientQuery("");
      setPatientHits([]);
      setSlotStart(null);
      setChiefComplaint("");
      setFormError(null);
      setSlotError(null);
      setSearchError(null);
    }
  }, [open, defaultDate, defaultDoctorId]);

  useEffect(() => {
    if (!open || !doctorId || !date) {
      setSlots([]);
      setSlotStart(null);
      return;
    }
    let cancelled = false;
    (async () => {
      setLoadingSlots(true);
      setSlotStart(null);
      setSlotError(null);
      try {
        const data = await fetchSlots(doctorId, date);
        if (!cancelled) setSlots(data);
      } catch (e: unknown) {
        if (!cancelled) {
          setSlots([]);
          setSlotError(getApiErrorMessage(e, "Could not load slots."));
        }
      } finally {
        if (!cancelled) setLoadingSlots(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, doctorId, date, fetchSlots]);

  useEffect(() => {
    if (!patientQuery.trim()) {
      setPatientHits([]);
      return;
    }
    const t = setTimeout(() => {
      void (async () => {
        setSearchError(null);
        try {
          const res = await searchPatients({ search: patientQuery.trim(), limit: 8, skip: 0 });
          setPatientHits(res.items);
        } catch (e: unknown) {
          setPatientHits([]);
          setSearchError(getApiErrorMessage(e, "Could not search patients."));
        }
      })();
    }, 300);
    return () => clearTimeout(t);
  }, [patientQuery, searchPatients]);

  const canSubmit = useMemo(
    () => Boolean(patient && doctorId && date && slotStart && chiefComplaint.trim()),
    [patient, doctorId, date, slotStart, chiefComplaint],
  );

  const handleSubmit = useCallback(async () => {
    if (!patient || !doctorId || !slotStart) return;
    setFormError(null);
    setSubmitting(true);
    try {
      await create({
        patient_id: patient.id,
        doctor_id: doctorId,
        scheduled_at: slotStart,
        status: "scheduled",
        chief_complaint: chiefComplaint.trim(),
        notes: null,
      });
      onSaved();
      onOpenChange(false);
    } catch (e: unknown) {
      setFormError(getApiErrorMessage(e, "Save failed"));
    } finally {
      setSubmitting(false);
    }
  }, [patient, doctorId, slotStart, chiefComplaint, create, onOpenChange, onSaved]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>New appointment</DialogTitle>
          <DialogDescription>Pick patient, doctor, date, and a free 30-minute slot (9:00–17:00).</DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-2">
          <div className="space-y-2">
            <Label>Patient</Label>
            {patient ? (
              <div className="flex items-center justify-between rounded-md border border-border px-3 py-2 text-sm">
                <span>
                  <span className="font-medium">{patient.full_name}</span>{" "}
                  <span className="font-mono text-xs text-muted-foreground">{patient.mrn}</span>
                </span>
                <Button type="button" variant="ghost" size="sm" onClick={() => setPatient(null)}>
                  Change
                </Button>
              </div>
            ) : (
              <>
                <Input
                  placeholder="Search by name or MRN…"
                  value={patientQuery}
                  onChange={(e) => setPatientQuery(e.target.value)}
                />
                {patientHits.length > 0 && (
                  <ul className="max-h-40 overflow-auto rounded-md border border-border bg-card text-sm">
                    {patientHits.map((p) => (
                      <li key={p.id}>
                        <button
                          type="button"
                          className="flex w-full flex-col items-start px-3 py-2 text-left hover:bg-muted"
                          onClick={() => {
                            setPatient(p);
                            setPatientQuery("");
                            setPatientHits([]);
                          }}
                        >
                          <span className="font-medium">{p.full_name}</span>
                          <span className="font-mono text-xs text-muted-foreground">{p.mrn}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                {searchError && <p className="text-sm text-destructive">{searchError}</p>}
              </>
            )}
          </div>

          <div className="space-y-2">
            <Label>Doctor</Label>
            <Select value={doctorId || "__none__"} onValueChange={(v) => setDoctorId(v === "__none__" ? "" : v)}>
              <SelectTrigger>
                <SelectValue placeholder="Select doctor" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">Select doctor…</SelectItem>
                {doctors.map((d) => (
                  <SelectItem key={d.id} value={d.id}>
                    {d.full_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="appt-date">Date</Label>
            <Input id="appt-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>

          <div className="space-y-2">
            <Label>Time slot</Label>
            {!doctorId ? (
              <p className="text-sm text-muted-foreground">Select a doctor to load slots.</p>
            ) : loadingSlots ? (
              <p className="text-sm text-muted-foreground">Loading slots…</p>
            ) : slotError ? (
              <p className="text-sm text-destructive">{slotError}</p>
            ) : slots.length === 0 ? (
              <p className="text-sm text-muted-foreground">No slots for this day.</p>
            ) : (
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                {slots.map((s) => {
                  const active = slotStart === s.start;
                  return (
                    <Button
                      key={s.start}
                      type="button"
                      size="sm"
                      variant={active ? "default" : "outline"}
                      disabled={!s.available}
                      className={cn(
                        "text-xs font-normal",
                        active && "bg-primary text-primary-foreground",
                        s.available && !active && "hover:bg-muted",
                      )}
                      onClick={() => setSlotStart(s.start)}
                    >
                      {formatSlotLabel(s.start)}
                    </Button>
                  );
                })}
              </div>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="cc">Chief complaint</Label>
            <Textarea id="cc" rows={3} value={chiefComplaint} onChange={(e) => setChiefComplaint(e.target.value)} />
          </div>

          {formError && <p className="text-sm text-destructive">{formError}</p>}
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
          <Button
            type="button"
            className="bg-primary text-primary-foreground"
            disabled={!canSubmit || submitting}
            onClick={() => void handleSubmit()}
          >
            {submitting ? "Saving…" : "Book appointment"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
