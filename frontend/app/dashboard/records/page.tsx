"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { MockupDashboardShell } from "@/components/layout/MockupDashboardShell";
import { Input } from "@/components/ui/input";
import { usePatients } from "@/hooks/usePatients";
import { calculateAge } from "@/lib/patient-utils";
import { useAuthStore } from "@/store/authStore";
import type { Patient } from "@/types";
import styles from "../theme-dashboard.module.css";

export default function RecordsHubPage() {
  const user = useAuthStore((s) => s.user);
  const { list } = usePatients();
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<Patient[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    if (!query.trim()) {
      setHits([]);
      setLoadError(null);
      return;
    }
    const t = setTimeout(() => {
      void (async () => {
        setLoading(true);
        setLoadError(null);
        try {
          const res = await list({ search: query.trim(), limit: 12, skip: 0 });
          setHits(res.items);
        } catch {
          setHits([]);
          setLoadError("Could not search patients right now.");
        } finally {
          setLoading(false);
        }
      })();
    }, 300);
    return () => clearTimeout(t);
  }, [query, list]);

  const trimmedQuery = query.trim();
  const hasSearch = trimmedQuery.length > 0;

  const summary = useMemo(() => {
    const withPhone = hits.filter((patient) => !!patient.phone).length;
    const avgAge =
      hits.length > 0 ? Math.round(hits.reduce((sum, patient) => sum + calculateAge(patient.date_of_birth), 0) / hits.length) : 0;
    return {
      results: hits.length,
      withPhone,
      avgAge,
    };
  }, [hits]);

  return (
    <MockupDashboardShell styles={styles} user={user} activeSection="Records">
      <main className={styles.main}>
          <div className={styles.heroRow}>
            <div>
              <h1 className={styles.heroTitle}>Medical Records</h1>
              <p className={styles.heroSubtitle}>
                Search by patient name, MRN, or phone to open the full encounter history.
              </p>
            </div>
            <Link href="/dashboard/patients" className={styles.makeConfBtn}>
              + Open patient registry
            </Link>
          </div>

          <div className={styles.statRow}>
            <div className={styles.summaryCard}>
              <p className={styles.summaryLabel}>Search results</p>
              <p className={styles.summaryValue}>{hasSearch ? summary.results : "0"}</p>
              <p className={styles.summarySub}>Patients matching the current filter.</p>
            </div>
            <div className={styles.summaryCard}>
              <p className={styles.summaryLabel}>Phone-ready</p>
              <p className={styles.summaryValue}>{hasSearch ? summary.withPhone : "0"}</p>
              <p className={styles.summarySub}>Matches with a contact number on file.</p>
            </div>
            <div className={styles.summaryCard}>
              <p className={styles.summaryLabel}>Average age</p>
              <p className={styles.summaryValue}>{hasSearch && summary.results > 0 ? `${summary.avgAge}` : "--"}</p>
              <p className={styles.summarySub}>Quick demographic snapshot for the filtered list.</p>
            </div>
          </div>

          <div className={styles.contentColumn}>
            <article className={styles.dataCard}>
              <header className={styles.dataHeader}>
                <div>
                  <h3 className={styles.dataTitle}>Find patient records</h3>
                  <p className={styles.heroSubtitle} style={{ margin: 0 }}>
                    Start typing to search across names, MRNs, and phone numbers.
                  </p>
                </div>
                <span className={styles.dropdown}>Live Search</span>
              </header>
              <Input
                id="record-search"
                placeholder="Search name, MRN, or phone"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                className="h-11 bg-white"
              />
              {loading ? <p className="mt-3 text-sm text-muted-foreground">Searching patients...</p> : null}
              {loadError ? <p className={styles.errorText}>{loadError}</p> : null}
            </article>

            <article className={styles.dataCard}>
              <header className={styles.dataHeader}>
                <div>
                  <h3 className={styles.dataTitle}>Matching patients</h3>
                  <p className={styles.heroSubtitle} style={{ margin: 0 }}>
                    Open a patient to review visit history, diagnoses, and record shortcuts.
                  </p>
                </div>
                <span className={styles.dropdown}>{hasSearch ? `${hits.length} found` : "Ready"}</span>
              </header>

              {!hasSearch ? (
                <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-sm text-slate-500">
                  Search for a patient to load the medical records worklist.
                </div>
              ) : null}

              {hasSearch && !loading && hits.length === 0 && !loadError ? (
                <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-sm text-slate-500">
                  No patients match this search yet. Try a different name, MRN, or phone number.
                </div>
              ) : null}

              {hits.length > 0 ? (
                <div className="space-y-3">
                  {hits.map((patient) => (
                    <div
                      key={patient.id}
                      className="flex flex-col gap-4 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 md:flex-row md:items-center md:justify-between"
                    >
                      <div className="min-w-0">
                        <p className="text-base font-semibold text-slate-900">{patient.full_name}</p>
                        <div className="mt-1 flex flex-wrap gap-2 text-xs text-slate-500">
                          <span className="rounded-full bg-white px-2 py-1 font-medium text-slate-700">{patient.mrn}</span>
                          <span>{calculateAge(patient.date_of_birth)} yrs</span>
                          <span>{patient.gender ?? "Gender not set"}</span>
                          <span>{patient.phone ?? "No phone"}</span>
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <Link
                          href={`/dashboard/records/${patient.id}`}
                          className="rounded-full bg-[#1a1d21] px-4 py-2 text-sm font-semibold text-white transition hover:opacity-90"
                        >
                          View records
                        </Link>
                        <Link
                          href={`/dashboard/patients/${patient.id}`}
                          className="rounded-full border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-100"
                        >
                          Patient profile
                        </Link>
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
            <h3 className={styles.panelTitle}>Record Workflow</h3>
            <span className={styles.smallBtn}>🗂</span>
          </header>

          <div className={styles.reminderCard}>
            <span className={styles.reminderIcon}>📁</span>
            <p className={styles.reminderText}>
              Use records search to jump directly into encounter history before chart review or transcription.
            </p>
            <Link href="/dashboard/transcriber" className={styles.remindBtn}>
              Open AI tools
            </Link>
          </div>

          <div className={styles.conferenceList}>
            <Link href="/dashboard/patients/new" className={styles.confItem}>
              <div>
                <span className={styles.confDate}>Create</span>
                <span className={styles.confHour}>NEW</span>
              </div>
              <div>
                <p className={styles.confName}>Register patient</p>
                <p className={styles.confDoctor}>Add a new chart before the first visit.</p>
              </div>
              <span className={styles.confArrow}>↗</span>
            </Link>
            <Link href="/dashboard/appointments" className={styles.confItem}>
              <div>
                <span className={styles.confDate}>Desk</span>
                <span className={styles.confHour}>APT</span>
              </div>
              <div>
                <p className={styles.confName}>Review appointments</p>
                <p className={styles.confDoctor}>Cross-check visit schedules with patient charts.</p>
              </div>
              <span className={styles.confArrow}>↗</span>
            </Link>
            <Link href="/dashboard/settings" className={styles.confItem}>
              <div>
                <span className={styles.confDate}>Admin</span>
                <span className={styles.confHour}>SET</span>
              </div>
              <div>
                <p className={styles.confName}>Manage staff access</p>
                <p className={styles.confDoctor}>Control who can create and review records.</p>
              </div>
              <span className={styles.confArrow}>↗</span>
            </Link>
          </div>

          <Link href="/dashboard/patients" className={styles.makeConfBtn}>
            + Browse all patients
          </Link>
      </aside>
    </MockupDashboardShell>
  );
}
