import { CalendarDays, ClipboardList, LayoutDashboard, Mic, Settings, Users } from "lucide-react";

import { DASHBOARD_HOME_ROLES, SETTINGS_ROLES, TRANSCRIBER_ROLES, hasRequiredRole } from "@/lib/rbac";
import type { UserRole } from "@/types";

export type DashboardNavItem = {
  href: string;
  label: string;
  shortLabel?: string;
  icon: typeof LayoutDashboard;
  roles?: UserRole[];
};

export const DASHBOARD_NAV_ITEMS: DashboardNavItem[] = [
  { href: "/dashboard", label: "Dashboard", shortLabel: "Home", icon: LayoutDashboard, roles: DASHBOARD_HOME_ROLES },
  { href: "/dashboard/patients", label: "Patients", icon: Users },
  { href: "/dashboard/appointments", label: "Appointments", shortLabel: "Appts", icon: CalendarDays },
  { href: "/dashboard/transcriber", label: "Transcriber", shortLabel: "Mic", icon: Mic, roles: TRANSCRIBER_ROLES },
  { href: "/dashboard/records", label: "Records", icon: ClipboardList },
  { href: "/dashboard/settings", label: "Settings", shortLabel: "More", icon: Settings, roles: SETTINGS_ROLES },
];

export function canSeeNavItem(role: UserRole | null | undefined, item: DashboardNavItem): boolean {
  if (!role) return false;
  if (!item.roles?.length) return true;
  return hasRequiredRole(role, item.roles);
}

export function visibleDashboardNav(role: UserRole | null | undefined): DashboardNavItem[] {
  return DASHBOARD_NAV_ITEMS.filter((item) => canSeeNavItem(role, item));
}
