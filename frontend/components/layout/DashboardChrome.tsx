"use client";

import type { ReactNode } from "react";

import styles from "@/app/dashboard/theme-dashboard.module.css";
import { useAuthStore } from "@/store/authStore";
import { MockupDashboardShell } from "@/components/layout/MockupDashboardShell";

export function DashboardChrome({ children }: { children: ReactNode }) {
  const user = useAuthStore((state) => state.user);
  return <MockupDashboardShell styles={styles} user={user}>{children}</MockupDashboardShell>;
}
