"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { MockupDashboardShell } from "@/components/layout/MockupDashboardShell";
import { api } from "@/lib/api";
import { useAuthStore } from "@/store/authStore";
import type { DashboardStats, User } from "@/types";
import styles from "../theme-dashboard.module.css";

type StaffGroup = {
  label: string;
  count: number;
};

function initials(name: string): string {
  const tokens = name.trim().split(/\s+/);
  if (tokens.length === 0) return "DR";
  if (tokens.length === 1) return tokens[0].slice(0, 2).toUpperCase();
  return `${tokens[0][0] ?? ""}${tokens[1][0] ?? ""}`.toUpperCase();
}

export default function DoctorsStaffPage() {
  const user = useAuthStore((s) => s.user);
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

  const staffGroups = useMemo<StaffGroup[]>(
    () => [
      { label: "Doctors", count: stats?.active_doctors ?? doctors.length },
      { label: "Reception", count: Math.max(4, Math.floor((stats?.appointments_today ?? 0) / 3)) },
      { label: "Nursing", count: Math.max(6, Math.floor((stats?.total_patients ?? 0) / 45)) },
      { label: "Support", count: Math.max(3, Math.floor((stats?.pending_transcriptions ?? 0) / 2) + 2) },
    ],
    [doctors.length, stats],
  );

  return (
    <MockupDashboardShell styles={styles} user={user} activeSection="Doctors and Staff">
      <main className={styles.main}>
          <h1 className={styles.sectionTitle}>Doctors &amp; Staff</h1>

          <div className={styles.statRow}>
            {staffGroups.map((group) => (
              <article key={group.label} className={styles.statCard}>
                <header className={styles.statHeader}>
                  <h2 className={styles.cardTitle}>{group.label}</h2>
                  <button className={styles.arrowBtn} type="button">
                    ↗
                  </button>
                </header>
                <span className={styles.dropdown}>Live</span>
                <div className={styles.statInnerCard}>
                  <div className={styles.statInnerLabel}>Active members</div>
                  <div className={styles.statValue}>{loading ? "..." : group.count}</div>
                </div>
              </article>
            ))}
          </div>

          <div className={styles.bottomRow}>
            <article className={styles.dataCard}>
              <header className={styles.dataHeader}>
                <h3 className={styles.dataTitle}>Doctor Directory</h3>
                <div className={styles.dataActions}>
                  <span className={styles.smallBtn}>🔍</span>
                  <span className={styles.dropdown}>Today ▾</span>
                </div>
              </header>
              <div className={styles.tableHead}>
                <span>Name</span>
                <span>Role</span>
                <span>Status</span>
                <span>Load</span>
              </div>
              {doctors.slice(0, 8).map((doctor, idx) => (
                <div key={doctor.id} className={styles.tableRow}>
                  <span className={styles.tableCell}>{doctor.full_name}</span>
                  <span className={styles.tableBadge}>Doctor</span>
                  <span className={styles.tableCellNum}>{doctor.is_active ? "On duty" : "Offline"}</span>
                  <span className={styles.tableCellNum}>{Math.max(2, 10 - idx)}</span>
                </div>
              ))}
              {!loading && doctors.length === 0 && (
                <div className={styles.tableRow}>
                  <span className={styles.tableCell}>No doctors available</span>
                  <span className={styles.tableBadge}>N/A</span>
                  <span className={styles.tableCellNum}>--</span>
                  <span className={styles.tableCellNum}>--</span>
                </div>
              )}
            </article>

            <article className={styles.dataCard}>
              <header className={styles.dataHeader}>
                <h3 className={styles.dataTitle}>Team Availability</h3>
                <div className={styles.dataActions}>
                  <span className={styles.smallBtn}>👥</span>
                  <span className={styles.dropdown}>Shift ▾</span>
                </div>
              </header>
              <div className={styles.scheduleList}>
                {staffGroups.map((group) => (
                  <div key={`slot-${group.label}`} className={styles.scheduleItem}>
                    <span className={styles.scheduleTime}>{group.label.slice(0, 3).toUpperCase()}</span>
                    <div>
                      <p className={styles.scheduleTitle}>{group.count} team members available</p>
                      <p className={styles.scheduleSub}>Managed by HR operations</p>
                    </div>
                  </div>
                ))}
              </div>
            </article>
          </div>
      </main>

      <aside className={styles.rightPanel}>
          <header className={styles.panelHeader}>
            <h3 className={styles.panelTitle}>Staff Highlights</h3>
            <span className={styles.smallBtn}>✨</span>
          </header>
          <div className={styles.reminderCard}>
            <span className={styles.reminderIcon}>👨‍⚕️</span>
            <p className={styles.reminderText}>
              {loading
                ? "Loading doctor roster..."
                : `${doctors.length} doctors loaded for today. Keep roster balanced for evening shift.`}
            </p>
            <button className={styles.remindBtn} type="button">
              Notify
            </button>
          </div>

          <div className={styles.conferenceList}>
            {doctors.slice(0, 4).map((doctor) => (
              <div key={`doctor-${doctor.id}`} className={styles.confItem}>
                <div>
                  <span className={styles.confDate}>Doctor</span>
                  <span className={styles.confHour}>{initials(doctor.full_name)}</span>
                </div>
                <div>
                  <p className={styles.confName}>{doctor.full_name}</p>
                  <p className={styles.confDoctor}>{doctor.email}</p>
                </div>
                <span className={styles.confArrow}>↗</span>
              </div>
            ))}
          </div>

          <Link href="/dashboard/appointments" className={styles.makeConfBtn}>
            + Plan Shift
          </Link>
      </aside>
    </MockupDashboardShell>
  );
}
