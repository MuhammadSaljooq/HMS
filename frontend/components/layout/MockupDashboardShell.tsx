"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";

import { visibleDashboardNav } from "@/lib/navigation";
import { USER_ROLE_LABELS } from "@/lib/roles";
import { useAuthStore } from "@/store/authStore";
import type { User } from "@/types";

type MockupThemeStyles = Readonly<Record<string, string>>;
type RailLink = {
  href: string;
  label: string;
  icon: string;
};

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
  const pathname = usePathname();
  const router = useRouter();
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const visibleNav = visibleDashboardNav(user?.role);

  async function handleLogout() {
    if (isLoggingOut) return;
    setIsLoggingOut(true);
    try {
      await useAuthStore.getState().logout();
      router.replace("/login");
    } finally {
      setIsLoggingOut(false);
    }
  }
  const topNavLabels = new Set<string>(visibleNav.map((item) => item.label));
  const showExtraActivePill = activeSection && !topNavLabels.has(activeSection);

  const railPrimaryLinks: RailLink[] = [
    ...visibleNav.filter((item) =>
      ["/dashboard", "/dashboard/patients", "/dashboard/appointments", "/dashboard/transcriber", "/dashboard/records"].includes(
        item.href,
      ),
    ).map((item) => ({
      href: item.href,
      label: item.label,
      icon: item.shortLabel?.[0] ?? item.label[0],
    })),
    ...(user?.role === "admin" || user?.role === "doctor" || user?.role === "receptionist"
      ? [{ href: "/dashboard/patients/new", label: "Register new patient", icon: "+" }]
      : []),
  ];

  const railSecondaryLinks: RailLink[] = visibleNav
    .filter((item) => ["/dashboard/doctors-staff", "/dashboard/settings"].includes(item.href))
    .map((item) => ({
      href: item.href,
      label: item.label,
      icon: item.shortLabel?.[0] ?? item.label[0],
    }));

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
          {visibleNav.map((item) => (
            <Link
              key={item.href}
              className={
                (item.href === "/dashboard" ? pathname === "/dashboard" || pathname === "/dashboard/" : pathname.startsWith(item.href))
                  ? `${styles.navLink} ${styles.navLinkActive}`
                  : styles.navLink
              }
              href={item.href}
              aria-current={
                item.href === "/dashboard" ? (pathname === "/dashboard" || pathname === "/dashboard/" ? "page" : undefined) : pathname.startsWith(item.href) ? "page" : undefined
              }
            >
              {item.label}
            </Link>
          ))}

          {showExtraActivePill ? (
            <span className={`${styles.navLink} ${styles.navLinkActive}`} aria-current="page">
              {activeSection}
            </span>
          ) : null}
        </div>

        <div className={styles.navRight}>
          <span className={styles.iconBtn} aria-hidden="true">✉</span>
          <span className={styles.iconBtn} aria-hidden="true">🔔</span>
          <div className={styles.userInfo}>
            <div className={styles.userText}>
              <span className={styles.userRole}>{user ? USER_ROLE_LABELS[user.role] : "Staff"}</span>
              <span className={styles.userName}>{user?.full_name ?? "Loading session"}</span>
            </div>
            <span className={styles.userAvatar} aria-hidden="true">👩‍⚕️</span>
          </div>
          <button
            type="button"
            className={styles.logoutBtn}
            onClick={handleLogout}
            disabled={isLoggingOut}
          >
            {isLoggingOut ? "Logging out…" : "Logout"}
          </button>
        </div>
      </nav>

      <div className={styles.layout}>
        <aside className={styles.leftRail}>
          {railPrimaryLinks.map((item) => (
            <Link key={item.href} className={styles.railBtn} href={item.href} aria-label={item.label} title={item.label}>
              {item.icon}
            </Link>
          ))}
          <div className={styles.railSpacer} />
          {railSecondaryLinks.map((item) => (
            <Link key={item.href} className={styles.railBtn} href={item.href} aria-label={item.label} title={item.label}>
              {item.icon}
            </Link>
          ))}
        </aside>

        {children}
      </div>
    </div>
  );
}
