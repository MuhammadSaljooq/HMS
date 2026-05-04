"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, ChevronDown, Plus } from "lucide-react";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { VitalsForm } from "@/components/patients/VitalsForm";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { api } from "@/lib/api";
import { calculateAge, formatDate } from "@/lib/patient-utils";
import { usePatientStore } from "@/store/patientStore";
import type {
  Appointment,
  MedicalRecord,
  MedicalRecordDetail,
  Patient,
  Transcription,
  Vitals,
} from "@/types";

function statusBadgeVariant(s: string): "default" | "secondary" | "destructive" | "outline" {
  if (s === "completed") return "default";
  if (s === "failed" || s === "cancelled") return "destructive";
  if (s === "processing" || s === "pending") return "secondary";
  return "outline";
}

export default function PatientDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const id = params?.id ?? "";

  const [patient, setPatient] = useState<Patient | null>(null);
  const [vitals, setVitals] = useState<Vitals[]>([]);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [records, setRecords] = useState<MedicalRecord[]>([]);
  const [transcriptions, setTranscriptions] = useState<Transcription[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [vitalsOpen, setVitalsOpen] = useState(false);
  const [recordDetail, setRecordDetail] = useState<Record<string, MedicalRecordDetail | "loading">>({});
  const [openRecordId, setOpenRecordId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState("overview");

  const reloadAll = useCallback(async () => {
    if (!id) return;
    setLoadError(null);
    setLoading(true);
    try {
      const [p, v, a, r, t] = await Promise.all([
        api.get<Patient>(`/patients/${id}`),
        api.get<Vitals[]>(`/patients/${id}/vitals`),
        api.get<Appointment[]>("/appointments", { params: { patient_id: id } }),
        api.get<MedicalRecord[]>("/records", { params: { patient_id: id } }),
        api.get<Transcription[]>(`/patients/${id}/transcriptions`),
      ]);
      setPatient(p.data);
      setVitals(v.data);
      setAppointments(a.data);
      setRecords(r.data);
      setTranscriptions(t.data);
    } catch {
      setPatient(null);
      setLoadError("Patient could not be loaded, or you do not have access.");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void reloadAll();
  }, [reloadAll]);

  useEffect(() => {
    const params = new URLSearchParams(typeof window !== "undefined" ? window.location.search : "");
    const t = params.get("tab");
    if (t === "records" || t === "vitals" || t === "appointments" || t === "transcriptions" || t === "overview") {
      setActiveTab(t);
    }
  }, [id]);

  useEffect(() => {
    if (!patient) return;
    usePatientStore.getState().rememberPatient({
      id: patient.id,
      full_name: patient.full_name,
      mrn: patient.mrn,
    });
  }, [patient]);

  const loadRecordDetail = useCallback(async (recordId: string) => {
    setRecordDetail((prev) => ({ ...prev, [recordId]: "loading" }));
    try {
      const { data } = await api.get<MedicalRecordDetail>(`/records/${recordId}`);
      setRecordDetail((prev) => ({ ...prev, [recordId]: data }));
    } catch {
      setRecordDetail((prev) => {
        const next = { ...prev };
        delete next[recordId];
        return next;
      });
    }
  }, []);

  const latestVitals = useMemo(() => {
    if (!vitals.length) return null;
    return [...vitals].sort((a, b) => new Date(b.recorded_at).getTime() - new Date(a.recorded_at).getTime())[0];
  }, [vitals]);

  const chartRows = useMemo(() => {
    return [...vitals]
      .sort((a, b) => new Date(a.recorded_at).getTime() - new Date(b.recorded_at).getTime())
      .map((v) => ({
        at: formatDate(v.recorded_at),
        hr: v.heart_rate ?? undefined,
        sys: v.blood_pressure_systolic ?? undefined,
        dia: v.blood_pressure_diastolic ?? undefined,
      }));
  }, [vitals]);

  async function handleAddVitals(body: Record<string, unknown>) {
    await api.post(`/patients/${id}/vitals`, body);
    const { data } = await api.get<Vitals[]>(`/patients/${id}/vitals`);
    setVitals(data);
  }

  if (loading && !patient) {
    return (
      <div className="mx-auto max-w-5xl space-y-6">
        <Skeleton className="h-8 w-40" />
        <div className="flex flex-wrap gap-3">
          <Skeleton className="h-10 w-64" />
          <Skeleton className="h-8 w-24" />
        </div>
        <Skeleton className="h-12 w-full max-w-xl" />
        <Skeleton className="h-[360px] w-full rounded-lg" />
      </div>
    );
  }

  if (!patient) {
    return (
      <div className="mx-auto max-w-lg space-y-4">
        <Button variant="ghost" size="sm" asChild className="gap-2 px-0">
          <Link href="/dashboard/patients">
            <ArrowLeft className="h-4 w-4" />
            Back to patients
          </Link>
        </Button>
        <Card>
          <CardHeader>
            <CardTitle>Patient not found</CardTitle>
            <CardDescription>{loadError ?? "This patient does not exist or is not visible for your role."}</CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={() => router.push("/dashboard/patients")}>Go to directory</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const age = calculateAge(patient.date_of_birth);

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-2">
          <Button variant="ghost" size="sm" asChild className="gap-2 px-0 text-muted-foreground hover:text-foreground">
            <Link href="/dashboard/patients">
              <ArrowLeft className="h-4 w-4" />
              Back to patients
            </Link>
          </Button>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-semibold tracking-tight">{patient.full_name}</h1>
            <Badge variant="secondary" className="font-mono text-xs">
              {patient.mrn}
            </Badge>
            {patient.blood_group && (
              <Badge variant="outline" className="text-xs">
                {patient.blood_group}
              </Badge>
            )}
          </div>
          <p className="text-sm text-muted-foreground">
            {age} yrs · {patient.gender || "Gender not set"}
          </p>
        </div>
        <Button className="gap-2 bg-primary text-primary-foreground" onClick={() => setVitalsOpen(true)}>
          <Plus className="h-4 w-4" />
          Record vitals
        </Button>
      </div>

      <VitalsForm patientId={id} open={vitalsOpen} onOpenChange={setVitalsOpen} onSubmit={handleAddVitals} />

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="flex w-full flex-wrap justify-start gap-1">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="records">Medical records</TabsTrigger>
          <TabsTrigger value="vitals">Vitals</TabsTrigger>
          <TabsTrigger value="appointments">Appointments</TabsTrigger>
          <TabsTrigger value="transcriptions">Transcriptions</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-4 space-y-4">
          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Demographics</CardTitle>
                <CardDescription>Registration and contact details</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-3 text-sm">
                <div className="flex justify-between gap-4">
                  <span className="text-muted-foreground">Date of birth</span>
                  <span className="font-medium">{formatDate(patient.date_of_birth)}</span>
                </div>
                <div className="flex justify-between gap-4">
                  <span className="text-muted-foreground">Phone</span>
                  <span className="font-medium">{patient.phone || "—"}</span>
                </div>
                <div className="space-y-1">
                  <span className="text-muted-foreground">Address</span>
                  <p className="font-medium whitespace-pre-wrap">{patient.address || "—"}</p>
                </div>
                <div className="flex justify-between gap-4">
                  <span className="text-muted-foreground">Emergency contact</span>
                  <span className="text-right font-medium">
                    {patient.emergency_contact_name || "—"}
                    {patient.emergency_contact_phone ? (
                      <span className="block text-muted-foreground">{patient.emergency_contact_phone}</span>
                    ) : null}
                  </span>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Latest vitals</CardTitle>
                <CardDescription>Most recent measurement on file</CardDescription>
              </CardHeader>
              <CardContent>
                {!latestVitals ? (
                  <p className="text-sm text-muted-foreground">No vitals recorded yet.</p>
                ) : (
                  <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
                    <div>
                      <dt className="text-muted-foreground">Recorded</dt>
                      <dd className="font-medium">{formatDate(latestVitals.recorded_at)}</dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">BP</dt>
                      <dd className="font-medium">
                        {latestVitals.blood_pressure_systolic != null && latestVitals.blood_pressure_diastolic != null
                          ? `${latestVitals.blood_pressure_systolic}/${latestVitals.blood_pressure_diastolic}`
                          : "—"}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">Heart rate</dt>
                      <dd className="font-medium">{latestVitals.heart_rate != null ? `${latestVitals.heart_rate} bpm` : "—"}</dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">Temp</dt>
                      <dd className="font-medium">
                        {latestVitals.temperature_celsius != null ? `${latestVitals.temperature_celsius} °C` : "—"}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">Weight</dt>
                      <dd className="font-medium">{latestVitals.weight_kg != null ? `${latestVitals.weight_kg} kg` : "—"}</dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">Height</dt>
                      <dd className="font-medium">{latestVitals.height_cm != null ? `${latestVitals.height_cm} cm` : "—"}</dd>
                    </div>
                  </dl>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="records" className="mt-4 space-y-3">
          {records.length === 0 ? (
            <p className="text-sm text-muted-foreground">No medical records for this patient yet.</p>
          ) : (
            records.map((rec) => {
              const detail = recordDetail[rec.id];
              const isOpen = openRecordId === rec.id;
              return (
                <Collapsible
                  key={rec.id}
                  open={isOpen}
                  onOpenChange={(open) => {
                    setOpenRecordId(open ? rec.id : null);
                    if (open && !recordDetail[rec.id]) void loadRecordDetail(rec.id);
                  }}
                  className="rounded-lg border border-border bg-card"
                >
                  <CollapsibleTrigger className="flex w-full items-center justify-between gap-2 px-4 py-3 text-left text-sm font-medium hover:bg-muted/40">
                    <span>
                      {formatDate(rec.created_at)}
                      {rec.diagnosis ? ` · ${rec.diagnosis}` : ""}
                    </span>
                    <ChevronDown className={`h-4 w-4 shrink-0 transition-transform ${isOpen ? "rotate-180" : ""}`} />
                  </CollapsibleTrigger>
                  <CollapsibleContent className="border-t border-border px-4 py-3 text-sm">
                    {detail === "loading" && <p className="text-muted-foreground">Loading record…</p>}
                    {detail && detail !== "loading" && (
                      <div className="space-y-3">
                        {detail.notes && (
                          <div>
                            <p className="text-xs font-medium uppercase text-muted-foreground">Notes</p>
                            <p className="mt-1 whitespace-pre-wrap">{detail.notes}</p>
                          </div>
                        )}
                        <div>
                          <p className="text-xs font-medium uppercase text-muted-foreground">Prescriptions</p>
                          {!detail.prescriptions?.length ? (
                            <p className="mt-1 text-muted-foreground">No prescriptions on this record.</p>
                          ) : (
                            <ul className="mt-2 space-y-2">
                              {detail.prescriptions.map((rx) => (
                                <li key={rx.id} className="rounded-md border border-border bg-background/60 p-3">
                                  <p className="font-medium">{rx.medication_name}</p>
                                  <p className="text-xs text-muted-foreground">
                                    {rx.dosage} · {rx.frequency}
                                    {rx.duration_days != null ? ` · ${rx.duration_days} days` : ""}
                                  </p>
                                  {rx.instructions && <p className="mt-1 text-xs">{rx.instructions}</p>}
                                </li>
                              ))}
                            </ul>
                          )}
                        </div>
                      </div>
                    )}
                  </CollapsibleContent>
                </Collapsible>
              );
            })
          )}
        </TabsContent>

        <TabsContent value="vitals" className="mt-4 space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Trends</CardTitle>
              <CardDescription>Heart rate and blood pressure over time</CardDescription>
            </CardHeader>
            <CardContent>
              {chartRows.length === 0 ? (
                <p className="text-sm text-muted-foreground">No vitals to chart yet.</p>
              ) : (
                <div className="h-72 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={chartRows} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                      <XAxis dataKey="at" tick={{ fontSize: 11 }} />
                      <YAxis yAxisId="left" tick={{ fontSize: 11 }} />
                      <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11 }} />
                      <Tooltip />
                      <Legend />
                      <Line yAxisId="left" type="monotone" dataKey="hr" name="HR (bpm)" stroke="hsl(var(--primary))" dot={false} />
                      <Line yAxisId="right" type="monotone" dataKey="sys" name="Systolic" stroke="#ef4444" dot={false} />
                      <Line yAxisId="right" type="monotone" dataKey="dia" name="Diastolic" stroke="#3b82f6" dot={false} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">History</CardTitle>
              <CardDescription>All recorded vitals</CardDescription>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>When</TableHead>
                    <TableHead>BP</TableHead>
                    <TableHead>HR</TableHead>
                    <TableHead>Temp °C</TableHead>
                    <TableHead>Weight</TableHead>
                    <TableHead>Height</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {vitals.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center text-muted-foreground">
                        No rows yet.
                      </TableCell>
                    </TableRow>
                  ) : (
                    vitals.map((v) => (
                      <TableRow key={v.id}>
                        <TableCell className="whitespace-nowrap">{formatDate(v.recorded_at)}</TableCell>
                        <TableCell>
                          {v.blood_pressure_systolic != null && v.blood_pressure_diastolic != null
                            ? `${v.blood_pressure_systolic}/${v.blood_pressure_diastolic}`
                            : "—"}
                        </TableCell>
                        <TableCell>{v.heart_rate ?? "—"}</TableCell>
                        <TableCell>{v.temperature_celsius ?? "—"}</TableCell>
                        <TableCell>{v.weight_kg ?? "—"}</TableCell>
                        <TableCell>{v.height_cm ?? "—"}</TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="appointments" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Appointments</CardTitle>
              <CardDescription>Scheduled visits for this patient</CardDescription>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>When</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Chief complaint</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {appointments.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={3} className="text-center text-muted-foreground">
                        No appointments.
                      </TableCell>
                    </TableRow>
                  ) : (
                    [...appointments]
                      .sort((a, b) => new Date(b.scheduled_at).getTime() - new Date(a.scheduled_at).getTime())
                      .map((a) => (
                        <TableRow key={a.id}>
                          <TableCell className="whitespace-nowrap">{formatDate(a.scheduled_at)}</TableCell>
                          <TableCell>
                            <Badge variant={statusBadgeVariant(a.status)} className="capitalize">
                              {a.status.replaceAll("_", " ")}
                            </Badge>
                          </TableCell>
                          <TableCell>{a.chief_complaint || "—"}</TableCell>
                        </TableRow>
                      ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="transcriptions" className="mt-4 space-y-3">
          {transcriptions.length === 0 ? (
            <p className="text-sm text-muted-foreground">No AI transcriptions linked to this patient yet.</p>
          ) : (
            transcriptions.map((tr) => (
              <Card key={tr.id}>
                <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 space-y-0 pb-2">
                  <CardTitle className="text-base font-medium">{formatDate(tr.created_at)}</CardTitle>
                  <Badge variant={statusBadgeVariant(tr.status)} className="capitalize">
                    {tr.status}
                  </Badge>
                </CardHeader>
                <CardContent className="space-y-2 text-sm">
                  {tr.cleaned_transcript ? (
                    <p className="whitespace-pre-wrap text-muted-foreground">{tr.cleaned_transcript}</p>
                  ) : tr.raw_transcript ? (
                    <p className="whitespace-pre-wrap text-muted-foreground">{tr.raw_transcript}</p>
                  ) : (
                    <p className="text-muted-foreground">Transcript not available yet.</p>
                  )}
                </CardContent>
              </Card>
            ))
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
