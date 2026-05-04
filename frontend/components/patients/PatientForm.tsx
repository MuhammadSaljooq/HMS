"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

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
import { Textarea } from "@/components/ui/textarea";
import { calculateAge } from "@/lib/patient-utils";
import type { Patient } from "@/types";

const BLOOD_GROUPS = ["A+", "A-", "B+", "B-", "O+", "O-", "AB+", "AB-"] as const;

const pakPhone = z.union([
  z.literal(""),
  z.string().regex(/^(\+92[0-9]{10}|0[0-9]{10})$/, "Use +92XXXXXXXXXX or 0XXXXXXXXXX (10 digits after prefix)"),
]);

const patientSchema = z.object({
  full_name: z.string().min(1, "Full name is required").max(255),
  date_of_birth: z
    .string()
    .min(1, "Date of birth is required")
    .refine((s) => !Number.isNaN(Date.parse(s)), "Invalid date")
    .refine((s) => {
      const d = new Date(s + "T12:00:00");
      const end = new Date();
      end.setHours(23, 59, 59, 999);
      return d <= end;
    }, "Date of birth cannot be in the future")
    .refine((s) => {
      const dob = new Date(s + "T12:00:00");
      return dob.getTime() < Date.now();
    }, "Date of birth must be in the past")
    .refine((s) => calculateAge(s) >= 0, "Invalid age"),
  gender: z.string().optional().or(z.literal("")),
  phone: pakPhone,
  address: z.string().optional().or(z.literal("")),
  blood_group: z.string().optional().or(z.literal("")),
  emergency_contact_name: z.string().optional().or(z.literal("")),
  emergency_contact_phone: pakPhone,
});

function formatApiError(e: unknown): string {
  if (typeof e === "object" && e !== null && "response" in e) {
    const data = (e as { response?: { data?: { detail?: unknown } } }).response?.data;
    const d = data?.detail;
    if (typeof d === "string") return d;
    if (Array.isArray(d)) return d.map((x) => (typeof x === "object" ? JSON.stringify(x) : String(x))).join("; ");
  }
  return "Save failed";
}

export type PatientFormValues = z.infer<typeof patientSchema>;

type PatientFormProps = {
  onSubmit: (values: Record<string, unknown>) => Promise<Patient>;
  onCancel?: () => void;
};

export function PatientForm({ onSubmit, onCancel }: PatientFormProps) {
  const [serverError, setServerError] = useState<string | null>(null);
  const [created, setCreated] = useState<Patient | null>(null);

  const form = useForm<PatientFormValues>({
    resolver: zodResolver(patientSchema),
    defaultValues: {
      full_name: "",
      date_of_birth: "",
      gender: "",
      phone: "",
      address: "",
      blood_group: "",
      emergency_contact_name: "",
      emergency_contact_phone: "",
    },
  });

  async function handleSubmit(values: PatientFormValues) {
    setServerError(null);
    setCreated(null);
    const payload: Record<string, unknown> = {
      full_name: values.full_name.trim(),
      date_of_birth: values.date_of_birth,
      gender: values.gender || null,
      phone: values.phone?.trim() || null,
      address: values.address?.trim() || null,
      blood_group: values.blood_group || null,
      emergency_contact_name: values.emergency_contact_name?.trim() || null,
      emergency_contact_phone: values.emergency_contact_phone?.trim() || null,
    };
    try {
      const patient = await onSubmit(payload);
      setCreated(patient);
      form.reset();
    } catch (e: unknown) {
      setServerError(formatApiError(e));
    }
  }

  return (
    <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-5">
      {created && (
        <div className="rounded-lg border border-primary/30 bg-primary/5 p-4 text-sm">
          <p className="font-medium text-primary">Patient registered successfully.</p>
          <p className="mt-2 text-muted-foreground">
            Medical record number (MRN):{" "}
            <Badge variant="secondary" className="font-mono text-sm">
              {created.mrn}
            </Badge>
          </p>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor="full_name">Full name</Label>
          <Input id="full_name" {...form.register("full_name")} autoComplete="name" />
          {form.formState.errors.full_name && (
            <p className="text-sm text-destructive">{form.formState.errors.full_name.message}</p>
          )}
        </div>
        <div className="space-y-2">
          <Label htmlFor="date_of_birth">Date of birth</Label>
          <Input id="date_of_birth" type="date" {...form.register("date_of_birth")} />
          {form.formState.errors.date_of_birth && (
            <p className="text-sm text-destructive">{form.formState.errors.date_of_birth.message}</p>
          )}
        </div>
        <div className="space-y-2">
          <Label>Gender</Label>
          <Select
            value={form.watch("gender") || "__none__"}
            onValueChange={(v) => form.setValue("gender", v === "__none__" ? "" : v)}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select gender" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__">Prefer not to say</SelectItem>
              <SelectItem value="Male">Male</SelectItem>
              <SelectItem value="Female">Female</SelectItem>
              <SelectItem value="Other">Other</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="phone">Phone</Label>
          <Input id="phone" {...form.register("phone")} placeholder="+923001234567 or 03001234567" />
          {form.formState.errors.phone && (
            <p className="text-sm text-destructive">{form.formState.errors.phone.message}</p>
          )}
        </div>
        <div className="space-y-2">
          <Label>Blood group</Label>
          <Select
            value={form.watch("blood_group") || "__none__"}
            onValueChange={(v) => form.setValue("blood_group", v === "__none__" ? "" : v)}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select blood group" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__">Unknown</SelectItem>
              {BLOOD_GROUPS.map((bg) => (
                <SelectItem key={bg} value={bg}>
                  {bg}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor="address">Address</Label>
          <Textarea id="address" rows={3} {...form.register("address")} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="emergency_contact_name">Emergency contact name</Label>
          <Input id="emergency_contact_name" {...form.register("emergency_contact_name")} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="emergency_contact_phone">Emergency contact phone</Label>
          <Input
            id="emergency_contact_phone"
            {...form.register("emergency_contact_phone")}
            placeholder="+923001234567"
          />
          {form.formState.errors.emergency_contact_phone && (
            <p className="text-sm text-destructive">{form.formState.errors.emergency_contact_phone.message}</p>
          )}
        </div>
      </div>

      {serverError && <p className="text-sm text-destructive">{serverError}</p>}

      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={form.formState.isSubmitting} className="bg-primary text-primary-foreground">
          {form.formState.isSubmitting ? "Saving…" : "Register patient"}
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
