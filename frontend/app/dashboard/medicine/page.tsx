"use client";

import Link from "next/link";

import styles from "../theme-dashboard.module.css";

export default function MedicinePage() {
  return (
    <>
      <main className={styles.main}>
          <h1 className={styles.sectionTitle}>Medicine</h1>
          <div className={styles.bottomRow}>
            <article className={styles.dataCard} style={{ gridColumn: "1 / -1", textAlign: "center", padding: "48px 24px" }}>
              <div style={{ fontSize: "40px", marginBottom: "12px" }}>💊</div>
              <h3 className={styles.dataTitle}>Pharmacy module coming soon</h3>
              <p className={styles.scheduleSub} style={{ marginTop: "8px", maxWidth: "420px", marginInline: "auto" }}>
                Medicine catalog, stock levels and dispensing records will appear here once the pharmacy module is
                connected to the hospital system.
              </p>
            </article>
          </div>
      </main>

      <aside className={styles.rightPanel}>
          <header className={styles.panelHeader}>
            <h3 className={styles.panelTitle}>Pharmacy</h3>
          </header>
          <div className={styles.reminderCard}>
            <span className={styles.reminderIcon}>🛠</span>
            <p className={styles.reminderText}>This module is coming soon. No live pharmacy data is available yet.</p>
          </div>
          <Link href="/dashboard/records" className={styles.makeConfBtn}>
            Go to Records
          </Link>
      </aside>
    </>
  );
}
