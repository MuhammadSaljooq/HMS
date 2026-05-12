"use client";

import Link from "next/link";

import { MockupDashboardShell } from "@/components/layout/MockupDashboardShell";
import { useAuthStore } from "@/store/authStore";

import styles from "../theme-dashboard.module.css";

export default function MedicinePage() {
  const user = useAuthStore((s) => s.user);

  return (
    <MockupDashboardShell styles={styles} user={user} activeSection="Medicine">
      <main className={styles.main}>
          <h1 className={styles.sectionTitle}>Medicine</h1>
          <div className={styles.statRow}>
            <article className={styles.statCard}>
              <header className={styles.statHeader}>
                <h2 className={styles.cardTitle}>Medicines tracked</h2>
                <button className={styles.arrowBtn}>↗</button>
              </header>
              <span className={styles.dropdown}>Today ▾</span>
              <div className={styles.statInnerCard}>
                <div className={styles.statInnerLabel}>Active catalog</div>
                <div className={styles.statValue}>548</div>
              </div>
            </article>
            <article className={styles.statCard}>
              <header className={styles.statHeader}>
                <h2 className={styles.cardTitle}>Low stock</h2>
                <button className={styles.arrowBtn}>↗</button>
              </header>
              <span className={styles.dropdown}>Live ▾</span>
              <div className={styles.statInnerCard}>
                <div className={styles.statInnerLabel}>Items below threshold</div>
                <div className={styles.statValue}>17</div>
              </div>
            </article>
            <article className={styles.statCard}>
              <header className={styles.statHeader}>
                <h2 className={styles.cardTitle}>Dispensed today</h2>
                <button className={styles.arrowBtn}>↗</button>
              </header>
              <span className={styles.dropdown}>Now ▾</span>
              <div className={styles.statInnerCard}>
                <div className={styles.statInnerLabel}>Orders completed</div>
                <div className={styles.statValue}>143</div>
              </div>
            </article>
          </div>
          <div className={styles.bottomRow}>
            <article className={styles.dataCard}>
              <header className={styles.dataHeader}>
                <h3 className={styles.dataTitle}>Top Usage</h3>
                <span className={styles.dropdown}>This week ▾</span>
              </header>
              <div className={styles.tableHead}>
                <span>Medicine</span>
                <span>Class</span>
                <span>Used</span>
                <span>Stock</span>
              </div>
              {[
                ["Paracetamol", "Analgesic", "321", "540"],
                ["Amoxicillin", "Antibiotic", "214", "180"],
                ["Insulin", "Hormone", "98", "120"],
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
                <Link className={styles.scheduleItem} href="/dashboard/inventory">
                  <span className={styles.scheduleTime}>SYNC</span>
                  <div>
                    <p className={styles.scheduleTitle}>Open inventory board</p>
                    <p className={styles.scheduleSub}>Review reorder suggestions</p>
                  </div>
                </Link>
                <Link className={styles.scheduleItem} href="/dashboard/records">
                  <span className={styles.scheduleTime}>RX</span>
                  <div>
                    <p className={styles.scheduleTitle}>Check prescriptions</p>
                    <p className={styles.scheduleSub}>Inspect recent medical records</p>
                  </div>
                </Link>
              </div>
            </article>
          </div>
      </main>

      <aside className={styles.rightPanel}>
          <header className={styles.panelHeader}>
            <h3 className={styles.panelTitle}>Pharmacy Alerts</h3>
            <span className={styles.smallBtn}>💊</span>
          </header>
          <div className={styles.reminderCard}>
            <span className={styles.reminderIcon}>⚠️</span>
            <p className={styles.reminderText}>Amoxicillin batch is near expiry. Prioritize dispensing this week.</p>
            <button className={styles.remindBtn}>Alert</button>
          </div>
          <Link href="/dashboard/inventory" className={styles.makeConfBtn}>
            + Reorder Stock
          </Link>
      </aside>
    </MockupDashboardShell>
  );
}
