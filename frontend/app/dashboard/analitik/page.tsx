"use client";

import Link from "next/link";

import { useDashboardOverviewData } from "@/hooks/queries/useDashboardOverviewData";
import styles from "../theme-dashboard.module.css";

export default function AnalitikPage() {
  const { stats, loading, error } = useDashboardOverviewData();

  const cardValue = (value: number | undefined) => (loading ? "..." : String(value ?? 0));

  return (
    <>
      <main className={styles.main}>
          <h1 className={styles.sectionTitle}>Analitik</h1>
          {error ? <p className={styles.errorText}>{error}</p> : null}

          <div className={styles.statRow}>
            <article className={styles.statCard}>
              <header className={styles.statHeader}>
                <h2 className={styles.cardTitle}>Total patients</h2>
              </header>
              <div className={styles.statInnerCard}>
                <div className={styles.statInnerLabel}>Registered in system</div>
                <div className={styles.statValue}>{cardValue(stats?.total_patients)}</div>
              </div>
            </article>
            <article className={styles.statCard}>
              <header className={styles.statHeader}>
                <h2 className={styles.cardTitle}>Appointments today</h2>
              </header>
              <div className={styles.statInnerCard}>
                <div className={styles.statInnerLabel}>Scheduled for today</div>
                <div className={styles.statValue}>{cardValue(stats?.appointments_today)}</div>
              </div>
            </article>
            <article className={styles.statCard}>
              <header className={styles.statHeader}>
                <h2 className={styles.cardTitle}>Active doctors</h2>
              </header>
              <div className={styles.statInnerCard}>
                <div className={styles.statInnerLabel}>Currently active</div>
                <div className={styles.statValue}>{cardValue(stats?.active_doctors)}</div>
              </div>
            </article>
          </div>

          <div className={styles.statRow}>
            <article className={styles.statCard}>
              <header className={styles.statHeader}>
                <h2 className={styles.cardTitle}>Registered today</h2>
              </header>
              <div className={styles.statInnerCard}>
                <div className={styles.statInnerLabel}>New patients today</div>
                <div className={styles.statValue}>{cardValue(stats?.patients_registered_today)}</div>
              </div>
            </article>
            <article className={styles.statCard}>
              <header className={styles.statHeader}>
                <h2 className={styles.cardTitle}>Pending transcriptions</h2>
              </header>
              <div className={styles.statInnerCard}>
                <div className={styles.statInnerLabel}>Awaiting processing</div>
                <div className={styles.statValue}>{cardValue(stats?.pending_transcriptions)}</div>
              </div>
            </article>
            <article className={styles.statCard}>
              <header className={styles.statHeader}>
                <h2 className={styles.cardTitle}>Trends</h2>
              </header>
              <div className={styles.statInnerCard}>
                <div className={styles.statInnerLabel}>Historical charts</div>
                <div className={styles.scheduleSub} style={{ marginTop: "8px" }}>Coming soon</div>
              </div>
            </article>
          </div>

          <div className={styles.bottomRow}>
            <article className={styles.dataCard} style={{ gridColumn: "1 / -1", textAlign: "center", padding: "40px 24px" }}>
              <div style={{ fontSize: "36px", marginBottom: "12px" }}>📈</div>
              <h3 className={styles.dataTitle}>Detailed analytics coming soon</h3>
              <p className={styles.scheduleSub} style={{ marginTop: "8px", maxWidth: "460px", marginInline: "auto" }}>
                Department performance, wait-time trends and historical charts will appear here once time-series
                reporting is available. The figures above reflect real, current system data.
              </p>
            </article>
          </div>
      </main>

      <aside className={styles.rightPanel}>
          <header className={styles.panelHeader}>
            <h3 className={styles.panelTitle}>Analytics</h3>
          </header>
          <div className={styles.reminderCard}>
            <span className={styles.reminderIcon}>📊</span>
            <p className={styles.reminderText}>Figures shown are live system totals. Trend charts are coming soon.</p>
          </div>
          <Link href="/dashboard/appointments" className={styles.makeConfBtn}>
            View Appointments
          </Link>
      </aside>
    </>
  );
}
