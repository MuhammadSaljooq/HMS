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

import { MockupDashboardShell } from "@/components/layout/MockupDashboardShell";
import { VitalsForm } from "@/components/patients/VitalsForm";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { getApiErrorMessage } from "@/lib/api-errors";
import { calculateAge, formatDate } from "@/lib/patient-utils";
import { usePatientDetailData } from "@/hooks/queries/usePatientDetailData";
import { useAuthStore } from "@/store/authStore";
import { usePatientStore } from "@/store/patientStore";
import type { Appointment, MedicalRecord, MedicalRecordDetail, Transcription, Vitals } from "@/types";
import styles from "../../theme-dashboard.module.css";

const EMPTY_VITALS: Vitals[] = [];
const EMPTY_APPOINTMENTS: Appointment[] = [];
const EMPTY_RECORDS: MedicalRecord[] = [];
const EMPTY_TRANSCRIPTIONS: Transcription[] = [];

function statusBadgeVariant(s: string): "default" | "secondary" | "destructive" | "outline" {
  if (s === "completed") return "default";
  if (s === "failed" || s === "cancelled") return "destructive";
  if (s === "processing" || s === "pending") return "secondary";
  return "outline";
}

export default function PatientDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const id = params?.id ?? "";
  const { detailQuery, addVitalsMutation, fetchRecordDetail } = usePatientDetailData(id);
  const patient = detailQuery.data?.patient ?? null;
  const vitals = detailQuery.data?.vitals ?? EMPTY_VITALS;
  const appointments = detailQuery.data?.appointments ?? EMPTY_APPOINTMENTS;
  const records = detailQuery.data?.records ?? EMPTY_RECORDS;
  const transcriptions = detailQuery.data?.transcriptions ?? EMPTY_TRANSCRIPTIONS;
  const loading = detailQuery.isLoading;
  const loadError = detailQuery.isError
    ? getApiErrorMessage(detailQuery.error, "Patient could not be loaded, or you do not have access.")
    : null;
  const [vitalsOpen, setVitalsOpen] = useState(false);
  const [recordDetail, setRecordDetail] = useState<Record<string, MedicalRecordDetail | "loading">>({});
  const [openRecordId, setOpenRecordId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState("overview");

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
      const data = await fetchRecordDetail(recordId);
      setRecordDetail((prev) => ({ ...prev, [recordId]: data }));
    } catch {
      setRecordDetail((prev) => {
        const next = { ...prev };
        delete next[recordId];
        return next;
      });
    }
  }, [fetchRecordDetail]);

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

  const nextAppointment = useMemo(() => {
    return [...appointments]
      .filter((appointment) => appointment.status === "scheduled")
      .sort((a, b) => new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime())[0] ?? null;
  }, [appointments]);

  const latestTranscription = useMemo(() => {
    return [...transcriptions].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0] ?? null;
  }, [transcriptions]);

  async function handleAddVitals(body: Record<string, unknown>) {
    await addVitalsMutation.mutateAsync(body);
  }

  if (loading && !patient) {
    return (
      <MockupDashboardShell styles={styles} user={user} activeSection="Patient">
        <main className={styles.main}>
          <div className={styles.contentColumn}>
            <Skeleton className="h-10 w-52 rounded-md" />
            <div className={styles.statRow}>
              <Skeleton className="h-28 w-full rounded-2xl" />
              <Skeleton className="h-28 w-full rounded-2xl" />
              <Skeleton className="h-28 w-full rounded-2xl" />
            </div>
            <Skeleton className="h-[420px] w-full rounded-2xl" />
          </div>
        </main>
        <aside className={styles.rightPanel}>
          <Skeleton className="h-32 w-full rounded-2xl" />
          <Skeleton className="h-40 w-full rounded-2xl" />
        </aside>
      </MockupDashboardShell>
    );
  }

  if (!patient) {
    return (
      <MockupDashboardShell styles={styles} user={user} activeSection="Patient">
        <main className={styles.main}>
          <div className={styles.contentColumn}>
            <div className={styles.heroRow}>
              <div>
                <h1 className={styles.heroTitle}>Patient profile</h1>
                <p className={styles.heroSubtitle}>{loadError ?? "This patient does not exist or is not visible for your role."}</p>
              </div>
            </div>
            <article className={styles.dataCard}>
              <Button variant="ghost" size="sm" asChild className="mb-4 gap-2 px-0">
                <Link href="/dashboard/patients">
                  <ArrowLeft className="h-4 w-4" />
                  Back to patients
                </Link>
              </Button>
              <p className="text-sm text-slate-600">Review the patient list and pick another chart to continue.</p>
              <Button className="mt-4 gap-2 rounded-full bg-[#1a1d21] px-5 text-white hover:bg-[#2a3040]" onClick={() => router.push("/dashboard/patients")}>
                Go to directory
              </Button>
            </article>
          </div>
        </main>
        <aside className={styles.rightPanel}>
          <header className={styles.panelHeader}>
            <h3 className={styles.panelTitle}>Chart status</h3>
            <span className={styles.smallBtn}>⚠</span>
          </header>
          <div className={styles.reminderCard}>
            <span className={styles.reminderIcon}>🧾</span>
            <p className={styles.reminderText}>Check the patient identifier or return to the registry to open another profile.</p>
          </div>
          <Link href="/dashboard/patients" className={styles.makeConfBtn}>
            + Open patient registry
          </Link>
        </aside>
      </MockupDashboardShell>
    );
  }

  const age = calculateAge(patient.date_of_birth);

  return (
    <MockupDashboardShell styles={styles} user={user} activeSection="Patient">
      <main className={styles.main}>
        <div className={styles.heroRow}>
          <div>
            <Button variant="ghost" size="sm" asChild className="mb-2 gap-2 px-0 text-muted-foreground hover:text-foreground">
              <Link href="/dashboard/patients">
                <ArrowLeft className="h-4 w-4" />
                Back to patients
              </Link>
            </Button>
            <h1 className={styles.heroTitle}>{patient.full_name}</h1>
            <p className={styles.heroSubtitle}>
              MRN {patient.mrn} · {age} yrs · {patient.gender || "Gender not set"}
            </p>
          </div>
          <button
            type="button"
            className="rounded-full bg-[#f05c3a] px-5 py-2.5 text-sm font-semibold text-white transition hover:opacity-90"
            onClick={() => setVitalsOpen(true)}
          >
            <span className="inline-flex items-center gap-2">
              <Plus className="h-4 w-4" />
              Record vitals
            </span>
          </button>
        </div>

        <div className={styles.statRow}>
          <div className={styles.summaryCard}>
            <p className={styles.summaryLabel}>Blood group</p>
            <p className={styles.summaryValue}>{patient.blood_group || "—"}</p>
            <p className={styles.summarySub}>Primary identifier and blood matching reference.</p>
          </div>
          <div className={styles.summaryCard}>
            <p className={styles.summaryLabel}>Appointments</p>
            <p className={styles.summaryValue}>{appointments.length}</p>
            <p className={styles.summarySub}>{nextAppointment ? `Next: ${formatDate(nextAppointment.scheduled_at)}` : "No scheduled visit yet."}</p>
          </div>
          <div className={styles.summaryCard}>
            <p className={styles.summaryLabel}>Records on file</p>
            <p className={styles.summaryValue}>{records.length}</p>
            <p className={styles.summarySub}>{latestVitals ? `Latest vitals: ${formatDate(latestVitals.recorded_at)}` : "No vitals recorded yet."}</p>
          </div>
        </div>

        <VitalsForm patientId={id} open={vitalsOpen} onOpenChange={setVitalsOpen} onSubmit={handleAddVitals} />

        <div className={styles.contentColumn}>
          <article className={styles.dataCard}>
            <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
              <TabsList className="mb-4 flex w-full flex-wrap justify-start gap-2 rounded-none bg-transparent p-0">
                <TabsTrigger className="rounded-full border border-slate-300 bg-white px-4 py-2 text-slate-700 data-[state=active]:border-[#1a1d21] data-[state=active]:bg-[#1a1d21] data-[state=active]:text-white" value="overview">
                  Overview
                </TabsTrigger>
                <TabsTrigger className="rounded-full border border-slate-300 bg-white px-4 py-2 text-slate-700 data-[state=active]:border-[#1a1d21] data-[state=active]:bg-[#1a1d21] data-[state=active]:text-white" value="records">
                  Medical records
                </TabsTrigger>
                <TabsTrigger className="rounded-full border border-slate-300 bg-white px-4 py-2 text-slate-700 data-[state=active]:border-[#1a1d21] data-[state=active]:bg-[#1a1d21] data-[state=active]:text-white" value="vitals">
                  Vitals
                </TabsTrigger>
                <TabsTrigger className="rounded-full border border-slate-300 bg-white px-4 py-2 text-slate-700 data-[state=active]:border-[#1a1d21] data-[state=active]:bg-[#1a1d21] data-[state=active]:text-white" value="appointments">
                  Appointments
                </TabsTrigger>
                <TabsTrigger className="rounded-full border border-slate-300 bg-white px-4 py-2 text-slate-700 data-[state=active]:border-[#1a1d21] data-[state=active]:bg-[#1a1d21] data-[state=active]:text-white" value="transcriptions">
                  Transcriptions
                </TabsTrigger>
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
          </article>
        </div>
      </main>

      <aside className={styles.rightPanel}>
        <header className={styles.panelHeader}>
          <h3 className={styles.panelTitle}>Patient Snapshot</h3>
          <span className={styles.smallBtn}>🧾</span>
        </header>

        <div className={styles.summaryCard}>
          <p className={styles.summaryLabel}>Contact</p>
          <p className={styles.summaryValue} style={{ fontSize: "18px" }}>{patient.phone || "Not set"}</p>
          <p className={styles.summarySub}>{patient.address || "No address on file."}</p>
        </div>

        <div className={styles.reminderCard}>
          <span className={styles.reminderIcon}>✓</span>
          <p className={styles.reminderText}>
            {nextAppointment
              ? `Next visit is ${formatDate(nextAppointment.scheduled_at)}. Confirm complaints and latest vitals before the appointment.`
              : "No scheduled appointment yet. Create one from the appointments board when needed."}
          </p>
        </div>

        <div className={styles.conferenceList}>
          <Link href={`/dashboard/records/${patient.id}`} className={styles.confItem}>
            <div>
              <span className={styles.confDate}>Chart</span>
              <span className={styles.confHour}>REC</span>
            </div>
            <div>
              <p className={styles.confName}>Open records history</p>
              <p className={styles.confDoctor}>Review past diagnoses and prescriptions.</p>
            </div>
            <span className={styles.confArrow}>↗</span>
          </Link>
          <Link href={`/dashboard/appointments${nextAppointment ? `/${nextAppointment.id}` : ""}`} className={styles.confItem}>
            <div>
              <span className={styles.confDate}>Visit</span>
              <span className={styles.confHour}>{nextAppointment ? "APT" : "NEW"}</span>
            </div>
            <div>
              <p className={styles.confName}>{nextAppointment ? "Open next appointment" : "Schedule appointment"}</p>
              <p className={styles.confDoctor}>{nextAppointment ? "Jump to the linked appointment detail." : "Create a new visit from the schedule board."}</p>
            </div>
            <span className={styles.confArrow}>↗</span>
          </Link>
          <div className={styles.confItem}>
            <div>
              <span className={styles.confDate}>AI</span>
              <span className={styles.confHour}>{latestTranscription ? "ON" : "--"}</span>
            </div>
            <div>
              <p className={styles.confName}>Latest transcription</p>
              <p className={styles.confDoctor}>{latestTranscription ? formatDate(latestTranscription.created_at) : "No transcription linked yet."}</p>
            </div>
            <span className={styles.confArrow}>•</span>
          </div>
        </div>

        <Link href="/dashboard/patients" className={styles.makeConfBtn}>
          + Browse all patients
        </Link>
      </aside>
    </MockupDashboardShell>
  );
}
