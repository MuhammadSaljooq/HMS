"use client";

import { useForm } from "react-hook-form";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";

export type VitalsFormFields = {
  blood_pressure_systolic: string;
  blood_pressure_diastolic: string;
  heart_rate: string;
  temperature_celsius: string;
  weight_kg: string;
  height_cm: string;
};

type VitalsFormProps = {
  patientId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (body: Record<string, unknown>) => Promise<void>;
};

function parseOptInt(s: string, min: number, max: number, label: string): { ok: true; v: number } | { ok: false; err: string } {
  const t = s.trim();
  if (!t) return { ok: true, v: NaN };
  const n = Number.parseInt(t, 10);
  if (!Number.isFinite(n)) return { ok: false, err: `${label} must be a number` };
  if (n < min || n > max) return { ok: false, err: `${label} must be between ${min} and ${max}` };
  return { ok: true, v: n };
}

function parseOptFloat(s: string, min: number, max: number, label: string): { ok: true; v: number } | { ok: false; err: string } {
  const t = s.trim();
  if (!t) return { ok: true, v: NaN };
  const n = Number.parseFloat(t);
  if (!Number.isFinite(n)) return { ok: false, err: `${label} must be a number` };
  if (n < min || n > max) return { ok: false, err: `${label} must be between ${min} and ${max}` };
  return { ok: true, v: n };
}

export function VitalsForm({ patientId, open, onOpenChange, onSubmit }: VitalsFormProps) {
  const form = useForm<VitalsFormFields>({
    defaultValues: {
      blood_pressure_systolic: "",
      blood_pressure_diastolic: "",
      heart_rate: "",
      temperature_celsius: "",
      weight_kg: "",
      height_cm: "",
    },
  });

  async function handleSubmit(values: VitalsFormFields) {
    form.clearErrors("root");

    const sysR = parseOptInt(values.blood_pressure_systolic, 60, 250, "Systolic BP");
    const diaR = parseOptInt(values.blood_pressure_diastolic, 40, 150, "Diastolic BP");
    if (!sysR.ok) return form.setError("blood_pressure_systolic", { message: sysR.err });
    if (!diaR.ok) return form.setError("blood_pressure_diastolic", { message: diaR.err });
    const hasSys = Number.isFinite(sysR.v);
    const hasDia = Number.isFinite(diaR.v);
    if (hasSys !== hasDia) {
      return form.setError("root", { message: "Enter both systolic and diastolic BP, or leave both empty." });
    }

    const hrR = parseOptInt(values.heart_rate, 20, 300, "Heart rate");
    if (!hrR.ok) return form.setError("heart_rate", { message: hrR.err });

    const tempR = parseOptFloat(values.temperature_celsius, 30, 45, "Temperature");
    if (!tempR.ok) return form.setError("temperature_celsius", { message: tempR.err });

    const wtR = parseOptFloat(values.weight_kg, 0.5, 500, "Weight");
    if (!wtR.ok) return form.setError("weight_kg", { message: wtR.err });

    const htR = parseOptFloat(values.height_cm, 20, 300, "Height");
    if (!htR.ok) return form.setError("height_cm", { message: htR.err });

    const body: Record<string, unknown> = {
      blood_pressure_systolic: hasSys ? sysR.v : null,
      blood_pressure_diastolic: hasDia ? diaR.v : null,
      heart_rate: Number.isFinite(hrR.v) ? hrR.v : null,
      temperature_celsius: Number.isFinite(tempR.v) ? tempR.v : null,
      weight_kg: Number.isFinite(wtR.v) ? wtR.v : null,
      height_cm: Number.isFinite(htR.v) ? htR.v : null,
    };

    const hasAny = Object.values(body).some((v) => v !== null);
    if (!hasAny) {
      return form.setError("root", { message: "Enter at least one vital sign." });
    }

    await onSubmit(body);
    form.reset();
    onOpenChange(false);
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-md">
        <SheetHeader>
          <SheetTitle>Record vitals</SheetTitle>
          <SheetDescription>Quick entry for this patient.</SheetDescription>
        </SheetHeader>
        <form onSubmit={form.handleSubmit(handleSubmit)} className="mt-6 space-y-4 px-1">
          <p className="text-xs text-muted-foreground font-mono">ID {patientId}</p>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="bps">BP systolic</Label>
              <Input id="bps" type="number" inputMode="numeric" {...form.register("blood_pressure_systolic")} />
              {form.formState.errors.blood_pressure_systolic && (
                <p className="text-sm text-destructive">{form.formState.errors.blood_pressure_systolic.message}</p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="bpd">BP diastolic</Label>
              <Input id="bpd" type="number" inputMode="numeric" {...form.register("blood_pressure_diastolic")} />
              {form.formState.errors.blood_pressure_diastolic && (
                <p className="text-sm text-destructive">{form.formState.errors.blood_pressure_diastolic.message}</p>
              )}
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="hr">Heart rate (bpm)</Label>
            <Input id="hr" type="number" inputMode="numeric" {...form.register("heart_rate")} />
            {form.formState.errors.heart_rate && (
              <p className="text-sm text-destructive">{form.formState.errors.heart_rate.message}</p>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="temp">Temperature (°C)</Label>
            <Input id="temp" type="number" step="0.1" {...form.register("temperature_celsius")} />
            {form.formState.errors.temperature_celsius && (
              <p className="text-sm text-destructive">{form.formState.errors.temperature_celsius.message}</p>
            )}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="wt">Weight (kg)</Label>
              <Input id="wt" type="number" step="0.1" {...form.register("weight_kg")} />
              {form.formState.errors.weight_kg && (
                <p className="text-sm text-destructive">{form.formState.errors.weight_kg.message}</p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="ht">Height (cm)</Label>
              <Input id="ht" type="number" step="0.1" {...form.register("height_cm")} />
              {form.formState.errors.height_cm && (
                <p className="text-sm text-destructive">{form.formState.errors.height_cm.message}</p>
              )}
            </div>
          </div>
          {form.formState.errors.root && (
            <p className="text-sm text-destructive">{form.formState.errors.root.message}</p>
          )}
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Close
            </Button>
            <Button type="submit" className="bg-primary text-primary-foreground" disabled={form.formState.isSubmitting}>
              {form.formState.isSubmitting ? "Saving…" : "Save vitals"}
            </Button>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  );
}
