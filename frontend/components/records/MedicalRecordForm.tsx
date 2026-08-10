"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect, useState } from "react";
import { useFieldArray, useForm } from "react-hook-form";
import { z } from "zod";

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
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/lib/api";
import { getApiErrorMessage } from "@/lib/api-errors";
import { useAuthStore } from "@/store/authStore";
import type { MedicalRecord, User } from "@/types";

const prescriptionSchema = z.object({
  medication_name: z.string().max(255),
  dosage: z.string().max(255),
  frequency: z.string().max(255),
  duration_days: z
    .string()
    .refine((s) => {
      if (!s.trim()) return true;
      const n = Number(s);
      return Number.isInteger(n) && n >= 1 && n <= 3650;
    }, "Duration must be a whole number of days (1–3650)"),
  instructions: z.string().max(4000),
});

const recordSchema = z.object({
  doctor_id: z.string(),
  diagnosis: z.string().max(8000).optional().or(z.literal("")),
  notes: z.string().max(8000).optional().or(z.literal("")),
  prescriptions: z.array(prescriptionSchema),
});

export type MedicalRecordFormValues = z.infer<typeof recordSchema>;

type MedicalRecordFormProps = {
  patientId: string;
  onSubmit: (payload: Record<string, unknown>) => Promise<MedicalRecord>;
  onCancel?: () => void;
};

const emptyPrescription = {
  medication_name: "",
  dosage: "",
  frequency: "",
  duration_days: "",
  instructions: "",
};

export function MedicalRecordForm({ patientId, onSubmit, onCancel }: MedicalRecordFormProps) {
  const user = useAuthStore((s) => s.user);
  const isDoctor = user?.role === "doctor";

  const [serverError, setServerError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [doctors, setDoctors] = useState<User[]>([]);
  const [doctorsError, setDoctorsError] = useState<string | null>(null);

  const form = useForm<MedicalRecordFormValues>({
    resolver: zodResolver(recordSchema),
    defaultValues: {
      doctor_id: isDoctor && user ? user.id : "",
      diagnosis: "",
      notes: "",
      prescriptions: [],
    },
  });

  const { fields, append, remove } = useFieldArray({ control: form.control, name: "prescriptions" });

  // Admins must choose which doctor authors the record; doctors author their own.
  useEffect(() => {
    if (isDoctor) {
      if (user) form.setValue("doctor_id", user.id);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const { data } = await api.get<User[]>("/users/doctors");
        if (!cancelled) setDoctors(data);
      } catch (e: unknown) {
        if (!cancelled) setDoctorsError(getApiErrorMessage(e, "Could not load doctors."));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isDoctor, user, form]);

  async function handleSubmit(values: MedicalRecordFormValues) {
    setServerError(null);
    setSuccess(false);

    if (!values.doctor_id) {
      form.setError("doctor_id", { message: "Select the attending doctor." });
      return;
    }

    const prescriptions = values.prescriptions
      .filter((rx) => rx.medication_name.trim() || rx.dosage.trim() || rx.frequency.trim())
      .map((rx) => {
        const missing: string[] = [];
        if (!rx.medication_name.trim()) missing.push("medication");
        if (!rx.dosage.trim()) missing.push("dosage");
        if (!rx.frequency.trim()) missing.push("frequency");
        return { rx, missing };
      });

    const incomplete = prescriptions.find((p) => p.missing.length > 0);
    if (incomplete) {
      form.setError("root", {
        message: `Each prescription needs medication, dosage, and frequency.`,
      });
      return;
    }

    const payload: Record<string, unknown> = {
      patient_id: patientId,
      doctor_id: values.doctor_id,
      diagnosis: values.diagnosis?.trim() || null,
      notes: values.notes?.trim() || null,
    };
    if (prescriptions.length) {
      payload.prescriptions = prescriptions.map(({ rx }) => ({
        medication_name: rx.medication_name.trim(),
        dosage: rx.dosage.trim(),
        frequency: rx.frequency.trim(),
        duration_days: rx.duration_days.trim() ? Number(rx.duration_days) : null,
        instructions: rx.instructions.trim() || null,
      }));
    }

    try {
      await onSubmit(payload);
      setSuccess(true);
      form.reset({
        doctor_id: isDoctor && user ? user.id : "",
        diagnosis: "",
        notes: "",
        prescriptions: [],
      });
    } catch (e: unknown) {
      setServerError(getApiErrorMessage(e, "Could not create the record."));
    }
  }

  return (
    <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
      {success && (
        <p className="rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700">
          Medical record created.
        </p>
      )}

      {!isDoctor && (
        <div className="space-y-2">
          <Label>Attending doctor</Label>
          <Select value={form.watch("doctor_id") || ""} onValueChange={(v) => form.setValue("doctor_id", v)}>
            <SelectTrigger>
              <SelectValue placeholder="Select doctor" />
            </SelectTrigger>
            <SelectContent>
              {doctors.map((d) => (
                <SelectItem key={d.id} value={d.id}>
                  {d.full_name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {doctorsError && <p className="text-sm text-destructive">{doctorsError}</p>}
          {form.formState.errors.doctor_id && (
            <p className="text-sm text-destructive">{form.formState.errors.doctor_id.message}</p>
          )}
        </div>
      )}

      <div className="space-y-2">
        <Label htmlFor="record-diagnosis">Diagnosis</Label>
        <Input id="record-diagnosis" {...form.register("diagnosis")} placeholder="Optional" />
        {form.formState.errors.diagnosis && (
          <p className="text-sm text-destructive">{form.formState.errors.diagnosis.message}</p>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="record-notes">Notes</Label>
        <Textarea id="record-notes" rows={4} {...form.register("notes")} placeholder="Optional encounter notes" />
        {form.formState.errors.notes && (
          <p className="text-sm text-destructive">{form.formState.errors.notes.message}</p>
        )}
      </div>

      <div className="space-y-3 rounded-lg border border-border p-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium">Prescriptions</p>
            <p className="text-xs text-muted-foreground">Optional. Add one row per medication.</p>
          </div>
          <Button type="button" variant="outline" size="sm" onClick={() => append({ ...emptyPrescription })}>
            Add prescription
          </Button>
        </div>

        {fields.length === 0 ? (
          <p className="text-sm text-muted-foreground">No prescriptions added.</p>
        ) : (
          <div className="space-y-4">
            {fields.map((field, index) => (
              <div key={field.id} className="space-y-3 rounded-md border border-border bg-muted/20 p-3">
                <div className="grid gap-3 sm:grid-cols-3">
                  <div className="space-y-1">
                    <Label htmlFor={`rx-med-${index}`}>Medication</Label>
                    <Input id={`rx-med-${index}`} {...form.register(`prescriptions.${index}.medication_name`)} />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor={`rx-dose-${index}`}>Dosage</Label>
                    <Input id={`rx-dose-${index}`} {...form.register(`prescriptions.${index}.dosage`)} />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor={`rx-freq-${index}`}>Frequency</Label>
                    <Input id={`rx-freq-${index}`} {...form.register(`prescriptions.${index}.frequency`)} />
                  </div>
                </div>
                <div className="grid gap-3 sm:grid-cols-3">
                  <div className="space-y-1">
                    <Label htmlFor={`rx-days-${index}`}>Duration (days)</Label>
                    <Input
                      id={`rx-days-${index}`}
                      type="number"
                      inputMode="numeric"
                      min={1}
                      max={3650}
                      {...form.register(`prescriptions.${index}.duration_days`)}
                    />
                    {form.formState.errors.prescriptions?.[index]?.duration_days && (
                      <p className="text-sm text-destructive">
                        {form.formState.errors.prescriptions[index]?.duration_days?.message}
                      </p>
                    )}
                  </div>
                  <div className="space-y-1 sm:col-span-2">
                    <Label htmlFor={`rx-instr-${index}`}>Instructions</Label>
                    <Input id={`rx-instr-${index}`} {...form.register(`prescriptions.${index}.instructions`)} />
                  </div>
                </div>
                <div className="flex justify-end">
                  <Button type="button" variant="ghost" size="sm" onClick={() => remove(index)}>
                    Remove
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {form.formState.errors.root && (
        <p className="text-sm text-destructive">{form.formState.errors.root.message}</p>
      )}
      {serverError && (
        <p className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-600">
          {serverError}
        </p>
      )}

      <div className="flex flex-wrap gap-3">
        <Button type="submit" disabled={form.formState.isSubmitting}>
          {form.formState.isSubmitting ? "Saving…" : "Create record"}
        </Button>
        {onCancel && (
          <Button type="button" variant="outline" onClick={onCancel}>
            Cancel
          </Button>
        )}
      </div>
    </form>
  );
}
