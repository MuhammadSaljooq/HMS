"use client";

import Link from "next/link";

import { MockupDashboardShell } from "@/components/layout/MockupDashboardShell";
import { useAuthStore } from "@/store/authStore";

import styles from "../theme-dashboard.module.css";

export default function RoomPage() {
  const user = useAuthStore((s) => s.user);

  return (
    <MockupDashboardShell styles={styles} user={user} activeSection="Room">
      <main className={styles.main}>
          <h1 className={styles.sectionTitle}>Room Management</h1>
          <div className={styles.statRow}>
            <article className={styles.statCard}>
              <header className={styles.statHeader}>
                <h2 className={styles.cardTitle}>Total rooms</h2>
                <button className={styles.arrowBtn}>↗</button>
              </header>
              <span className={styles.dropdown}>Today ▾</span>
              <div className={styles.statInnerCard}>
                <div className={styles.statInnerLabel}>Operational rooms</div>
                <div className={styles.statValue}>42</div>
              </div>
            </article>
            <article className={styles.statCard}>
              <header className={styles.statHeader}>
                <h2 className={styles.cardTitle}>Occupancy</h2>
                <button className={styles.arrowBtn}>↗</button>
              </header>
              <span className={styles.dropdown}>Live ▾</span>
              <div className={styles.statInnerCard}>
                <div className={styles.statInnerLabel}>Occupied beds</div>
                <div className={styles.statValue}>188</div>
              </div>
            </article>
            <article className={styles.statCard}>
              <header className={styles.statHeader}>
                <h2 className={styles.cardTitle}>Availability</h2>
                <button className={styles.arrowBtn}>↗</button>
              </header>
              <span className={styles.dropdown}>Now ▾</span>
              <div className={styles.statInnerCard}>
                <div className={styles.statInnerLabel}>Beds available</div>
                <div className={styles.statValue}>12</div>
              </div>
            </article>
          </div>
          <div className={styles.bottomRow}>
            <article className={styles.dataCard}>
              <header className={styles.dataHeader}>
                <h3 className={styles.dataTitle}>Room Status</h3>
                <span className={styles.dropdown}>Ward view ▾</span>
              </header>
              <div className={styles.tableHead}>
                <span>Ward</span>
                <span>Type</span>
                <span>Active</span>
                <span>Free</span>
              </div>
              {[
                ["Dahlia", "General", "36", "4"],
                ["Rose", "ICU", "24", "2"],
                ["Cendana", "Recovery", "18", "6"],
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
                <h3 className={styles.dataTitle}>Quick Actions</h3>
              </header>
              <div className={styles.scheduleList}>
                <Link className={styles.scheduleItem} href="/dashboard/patients/new">
                  <span className={styles.scheduleTime}>NEW</span>
                  <div>
                    <p className={styles.scheduleTitle}>Register patient</p>
                    <p className={styles.scheduleSub}>Assign to room after registration</p>
                  </div>
                </Link>
                <Link className={styles.scheduleItem} href="/dashboard/appointments">
                  <span className={styles.scheduleTime}>VIEW</span>
                  <div>
                    <p className={styles.scheduleTitle}>Check appointments</p>
                    <p className={styles.scheduleSub}>Review incoming bed requirements</p>
                  </div>
                </Link>
              </div>
            </article>
          </div>
      </main>

      <aside className={styles.rightPanel}>
          <header className={styles.panelHeader}>
            <h3 className={styles.panelTitle}>Room Alerts</h3>
            <span className={styles.smallBtn}>🔍</span>
          </header>
          <div className={styles.reminderCard}>
            <span className={styles.reminderIcon}>⚠️</span>
            <p className={styles.reminderText}>Two ICU beds need deep cleaning before next admission.</p>
            <button className={styles.remindBtn}>Notify</button>
          </div>
          <Link href="/dashboard/records" className={styles.makeConfBtn}>
            + Open Records
          </Link>
      </aside>
    </MockupDashboardShell>
  );
}
