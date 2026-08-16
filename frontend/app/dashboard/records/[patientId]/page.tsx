"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

import { MedicalRecordForm } from "@/components/records/MedicalRecordForm";
import { useCreateRecord } from "@/hooks/queries/useCreateRecord";
import { api } from "@/lib/api";
import { calculateAge, formatDate } from "@/lib/patient-utils";
import { RECORD_CREATE_ROLES, hasRequiredRole } from "@/lib/rbac";
import { useAuthStore } from "@/store/authStore";
import type { MedicalRecord, Patient } from "@/types";
import styles from "../../theme-dashboard.module.css";

export default function PatientRecordsPage() {
  const params = useParams<{ patientId: string }>();
  const patientId = params?.patientId ?? "";

  const userRole = useAuthStore((s) => s.role);
  const createRecord = useCreateRecord(patientId);

  const [patient, setPatient] = useState<Patient | null>(null);
  const [records, setRecords] = useState<MedicalRecord[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);

  const canCreate = !!userRole && hasRequiredRole(userRole, RECORD_CREATE_ROLES);

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

  const sortedRecords = useMemo(
    () => [...records].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()),
    [records],
  );

  const latestRecord = sortedRecords[0] ?? null;

  const handleCreateRecord = useCallback(
    async (payload: Record<string, unknown>) => {
      const created = await createRecord.mutateAsync(payload);
      await load();
      setShowForm(false);
      return created;
    },
    [createRecord, load],
  );

  const pageTitle = patient ? patient.full_name : loading ? "Loading patient record..." : "Medical records";
  const pageSubtitle = patient
    ? `MRN ${patient.mrn} · DOB ${formatDate(patient.date_of_birth)} · ${calculateAge(patient.date_of_birth)} yrs`
    : "Review encounter history, diagnoses, and quick links for this chart.";

  return (
    <>
      <main className={styles.main}>
          <div className={styles.heroRow}>
            <div>
              <h1 className={styles.heroTitle}>{pageTitle}</h1>
              <p className={styles.heroSubtitle}>{pageSubtitle}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              {patient && canCreate ? (
                <button
                  type="button"
                  className={styles.makeConfBtn}
                  onClick={() => setShowForm((v) => !v)}
                >
                  {showForm ? "Close form" : "+ New record"}
                </button>
              ) : null}
              {patient ? (
                <Link href={`/dashboard/patients/${patient.id}`} className={styles.makeConfBtn}>
                  + Open patient profile
                </Link>
              ) : null}
              <Link
                href="/dashboard/records"
                className="rounded-full border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-100"
              >
                Back to search
              </Link>
            </div>
          </div>

          {error ? <p className={styles.errorText}>{error}</p> : null}

          <div className={styles.statRow}>
            <div className={styles.summaryCard}>
              <p className={styles.summaryLabel}>Encounters</p>
              <p className={styles.summaryValue}>{loading ? "..." : sortedRecords.length}</p>
              <p className={styles.summarySub}>Recorded visits in the chart.</p>
            </div>
            <div className={styles.summaryCard}>
              <p className={styles.summaryLabel}>Latest diagnosis</p>
              <p className={styles.summaryValue} style={{ fontSize: 18 }}>
                {loading ? "..." : latestRecord?.diagnosis || "No diagnosis"}
              </p>
              <p className={styles.summarySub}>Most recent documented assessment.</p>
            </div>
            <div className={styles.summaryCard}>
              <p className={styles.summaryLabel}>Last updated</p>
              <p className={styles.summaryValue}>{loading ? "..." : latestRecord ? formatDate(latestRecord.created_at) : "--"}</p>
              <p className={styles.summarySub}>Newest record entry timestamp.</p>
            </div>
          </div>

          <div className={styles.contentColumn}>
            {patient && canCreate && showForm ? (
              <article className={styles.dataCard}>
                <header className={styles.dataHeader}>
                  <div>
                    <h3 className={styles.dataTitle}>New medical record</h3>
                    <p className={styles.heroSubtitle} style={{ margin: 0 }}>
                      Document a diagnosis, notes, and any prescriptions for {patient.full_name}.
                    </p>
                  </div>
                </header>
                <div className="mt-4">
                  <MedicalRecordForm
                    patientId={patientId}
                    onSubmit={handleCreateRecord}
                    onCancel={() => setShowForm(false)}
                  />
                </div>
              </article>
            ) : null}

            <article className={styles.dataCard}>
              <header className={styles.dataHeader}>
                <div>
                  <h3 className={styles.dataTitle}>Encounter history</h3>
                  <p className={styles.heroSubtitle} style={{ margin: 0 }}>
                    Newest visits appear first. Use the patient profile for full chart editing.
                  </p>
                </div>
                <span className={styles.dropdown}>{loading ? "Loading" : `${sortedRecords.length} entries`}</span>
              </header>

              {loading ? <p className="text-sm text-muted-foreground">Loading patient records...</p> : null}

              {!loading && patient && sortedRecords.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-sm text-slate-500">
                  No medical records have been created for this patient yet.
                </div>
              ) : null}

              {sortedRecords.length > 0 ? (
                <div className="space-y-3">
                  {sortedRecords.map((record) => (
                    <div
                      key={record.id}
                      className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4"
                    >
                      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                            <span className="rounded-full bg-white px-2 py-1 font-medium text-slate-700">
                              {formatDate(record.created_at)}
                            </span>
                            <span>Record ID {record.id.slice(0, 8)}</span>
                          </div>
                          <p className="mt-3 text-base font-semibold text-slate-900">{record.diagnosis || "Diagnosis not entered"}</p>
                          <p className="mt-1 text-sm text-slate-600">
                            {record.notes?.trim() ? record.notes : "No encounter notes were added to this record."}
                          </p>
                        </div>
                        {patient ? (
                          <Link
                            href={`/dashboard/patients/${patient.id}?tab=records`}
                            className="rounded-full border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-100"
                          >
                            Open on profile
                          </Link>
                        ) : null}
                      </div>
                    </div>
                  ))}
                </div>
              ) : null}
            </article>
          </div>
      </main>

      <aside className={styles.rightPanel}>
          <header className={styles.panelHeader}>
            <h3 className={styles.panelTitle}>Patient Snapshot</h3>
            <span className={styles.smallBtn} aria-hidden="true">👁</span>
          </header>

          <div className={styles.reminderCard}>
            <span className={styles.reminderIcon}>🧾</span>
            <p className={styles.reminderText}>
              {patient
                ? `${patient.full_name}'s chart is ready for review. Use the patient profile to add vitals, records, and prescriptions.`
                : "Waiting for patient chart details."}
            </p>
            {patient ? (
              <Link href={`/dashboard/patients/${patient.id}`} className={styles.remindBtn}>
                Open chart
              </Link>
            ) : null}
          </div>

          <div className={styles.conferenceList}>
            <div className={styles.confItem}>
              <div>
                <span className={styles.confDate}>MRN</span>
                <span className={styles.confHour}>{patient?.mrn ?? "--"}</span>
              </div>
              <div>
                <p className={styles.confName}>Patient identifier</p>
                <p className={styles.confDoctor}>Used across appointments and chart search.</p>
              </div>
              <span className={styles.confArrow} aria-hidden="true" />
            </div>
            <div className={styles.confItem}>
              <div>
                <span className={styles.confDate}>Age</span>
                <span className={styles.confHour}>{patient ? calculateAge(patient.date_of_birth) : "--"}</span>
              </div>
              <div>
                <p className={styles.confName}>Demographics</p>
                <p className={styles.confDoctor}>
                  {patient ? `${patient.gender ?? "Gender not set"} · ${patient.blood_group ?? "Blood group not set"}` : "Pending"}
                </p>
              </div>
              <span className={styles.confArrow} aria-hidden="true" />
            </div>
            <div className={styles.confItem}>
              <div>
                <span className={styles.confDate}>Phone</span>
                <span className={styles.confHour}>{patient?.phone ?? "--"}</span>
              </div>
              <div>
                <p className={styles.confName}>Primary contact</p>
                <p className={styles.confDoctor}>Use for follow-up and appointment reminders.</p>
              </div>
              <span className={styles.confArrow} aria-hidden="true" />
            </div>
          </div>

          <Link href="/dashboard/records" className={styles.makeConfBtn}>
            + Search another chart
          </Link>
      </aside>
    </>
  );
}
