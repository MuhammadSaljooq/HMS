"use client";

import Link from "next/link";
import { useMemo } from "react";

import { useDashboardOverviewData } from "@/hooks/queries/useDashboardOverviewData";
import styles from "./theme-dashboard.module.css";

export default function DashboardPage() {
  const { stats, appointments, loading, error } = useDashboardOverviewData();

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

  const cardValue = (value: number | undefined) => (loading ? "..." : String(value ?? 0));

  return (
    <>
      <main className={styles.main}>
          <h1 className={styles.sectionTitle}>Statistical Summary</h1>
          {error ? <p className={styles.errorText}>{error}</p> : null}

          <div className={styles.statRow}>
            <article className={styles.statCard}>
              <header className={styles.statHeader}>
                <h2 className={styles.cardTitle}>Patients</h2>
              </header>
              <div className={styles.statInnerCard}>
                <div className={styles.statInnerLabel}>Total Patients</div>
                <div className={styles.statValue}>👤 {cardValue(stats?.total_patients)}</div>
              </div>
              <div className={styles.statInnerCard}>
                <div className={styles.statInnerLabel}>Registered Today</div>
                <div className={styles.statValue}>🆕 {cardValue(stats?.patients_registered_today)}</div>
              </div>
            </article>

            <article className={styles.statCard}>
              <header className={styles.statHeader}>
                <h2 className={styles.cardTitle}>Appointments</h2>
              </header>
              <div className={styles.statInnerCard}>
                <div className={styles.statInnerLabel}>Scheduled Today</div>
                <div className={styles.statValue}>📅 {cardValue(stats?.appointments_today)}</div>
              </div>
              <div className={styles.statInnerCard}>
                <div className={styles.statInnerLabel}>Pending Transcriptions</div>
                <div className={styles.statValue}>📝 {cardValue(stats?.pending_transcriptions)}</div>
              </div>
            </article>

            <article className={styles.statCard}>
              <header className={styles.statHeader}>
                <h2 className={styles.cardTitle}>Staff</h2>
              </header>
              <div className={styles.statInnerCard}>
                <div className={styles.statInnerLabel}>Active Doctors</div>
                <div className={styles.statValue}>🩺 {cardValue(stats?.active_doctors)}</div>
              </div>
            </article>
          </div>

          <div className={styles.bottomRow}>
            <article className={styles.dataCard}>
              <header className={styles.dataHeader}>
                <h3 className={styles.dataTitle}>Upcoming Appointments</h3>
              </header>
              <div className={styles.scheduleList}>
                {loading ? (
                  <p className={styles.scheduleSub}>Loading appointments...</p>
                ) : upcomingAppointments.length === 0 ? (
                  <p className={styles.scheduleSub}>No upcoming appointments scheduled.</p>
                ) : (
                  upcomingAppointments.map((item) => (
                    <Link key={item.id} href={`/dashboard/appointments/${item.id}`} className={styles.scheduleItem}>
                      <span className={styles.scheduleTime}>
                        {new Date(item.scheduled_at).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}
                      </span>
                      <div>
                        <p className={styles.scheduleTitle}>{item.patient_full_name}</p>
                        <p className={styles.scheduleSub}>{item.doctor_full_name}</p>
                      </div>
                    </Link>
                  ))
                )}
              </div>
            </article>

            <article className={styles.dataCard}>
              <header className={styles.dataHeader}>
                <h3 className={styles.dataTitle}>This Week</h3>
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
                {thisWeekAppointments.map((day) => (
                  <div key={`count-${day.label}-${day.day}`} className={styles.scheduleItem}>
                    <span className={styles.scheduleTime}>{day.label}</span>
                    <div>
                      <p className={styles.scheduleTitle}>{day.count} appointment{day.count === 1 ? "" : "s"}</p>
                    </div>
                  </div>
                ))}
              </div>
            </article>
          </div>
      </main>

      <aside className={styles.rightPanel}>
          <header className={styles.panelHeader}>
            <h3 className={styles.panelTitle}>Upcoming Appointments</h3>
          </header>

          <div className={styles.conferenceList}>
            {loading ? (
              <p className={styles.confDoctor}>Loading...</p>
            ) : upcomingAppointments.length === 0 ? (
              <p className={styles.confDoctor}>No upcoming appointments.</p>
            ) : (
              upcomingAppointments.map((item) => (
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
              ))
            )}
          </div>

          <Link href="/dashboard/appointments" className={styles.makeConfBtn}>
            View All Appointments
          </Link>
      </aside>
    </>
  );
}
