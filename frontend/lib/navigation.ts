import {
  CalendarDays,
  ClipboardList,
  LayoutDashboard,
  Mic,
  PackagePlus,
  Pill,
  Receipt,
  Settings,
  Stethoscope,
  UserPlus,
  Users,
  Warehouse,
} from "lucide-react";

import {
  ADMIN_OPERATIONS_ROLES,
  BILLING_ROLES,
  DASHBOARD_HOME_ROLES,
  SETTINGS_ROLES,
  TRANSCRIBER_ROLES,
  hasRequiredRole,
} from "@/lib/rbac";
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
  { href: "/dashboard/billing", label: "Billing", shortLabel: "Cash", icon: Receipt, roles: BILLING_ROLES },
  { href: "/dashboard/doctors-staff", label: "Doctors and Staff", shortLabel: "Staff", icon: Stethoscope, roles: ADMIN_OPERATIONS_ROLES },
  { href: "/dashboard/room", label: "Room", shortLabel: "Room", icon: Warehouse, roles: ADMIN_OPERATIONS_ROLES },
  { href: "/dashboard/medicine", label: "Medicine", shortLabel: "Meds", icon: Pill, roles: ADMIN_OPERATIONS_ROLES },
  { href: "/dashboard/analitik", label: "Analitik", shortLabel: "Stats", icon: PackagePlus, roles: ADMIN_OPERATIONS_ROLES },
  { href: "/dashboard/inventory", label: "Inventory", shortLabel: "Stock", icon: UserPlus, roles: ADMIN_OPERATIONS_ROLES },
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
