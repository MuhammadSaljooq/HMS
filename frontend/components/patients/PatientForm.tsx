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
import { getApiErrorMessage } from "@/lib/api-errors";
import { calculateAge } from "@/lib/patient-utils";
import { cn } from "@/lib/utils";
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

export type PatientFormValues = z.infer<typeof patientSchema>;

type PatientFormProps = {
  onSubmit: (values: Record<string, unknown>) => Promise<Patient>;
  onCancel?: () => void;
};

const fieldLabelClassName = "text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500";
const fieldClassName =
  "h-12 rounded-[18px] border border-[#e6ddd4] bg-[#fffaf6] px-4 text-sm text-slate-900 shadow-none transition placeholder:text-slate-400 focus-visible:border-[#6bbfcc] focus-visible:ring-2 focus-visible:ring-[#6bbfcc]/25";
const textareaClassName =
  "min-h-[120px] rounded-[18px] border border-[#e6ddd4] bg-[#fffaf6] px-4 py-3 text-sm text-slate-900 shadow-none transition placeholder:text-slate-400 focus-visible:border-[#6bbfcc] focus-visible:ring-2 focus-visible:ring-[#6bbfcc]/25";
const selectTriggerClassName =
  "h-12 rounded-[18px] border border-[#e6ddd4] bg-[#fffaf6] px-4 text-sm text-slate-900 shadow-none focus:ring-2 focus:ring-[#6bbfcc]/25 focus:border-[#6bbfcc] data-[placeholder]:text-slate-400";
const selectContentClassName = "rounded-[18px] border border-[#e6ddd4] bg-white shadow-[0_16px_32px_rgba(15,23,42,0.1)]";
const selectItemClassName = "rounded-[12px] px-3 py-2 text-sm text-slate-700 focus:bg-[#fff6ef] focus:text-slate-900";

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-[24px] border border-[#efe6dd] bg-[#fcfcfd] p-5 shadow-[0_10px_24px_rgba(15,23,42,0.04)]">
      <header className="mb-5">
        <h3 className="text-[1.05rem] font-semibold tracking-[-0.02em] text-slate-900">{title}</h3>
        <p className="mt-1 text-sm leading-6 text-slate-500">{description}</p>
      </header>
      {children}
    </section>
  );
}

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
      setServerError(getApiErrorMessage(e, "Save failed"));
    }
  }

  return (
    <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-6">
      {created && (
        <div className="rounded-[24px] border border-emerald-200 bg-emerald-50 px-5 py-4 text-sm">
          <p className="font-semibold text-emerald-700">Patient registered successfully.</p>
          <p className="mt-2 leading-6 text-emerald-700/80">
            Medical record number (MRN):{" "}
            <Badge className="rounded-full border border-emerald-200 bg-white px-3 py-1 font-mono text-sm text-emerald-700 shadow-none hover:bg-white">
              {created.mrn}
            </Badge>
          </p>
        </div>
      )}

      <Section
        title="Patient identity"
        description="Start with the legal name and date of birth so the chart can be created without ambiguity."
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="full_name" className={fieldLabelClassName}>
              Full name
            </Label>
            <Input id="full_name" {...form.register("full_name")} autoComplete="name" className={fieldClassName} />
            {form.formState.errors.full_name && (
              <p className="text-sm font-medium text-red-600">{form.formState.errors.full_name.message}</p>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="date_of_birth" className={fieldLabelClassName}>
              Date of birth
            </Label>
            <Input id="date_of_birth" type="date" {...form.register("date_of_birth")} className={cn(fieldClassName, "pr-3")} />
            {form.formState.errors.date_of_birth && (
              <p className="text-sm font-medium text-red-600">{form.formState.errors.date_of_birth.message}</p>
            )}
          </div>
          <div className="space-y-2">
            <Label className={fieldLabelClassName}>Gender</Label>
            <Select
              value={form.watch("gender") || "__none__"}
              onValueChange={(v) => form.setValue("gender", v === "__none__" ? "" : v)}
            >
              <SelectTrigger className={selectTriggerClassName}>
                <SelectValue placeholder="Select gender" />
              </SelectTrigger>
              <SelectContent className={selectContentClassName}>
                <SelectItem value="__none__" className={selectItemClassName}>
                  Prefer not to say
                </SelectItem>
                <SelectItem value="Male" className={selectItemClassName}>
                  Male
                </SelectItem>
                <SelectItem value="Female" className={selectItemClassName}>
                  Female
                </SelectItem>
                <SelectItem value="Other" className={selectItemClassName}>
                  Other
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="blood_group" className={fieldLabelClassName}>
              Blood group
            </Label>
            <Select
              value={form.watch("blood_group") || "__none__"}
              onValueChange={(v) => form.setValue("blood_group", v === "__none__" ? "" : v)}
            >
              <SelectTrigger id="blood_group" className={selectTriggerClassName}>
                <SelectValue placeholder="Select blood group" />
              </SelectTrigger>
              <SelectContent className={selectContentClassName}>
                <SelectItem value="__none__" className={selectItemClassName}>
                  Unknown
                </SelectItem>
                {BLOOD_GROUPS.map((bg) => (
                  <SelectItem key={bg} value={bg} className={selectItemClassName}>
                    {bg}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </Section>

      <Section
        title="Contact details"
        description="Use a current mobile number and full address so the patient can be reached for scheduling and reminders."
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="phone" className={fieldLabelClassName}>
              Phone
            </Label>
            <Input
              id="phone"
              {...form.register("phone")}
              placeholder="+923001234567 or 03001234567"
              className={fieldClassName}
            />
            {form.formState.errors.phone && (
              <p className="text-sm font-medium text-red-600">{form.formState.errors.phone.message}</p>
            )}
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="address" className={fieldLabelClassName}>
              Address
            </Label>
            <Textarea id="address" rows={4} {...form.register("address")} className={textareaClassName} />
          </div>
        </div>
      </Section>

      <Section
        title="Emergency contact"
        description="Add a secondary contact for urgent follow-up when the patient is unavailable."
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="emergency_contact_name" className={fieldLabelClassName}>
              Emergency contact name
            </Label>
            <Input
              id="emergency_contact_name"
              {...form.register("emergency_contact_name")}
              className={fieldClassName}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="emergency_contact_phone" className={fieldLabelClassName}>
              Emergency contact phone
            </Label>
            <Input
              id="emergency_contact_phone"
              {...form.register("emergency_contact_phone")}
              placeholder="+923001234567"
              className={fieldClassName}
            />
            {form.formState.errors.emergency_contact_phone && (
              <p className="text-sm font-medium text-red-600">{form.formState.errors.emergency_contact_phone.message}</p>
            )}
          </div>
        </div>
      </Section>

      {serverError && (
        <p className="rounded-[20px] border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-600">
          {serverError}
        </p>
      )}

      <div className="flex flex-wrap gap-3">
        <Button
          type="submit"
          disabled={form.formState.isSubmitting}
          className="h-11 rounded-full bg-[#c85d35] px-5 text-sm font-semibold text-white shadow-[0_12px_24px_rgba(200,93,53,0.24)] transition hover:bg-[#b4542d]"
        >
          {form.formState.isSubmitting ? "Saving…" : "Register patient"}
        </Button>
        {onCancel && (
          <Button
            type="button"
            variant="outline"
            className="h-11 rounded-full border border-[#e6ddd4] bg-white px-5 text-sm font-semibold text-slate-700 hover:bg-[#f8f6f3]"
            onClick={onCancel}
          >
            Cancel
          </Button>
        )}
      </div>
    </form>
  );
}
