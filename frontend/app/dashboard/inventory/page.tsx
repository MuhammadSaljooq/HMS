"use client";

import Link from "next/link";

import { MockupDashboardShell } from "@/components/layout/MockupDashboardShell";
import { useAuthStore } from "@/store/authStore";

import styles from "../theme-dashboard.module.css";

export default function InventoryPage() {
  const user = useAuthStore((s) => s.user);

  return (
    <MockupDashboardShell styles={styles} user={user} activeSection="Inventory">
      <main className={styles.main}>
          <h1 className={styles.sectionTitle}>Inventory</h1>
          <div className={styles.statRow}>
            <article className={styles.statCard}>
              <header className={styles.statHeader}>
                <h2 className={styles.cardTitle}>Tracked items</h2>
                <button className={styles.arrowBtn}>↗</button>
              </header>
              <span className={styles.dropdown}>Today ▾</span>
              <div className={styles.statInnerCard}>
                <div className={styles.statInnerLabel}>SKUs in stock</div>
                <div className={styles.statValue}>1,248</div>
              </div>
            </article>
            <article className={styles.statCard}>
              <header className={styles.statHeader}>
                <h2 className={styles.cardTitle}>Critical alerts</h2>
                <button className={styles.arrowBtn}>↗</button>
              </header>
              <span className={styles.dropdown}>Live ▾</span>
              <div className={styles.statInnerCard}>
                <div className={styles.statInnerLabel}>Low quantity items</div>
                <div className={styles.statValue}>31</div>
              </div>
            </article>
            <article className={styles.statCard}>
              <header className={styles.statHeader}>
                <h2 className={styles.cardTitle}>Reorders pending</h2>
                <button className={styles.arrowBtn}>↗</button>
              </header>
              <span className={styles.dropdown}>This week ▾</span>
              <div className={styles.statInnerCard}>
                <div className={styles.statInnerLabel}>Purchase requests</div>
                <div className={styles.statValue}>9</div>
              </div>
            </article>
          </div>
          <div className={styles.bottomRow}>
            <article className={styles.dataCard}>
              <header className={styles.dataHeader}>
                <h3 className={styles.dataTitle}>Inventory Board</h3>
                <span className={styles.dropdown}>Warehouse ▾</span>
              </header>
              <div className={styles.tableHead}>
                <span>Item</span>
                <span>Category</span>
                <span>In Stock</span>
                <span>Min</span>
              </div>
              {[
                ["Syringe 5ml", "Consumable", "980", "500"],
                ["N95 Mask", "PPE", "122", "200"],
                ["IV Set", "Consumable", "410", "250"],
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
                <Link className={styles.scheduleItem} href="/dashboard/medicine">
                  <span className={styles.scheduleTime}>MED</span>
                  <div>
                    <p className={styles.scheduleTitle}>Review medicine stock</p>
                    <p className={styles.scheduleSub}>Cross-check pharmacy shortages</p>
                  </div>
                </Link>
                <Link className={styles.scheduleItem} href="/dashboard/room">
                  <span className={styles.scheduleTime}>RM</span>
                  <div>
                    <p className={styles.scheduleTitle}>Update room supplies</p>
                    <p className={styles.scheduleSub}>Assign bed kits to wards</p>
                  </div>
                </Link>
              </div>
            </article>
          </div>
      </main>

      <aside className={styles.rightPanel}>
          <header className={styles.panelHeader}>
            <h3 className={styles.panelTitle}>Inventory Alerts</h3>
            <span className={styles.smallBtn}>📦</span>
          </header>
          <div className={styles.reminderCard}>
            <span className={styles.reminderIcon}>⚠️</span>
            <p className={styles.reminderText}>N95 masks below minimum stock. Suggested reorder in next 24 hours.</p>
            <button className={styles.remindBtn}>Review</button>
          </div>
          <Link href="/dashboard/medicine" className={styles.makeConfBtn}>
            + Open Pharmacy
          </Link>
      </aside>
    </MockupDashboardShell>
  );
}
