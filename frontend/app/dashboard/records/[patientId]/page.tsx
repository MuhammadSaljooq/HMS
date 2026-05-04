"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { api } from "@/lib/api";
import { calculateAge, formatDate } from "@/lib/patient-utils";
import type { MedicalRecord, Patient } from "@/types";

export default function PatientRecordsPage() {
  const params = useParams<{ patientId: string }>();
  const patientId = params?.patientId ?? "";

  const [patient, setPatient] = useState<Patient | null>(null);
  const [records, setRecords] = useState<MedicalRecord[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!patientId) return;
    setLoading(true);
    setError(null);
    try {
      const [p, r] = await Promise.all([
        api.get<Patient>(`/patients/${patientId}`),
        api.get<MedicalRecord[]>("/records", { params: { patient_id: patientId } }),
      ]);
      setPatient(p.data);
      setRecords(r.data);
    } catch {
      setPatient(null);
      setRecords([]);
      setError("Could not load patient or records.");
    } finally {
      setLoading(false);
    }
  }, [patientId]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) {
    return <div className="mx-auto max-w-4xl py-10 text-sm text-muted-foreground">Loading…</div>;
  }

  if (error || !patient) {
    return (
      <div className="mx-auto max-w-4xl space-y-4 py-10">
        <p className="text-destructive">{error}</p>
        <Button asChild variant="outline">
          <Link href="/dashboard/records">Back to records</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Medical records</h1>
          <p className="text-muted-foreground">
            <span className="font-medium text-foreground">{patient.full_name}</span>{" "}
            <Badge variant="secondary" className="font-mono text-xs">
              {patient.mrn}
            </Badge>
          </p>
          <p className="text-sm text-muted-foreground">
            DOB {formatDate(patient.date_of_birth)} · {calculateAge(patient.date_of_birth)} yrs
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline" size="sm">
            <Link href={`/dashboard/patients/${patient.id}`}>Patient profile</Link>
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link href="/dashboard/records">Records search</Link>
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Encounters</CardTitle>
          <CardDescription>Medical records for this patient (newest first).</CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Diagnosis</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {records.length === 0 && (
                <TableRow>
                  <TableCell colSpan={3} className="text-center text-muted-foreground">
                    No medical records yet.
                  </TableCell>
                </TableRow>
              )}
              {records.map((rec) => (
                <TableRow key={rec.id}>
                  <TableCell className="whitespace-nowrap text-sm">
                    {new Date(rec.created_at).toLocaleDateString()}
                  </TableCell>
                  <TableCell className="max-w-[280px] truncate text-sm">{rec.diagnosis || "—"}</TableCell>
                  <TableCell className="text-right">
                    <Button asChild size="sm" variant="ghost">
                      <Link href={`/dashboard/patients/${patient.id}?tab=records`}>Open on profile</Link>
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
