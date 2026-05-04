"use client";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { PatientForm } from "@/components/patients/PatientForm";
import { RoleGuard } from "@/components/layout/RoleGuard";
import { NEW_PATIENT_ROLES } from "@/lib/rbac";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { usePatients } from "@/hooks/usePatients";

export default function NewPatientPage() {
  const { create } = usePatients();

  return (
    <RoleGuard roles={NEW_PATIENT_ROLES}>
      <div className="mx-auto max-w-3xl space-y-4">
        <Button variant="ghost" size="sm" asChild className="gap-2 px-0 text-muted-foreground hover:text-foreground">
          <Link href="/dashboard/patients">
            <ArrowLeft className="h-4 w-4" />
            Back to patients
          </Link>
        </Button>

        <Card className="border-border">
          <CardHeader>
            <CardTitle>Register new patient</CardTitle>
            <CardDescription>
              Demographics are validated before being sent to the server. You will see the generated MRN after a
              successful save.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <PatientForm onSubmit={create} />
          </CardContent>
        </Card>
      </div>
    </RoleGuard>
  );
}
