"use client";

import Link from "next/link";

import { MockupDashboardShell } from "@/components/layout/MockupDashboardShell";
import { useAuthStore } from "@/store/authStore";

import styles from "../theme-dashboard.module.css";

export default function AnalitikPage() {
  const user = useAuthStore((s) => s.user);

  return (
    <MockupDashboardShell styles={styles} user={user} activeSection="Analitik">
      <main className={styles.main}>
          <h1 className={styles.sectionTitle}>Analitik</h1>
          <div className={styles.statRow}>
            <article className={styles.statCard}>
              <header className={styles.statHeader}>
                <h2 className={styles.cardTitle}>Daily admissions</h2>
                <button className={styles.arrowBtn}>↗</button>
              </header>
              <span className={styles.dropdown}>Today ▾</span>
              <div className={styles.statInnerCard}>
                <div className={styles.statInnerLabel}>Patient intake</div>
                <div className={styles.statValue}>76</div>
              </div>
            </article>
            <article className={styles.statCard}>
              <header className={styles.statHeader}>
                <h2 className={styles.cardTitle}>Average wait time</h2>
                <button className={styles.arrowBtn}>↗</button>
              </header>
              <span className={styles.dropdown}>Live ▾</span>
              <div className={styles.statInnerCard}>
                <div className={styles.statInnerLabel}>Minutes to consult</div>
                <div className={styles.statValue}>24</div>
              </div>
            </article>
            <article className={styles.statCard}>
              <header className={styles.statHeader}>
                <h2 className={styles.cardTitle}>Completion rate</h2>
                <button className={styles.arrowBtn}>↗</button>
              </header>
              <span className={styles.dropdown}>This week ▾</span>
              <div className={styles.statInnerCard}>
                <div className={styles.statInnerLabel}>Resolved visits</div>
                <div className={styles.statValue}>93%</div>
              </div>
            </article>
          </div>
          <div className={styles.bottomRow}>
            <article className={styles.dataCard}>
              <header className={styles.dataHeader}>
                <h3 className={styles.dataTitle}>Department Performance</h3>
                <span className={styles.dropdown}>Weekly ▾</span>
              </header>
              <div className={styles.tableHead}>
                <span>Department</span>
                <span>Trend</span>
                <span>Visits</span>
                <span>Avg Time</span>
              </div>
              {[
                ["OPD", "Rising", "428", "18m"],
                ["Emergency", "Stable", "201", "11m"],
                ["Pediatrics", "Rising", "143", "21m"],
              ].map((row) => (
                <div key={row[0]} className={styles.tableRow}>
                  <span className={styles.tableCell}>{row[0]}</span>
                  <span className={styles.tableBadge}>{row[1]}</span>
                  <span className={styles.tableCellNum}>{row[2]}</span>
                  <span className={styles.tableCellNum}>{row[3]}</span>
                </div>
              ))}
            </article>
            <article className={styles.dataCard}>
              <header className={styles.dataHeader}>
                <h3 className={styles.dataTitle}>Actions</h3>
              </header>
              <div className={styles.scheduleList}>
                <Link className={styles.scheduleItem} href="/dashboard/appointments">
                  <span className={styles.scheduleTime}>APPT</span>
                  <div>
                    <p className={styles.scheduleTitle}>Review appointment load</p>
                    <p className={styles.scheduleSub}>Identify upcoming bottlenecks</p>
                  </div>
                </Link>
                <Link className={styles.scheduleItem} href="/dashboard/doctors-staff">
                  <span className={styles.scheduleTime}>TEAM</span>
                  <div>
                    <p className={styles.scheduleTitle}>Balance staff coverage</p>
                    <p className={styles.scheduleSub}>Align teams with patient flow</p>
                  </div>
                </Link>
              </div>
            </article>
          </div>
      </main>

      <aside className={styles.rightPanel}>
          <header className={styles.panelHeader}>
            <h3 className={styles.panelTitle}>Insights</h3>
            <span className={styles.smallBtn}>📈</span>
          </header>
          <div className={styles.reminderCard}>
            <span className={styles.reminderIcon}>💡</span>
            <p className={styles.reminderText}>Peak patient arrivals occur between 10:00 and 13:00. Add extra counters.</p>
            <button className={styles.remindBtn}>Share</button>
          </div>
          <Link href="/dashboard/doctors-staff" className={styles.makeConfBtn}>
            + Plan Staffing
          </Link>
      </aside>
    </MockupDashboardShell>
  );
}
