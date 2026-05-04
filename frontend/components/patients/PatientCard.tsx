"use client";

import Link from "next/link";

import { Card, CardContent } from "@/components/ui/card";
import { calculateAge } from "@/lib/patient-utils";
import type { Patient } from "@/types";

type PatientCardProps = {
  patient: Patient;
};

export function PatientCard({ patient }: PatientCardProps) {
  const age = calculateAge(patient.date_of_birth);
  return (
    <Link href={`/dashboard/patients/${patient.id}`}>
      <Card className="border-border transition-colors hover:bg-muted/30">
        <CardContent className="p-4">
          <p className="font-medium leading-tight">{patient.full_name}</p>
          <p className="mt-1 font-mono text-xs text-muted-foreground">{patient.mrn}</p>
          <p className="mt-2 text-xs text-muted-foreground">
            {age} yrs · {patient.gender ?? "—"} · {patient.blood_group ?? "—"}
          </p>
        </CardContent>
      </Card>
    </Link>
  );
}
