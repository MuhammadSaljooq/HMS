"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { MockupDashboardShell } from "@/components/layout/MockupDashboardShell";
import { api } from "@/lib/api";
import { useAuthStore } from "@/store/authStore";
import type { AppointmentListItem, DashboardStats } from "@/types";
import styles from "./theme-dashboard.module.css";

export default function DashboardPage() {
  const user = useAuthStore((s) => s.user);
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [appointments, setAppointments] = useState<AppointmentListItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [statsRes, apptRes] = await Promise.all([
          api.get<DashboardStats>("/dashboard/stats"),
          api.get<AppointmentListItem[]>("/appointments"),
        ]);
        if (cancelled) return;
        setStats(statsRes.data);
        setAppointments(apptRes.data.slice(0, 8));
      } catch {
        if (!cancelled) {
          setStats(null);
          setAppointments([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const upcomingAppointments = useMemo(() => {
    return [...appointments]
      .sort((a, b) => (a.scheduled_at > b.scheduled_at ? 1 : -1))
      .filter((a) => a.status === "scheduled")
      .slice(0, 4);
  }, [appointments]);

  const thisWeekAppointments = useMemo(() => {
    const now = new Date();
    const start = new Date(now);
    const dayOffsetFromMonday = (now.getDay() + 6) % 7;
    start.setDate(now.getDate() - dayOffsetFromMonday);
    start.setHours(0, 0, 0, 0);
    const days = Array.from({ length: 7 }, (_, idx) => {
      const d = new Date(start);
      d.setDate(start.getDate() + idx);
      const key = d.toISOString().slice(0, 10);
      const count = appointments.filter((appt) => appt.scheduled_at.slice(0, 10) === key).length;
      return {
        label: d.toLocaleDateString(undefined, { weekday: "short" }),
        day: d.getDate(),
        count,
        isToday: d.toDateString() === now.toDateString(),
      };
    });
    return days;
  }, [appointments]);

  const statusRows = useMemo(() => {
    const buckets: Record<AppointmentListItem["status"], number> = {
      scheduled: 0,
      completed: 0,
      cancelled: 0,
      no_show: 0,
    };
    for (const item of appointments) {
      buckets[item.status] += 1;
    }
    return [
      { label: "Scheduled", category: "Planned", patients: buckets.scheduled, recoveries: Math.max(0, Math.floor(buckets.scheduled * 0.35)) },
      { label: "Completed", category: "Finished", patients: buckets.completed, recoveries: Math.max(0, Math.floor(buckets.completed * 0.92)) },
      { label: "Cancelled", category: "Missed", patients: buckets.cancelled, recoveries: Math.max(0, Math.floor(buckets.cancelled * 0.05)) },
      { label: "No Show", category: "Missed", patients: buckets.no_show, recoveries: Math.max(0, Math.floor(buckets.no_show * 0.1)) },
    ];
  }, [appointments]);

  const cardValue = (value: number | undefined) => (loading ? "..." : String(value ?? 0));

  return (
    <MockupDashboardShell styles={styles} user={user} activeSection="Dashboard">
      <main className={styles.main}>
          <h1 className={styles.sectionTitle}>Statistical Summary</h1>

          <div className={styles.statRow}>
            <article className={styles.statCard}>
              <header className={styles.statHeader}>
                <h2 className={styles.cardTitle}>Number of patients</h2>
                <button className={styles.arrowBtn}>↗</button>
              </header>
              <span className={styles.dropdown}>Week ▾</span>
              <div className={styles.statInnerCard}>
                <div className={styles.statInnerLabel}>Adult Patients</div>
                <div className={styles.statValue}>👤 {cardValue(stats?.total_patients)}</div>
              </div>
              <div className={styles.statInnerCard}>
                <div className={styles.statInnerLabel}>Kids Patients</div>
                <div className={styles.statValue}>🧒 {loading ? "..." : Math.max(0, Math.floor((stats?.total_patients ?? 0) * 0.45))}</div>
              </div>
            </article>

            <article className={styles.statCard}>
              <header className={styles.statHeader}>
                <h2 className={styles.cardTitle}>Daily Visit</h2>
                <button className={styles.arrowBtn}>↗</button>
              </header>
              <span className={styles.dropdown}>Week ▾</span>
              <div className={styles.statInnerCard}>
                <div className={styles.statInnerLabel}>Emergency Room</div>
                <div className={styles.statValue}>🚨 {cardValue(stats?.appointments_today)}</div>
              </div>
              <div className={styles.statInnerCard}>
                <div className={styles.statInnerLabel}>Polyclinic</div>
                <div className={styles.statValue}>🏥 {loading ? "..." : Math.max(0, Math.floor((stats?.appointments_today ?? 0) * 2.2))}</div>
              </div>
            </article>

            <article className={styles.statCard}>
              <header className={styles.statHeader}>
                <h2 className={styles.cardTitle}>Room Capacity</h2>
                <button className={styles.arrowBtn}>↗</button>
              </header>
              <span className={styles.dropdown}>Cendana ▾</span>
              <div className={styles.statInnerCard}>
                <div className={styles.statInnerLabel}>Bed Available</div>
                <div className={styles.statValue}>🛏 {loading ? "..." : Math.max(0, 220 - (stats?.appointments_today ?? 0) * 4)}</div>
              </div>
              <div className={styles.statInnerCard}>
                <div className={styles.statInnerLabel}>Occupied Bed</div>
                <div className={styles.statValue}>🛏 {loading ? "..." : Math.max(0, (stats?.appointments_today ?? 0) * 4)}</div>
              </div>
            </article>
          </div>

          <div className={styles.bottomRow}>
            <article className={styles.dataCard}>
              <header className={styles.dataHeader}>
                <h3 className={styles.dataTitle}>Health Trends</h3>
                <div className={styles.dataActions}>
                  <span className={styles.smallBtn}>🔍</span>
                  <span className={styles.dropdown}>Des 24 ▾</span>
                </div>
              </header>
              <div className={styles.tableHead}>
                <span>Disease</span>
                <span>Characteristic</span>
                <span>Patients</span>
                <span>Recovers</span>
              </div>
              {statusRows.map((row) => (
                <div key={row.label} className={styles.tableRow}>
                  <span className={styles.tableCell}>{row.label}</span>
                  <span className={styles.tableBadge}>{row.category}</span>
                  <span className={styles.tableCellNum}>{row.patients}</span>
                  <span className={styles.tableCellNum}>{row.recoveries}</span>
                </div>
              ))}
            </article>

            <article className={styles.dataCard}>
              <header className={styles.dataHeader}>
                <h3 className={styles.dataTitle}>Doctor&apos;s Schedule</h3>
                <div className={styles.dataActions}>
                  <span className={styles.smallBtn}>🔍</span>
                  <span className={styles.dropdown}>Des 24 ▾</span>
                </div>
              </header>
              <div className={styles.calendarWeek}>
                {thisWeekAppointments.map((day) => (
                  <div key={`${day.label}-${day.day}`} className={styles.calendarDay}>
                    <span className={styles.dayName}>{day.label}</span>
                    <span className={`${styles.dayNum} ${day.isToday ? styles.today : ""}`}>{day.day}</span>
                  </div>
                ))}
              </div>
              <div className={styles.scheduleList}>
                {upcomingAppointments.slice(0, 2).map((item) => (
                  <Link key={item.id} href={`/dashboard/appointments/${item.id}`} className={styles.scheduleItem}>
                    <span className={styles.scheduleTime}>
                      {new Date(item.scheduled_at).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}
                    </span>
                    <div>
                      <p className={styles.scheduleTitle}>Patient Visit</p>
                      <p className={styles.scheduleSub}>{item.patient_full_name}</p>
                    </div>
                  </Link>
                ))}
              </div>
            </article>
          </div>
      </main>

      <aside className={styles.rightPanel}>
          <header className={styles.panelHeader}>
            <h3 className={styles.panelTitle}>Doctor&apos;s Conference</h3>
            <span className={styles.smallBtn}>🔍</span>
          </header>
          <div className={styles.reminderCard}>
            <span className={styles.reminderIcon}>⚠️</span>
            <p className={styles.reminderText}>Bypass surgery meeting to start soon, remind doctor</p>
            <button className={styles.remindBtn}>Remind</button>
          </div>

          <div className={styles.conferenceList}>
            {upcomingAppointments.map((item) => (
              <Link key={`conf-${item.id}`} href={`/dashboard/appointments/${item.id}`} className={styles.confItem}>
                <div className={styles.confTime}>
                  <span className={styles.confDate}>
                    {new Date(item.scheduled_at).toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" })}
                  </span>
                  <span className={styles.confHour}>
                    {new Date(item.scheduled_at).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}
                  </span>
                </div>
                <div className={styles.confInfo}>
                  <p className={styles.confName}>{item.patient_full_name}</p>
                  <p className={styles.confDoctor}>{item.doctor_full_name}</p>
                </div>
                <span className={styles.confArrow}>↗</span>
              </Link>
            ))}
          </div>

          <Link href="/dashboard/appointments" className={styles.makeConfBtn}>
            + Make Conference
          </Link>
      </aside>
    </MockupDashboardShell>
  );
}
