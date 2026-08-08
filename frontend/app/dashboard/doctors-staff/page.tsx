"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { api } from "@/lib/api";
import type { DashboardStats, User } from "@/types";
import styles from "../theme-dashboard.module.css";

function initials(name: string): string {
  const tokens = name.trim().split(/\s+/);
  if (tokens.length === 0) return "DR";
  if (tokens.length === 1) return tokens[0].slice(0, 2).toUpperCase();
  return `${tokens[0][0] ?? ""}${tokens[1][0] ?? ""}`.toUpperCase();
}

export default function DoctorsStaffPage() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [doctors, setDoctors] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [statsRes, doctorsRes] = await Promise.all([
          api.get<DashboardStats>("/dashboard/stats"),
          api.get<User[]>("/users/doctors"),
        ]);
        if (cancelled) return;
        setStats(statsRes.data);
        setDoctors(doctorsRes.data);
      } catch {
        if (!cancelled) {
          setStats(null);
          setDoctors([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const activeDoctors = stats?.active_doctors ?? doctors.filter((d) => d.is_active).length;

  return (
    <>
      <main className={styles.main}>
          <h1 className={styles.sectionTitle}>Doctors &amp; Staff</h1>

          <div className={styles.statRow}>
            <article className={styles.statCard}>
              <header className={styles.statHeader}>
                <h2 className={styles.cardTitle}>Active Doctors</h2>
              </header>
              <div className={styles.statInnerCard}>
                <div className={styles.statInnerLabel}>Currently active</div>
                <div className={styles.statValue}>{loading ? "..." : activeDoctors}</div>
              </div>
            </article>
            <article className={styles.statCard}>
              <header className={styles.statHeader}>
                <h2 className={styles.cardTitle}>Doctors on Record</h2>
              </header>
              <div className={styles.statInnerCard}>
                <div className={styles.statInnerLabel}>Total in roster</div>
                <div className={styles.statValue}>{loading ? "..." : doctors.length}</div>
              </div>
            </article>
          </div>

          <div className={styles.bottomRow}>
            <article className={styles.dataCard} style={{ gridColumn: "1 / -1" }}>
              <header className={styles.dataHeader}>
                <h3 className={styles.dataTitle}>Doctor Directory</h3>
              </header>
              <div className={styles.tableHead} style={{ gridTemplateColumns: "1.4fr 1fr 1fr" }}>
                <span>Name</span>
                <span>Email</span>
                <span>Status</span>
              </div>
              {loading ? (
                <div className={styles.tableRow} style={{ gridTemplateColumns: "1fr" }}>
                  <span className={styles.tableCell}>Loading doctors...</span>
                </div>
              ) : doctors.length === 0 ? (
                <div className={styles.tableRow} style={{ gridTemplateColumns: "1fr" }}>
                  <span className={styles.tableCell}>No doctors available</span>
                </div>
              ) : (
                doctors.map((doctor) => (
                  <div key={doctor.id} className={styles.tableRow} style={{ gridTemplateColumns: "1.4fr 1fr 1fr" }}>
                    <span className={styles.tableCell}>{doctor.full_name}</span>
                    <span className={styles.tableCell}>{doctor.email}</span>
                    <span className={styles.tableCellNum}>{doctor.is_active ? "On duty" : "Offline"}</span>
                  </div>
                ))
              )}
            </article>
          </div>
      </main>

      <aside className={styles.rightPanel}>
          <header className={styles.panelHeader}>
            <h3 className={styles.panelTitle}>Doctor Roster</h3>
          </header>

          <div className={styles.conferenceList}>
            {loading ? (
              <p className={styles.confDoctor}>Loading doctor roster...</p>
            ) : doctors.length === 0 ? (
              <p className={styles.confDoctor}>No doctors available.</p>
            ) : (
              doctors.slice(0, 6).map((doctor) => (
                <div key={`doctor-${doctor.id}`} className={styles.confItem}>
                  <div>
                    <span className={styles.confDate}>Doctor</span>
                    <span className={styles.confHour}>{initials(doctor.full_name)}</span>
                  </div>
                  <div>
                    <p className={styles.confName}>{doctor.full_name}</p>
                    <p className={styles.confDoctor}>{doctor.email}</p>
                  </div>
                </div>
              ))
            )}
          </div>

          <Link href="/dashboard/appointments" className={styles.makeConfBtn}>
            View Appointments
          </Link>
      </aside>
    </>
  );
}
