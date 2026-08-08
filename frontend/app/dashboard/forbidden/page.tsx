"use client";

import Link from "next/link";

import { Button } from "@/components/ui/button";

import styles from "../theme-dashboard.module.css";

export default function ForbiddenPage() {
  return (
    <>
      <main className={styles.main}>
        <div className={styles.contentColumn}>
          <div className={styles.heroRow}>
            <div>
              <h1 className={styles.heroTitle}>Access denied</h1>
              <p className={styles.heroSubtitle}>
                You do not have permission to open this page. If you believe this is a mistake, contact your administrator.
              </p>
            </div>
          </div>

          <article className={styles.dataCard}>
            <p className="text-sm text-slate-600">
              Your current role does not include this route. Return to the dashboard or open a page that matches your
              assigned permissions.
            </p>
            <div className="mt-4 flex flex-wrap gap-3">
              <Button asChild className="rounded-full bg-[#1a1d21] px-5 text-white hover:bg-[#2a3040]">
                <Link href="/dashboard">Return to dashboard</Link>
              </Button>
              <Button asChild variant="outline" className="rounded-full">
                <Link href="/dashboard/patients">Open patients</Link>
              </Button>
            </div>
          </article>
        </div>
      </main>

      <aside className={styles.rightPanel}>
        <header className={styles.panelHeader}>
          <h3 className={styles.panelTitle}>Permission help</h3>
          <span className={styles.smallBtn}>🔐</span>
        </header>
        <div className={styles.reminderCard}>
          <span className={styles.reminderIcon}>⚠️</span>
          <p className={styles.reminderText}>If you need this page for your workflow, ask an admin to review your assigned role.</p>
        </div>
        <Link href="/dashboard/settings" className={styles.makeConfBtn}>
          + Review role settings
        </Link>
      </aside>
    </>
  );
}
