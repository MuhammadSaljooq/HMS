"use client";

import type { ReactNode } from "react";

import { USER_ROLE_LABELS } from "@/lib/roles";
import type { User } from "@/types";

const TOP_NAV_ITEMS = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/dashboard/patients", label: "Patient" },
  { href: "/dashboard/doctors-staff", label: "Doctors and Staff" },
  { href: "/dashboard/room", label: "Room" },
  { href: "/dashboard/medicine", label: "Medicine" },
  { href: "/dashboard/analitik", label: "Analitik" },
  { href: "/dashboard/inventory", label: "Inventory" },
] as const;

const RAIL_PRIMARY_LINKS = [
  { icon: "‹", href: "/dashboard", label: "Go to dashboard" },
  { icon: "⇄", href: "/dashboard/patients", label: "Go to patients" },
  { icon: "↓", href: "/dashboard/appointments", label: "Go to appointments" },
  { icon: "☆", href: "/dashboard/transcriber", label: "Go to transcriber" },
  { icon: "+", href: "/dashboard/patients/new", label: "Register new patient" },
  { icon: "🗄", href: "/dashboard/records", label: "Go to records" },
] as const;

const RAIL_SECONDARY_LINKS = [
  { icon: "📊", href: "/dashboard/doctors-staff", label: "Go to doctors and staff" },
  { icon: "⚙", href: "/dashboard/settings", label: "Go to settings" },
] as const;

type MockupThemeStyles = Readonly<Record<string, string>>;

export function MockupDashboardShell({
  styles,
  user,
  activeSection,
  children,
}: {
  styles: MockupThemeStyles;
  user: User | null;
  activeSection?: string;
  children: ReactNode;
}) {
  const topNavLabels = new Set<string>(TOP_NAV_ITEMS.map((item) => item.label));
  const showExtraActivePill = activeSection && !topNavLabels.has(activeSection);

  return (
    <div className={styles.page}>
      <nav className={styles.topnav}>
        <div className={styles.logo}>
          <svg className={styles.logoIcon} viewBox="0 0 36 36" fill="none" xmlns="http://www.w3.org/2000/svg">
            <circle cx="13" cy="13" r="9" fill="#4CAF50" opacity="0.85" />
            <circle cx="23" cy="13" r="9" fill="#2196F3" opacity="0.85" />
            <circle cx="18" cy="23" r="9" fill="#FF5722" opacity="0.85" />
          </svg>
        </div>

        <div className={styles.navLinks}>
          {TOP_NAV_ITEMS.map((item) => (
            <a
              key={item.href}
              className={item.label === activeSection ? `${styles.navLink} ${styles.navLinkActive}` : styles.navLink}
              href={item.href}
              aria-current={item.label === activeSection ? "page" : undefined}
            >
              {item.label}
            </a>
          ))}

          {showExtraActivePill ? (
            <span className={`${styles.navLink} ${styles.navLinkActive}`} aria-current="page">
              {activeSection}
            </span>
          ) : null}
        </div>

        <div className={styles.navRight}>
          <span className={styles.iconBtn}>✉</span>
          <span className={styles.iconBtn}>🔔</span>
          <div className={styles.userInfo}>
            <div className={styles.userText}>
              <span className={styles.userRole}>{user ? USER_ROLE_LABELS[user.role] : "Staff"}</span>
              <span className={styles.userName}>{user?.full_name ?? "Loading session"}</span>
            </div>
            <span className={styles.userAvatar}>👩‍⚕️</span>
          </div>
        </div>
      </nav>

      <div className={styles.layout}>
        <aside className={styles.leftRail}>
          {RAIL_PRIMARY_LINKS.map((item) => (
            <a key={item.href} className={styles.railBtn} href={item.href} aria-label={item.label} title={item.label}>
              {item.icon}
            </a>
          ))}
          <div className={styles.railSpacer} />
          {RAIL_SECONDARY_LINKS.map((item) => (
            <a key={item.href} className={styles.railBtn} href={item.href} aria-label={item.label} title={item.label}>
              {item.icon}
            </a>
          ))}
        </aside>

        {children}
      </div>
    </div>
  );
}
