import type { UserRole } from "@/types";

export const DASHBOARD_HOME_ROLES: UserRole[] = ["admin"];
export const SETTINGS_ROLES: UserRole[] = ["admin"];
export const TRANSCRIBER_ROLES: UserRole[] = ["admin", "doctor"];
export const NEW_PATIENT_ROLES: UserRole[] = ["admin", "doctor", "receptionist"];
export const RECORD_CREATE_ROLES: UserRole[] = ["admin", "doctor"];
export const ADMIN_OPERATIONS_ROLES: UserRole[] = ["admin"];
export const BILLING_ROLES: UserRole[] = ["admin", "cashier"];
export const BILLING_ADMIN_ROLES: UserRole[] = ["admin"];

export const DEFAULT_ROLE_HOME_PATHS: Record<UserRole, string> = {
  admin: "/dashboard",
  doctor: "/dashboard/records",
  nurse: "/dashboard/patients",
  receptionist: "/dashboard/appointments",
  cashier: "/dashboard/billing",
};

const EXACT_DASHBOARD_ROUTE_RULES: Array<{ path: string; roles: UserRole[] }> = [
  { path: "/dashboard", roles: DASHBOARD_HOME_ROLES },
  { path: "/dashboard/patients/new", roles: NEW_PATIENT_ROLES },
  { path: "/dashboard/doctors-staff", roles: ADMIN_OPERATIONS_ROLES },
  { path: "/dashboard/room", roles: ADMIN_OPERATIONS_ROLES },
  { path: "/dashboard/medicine", roles: ADMIN_OPERATIONS_ROLES },
  { path: "/dashboard/analitik", roles: ADMIN_OPERATIONS_ROLES },
  { path: "/dashboard/inventory", roles: ADMIN_OPERATIONS_ROLES },
  { path: "/dashboard/billing/catalog", roles: BILLING_ADMIN_ROLES },
];

const PREFIX_DASHBOARD_ROUTE_RULES: Array<{ prefix: string; roles: UserRole[] }> = [
  { prefix: "/dashboard/settings", roles: SETTINGS_ROLES },
  { prefix: "/dashboard/transcriber", roles: TRANSCRIBER_ROLES },
  { prefix: "/dashboard/billing", roles: BILLING_ROLES },
];

export function hasRequiredRole(role: string, allowedRoles: readonly UserRole[]): boolean {
  return role === "admin" || allowedRoles.includes(role as UserRole);
}

export function isDashboardPath(pathname: string | null | undefined): boolean {
  return !!pathname && pathname.startsWith("/dashboard");
}

export function getDefaultDashboardPath(role: UserRole): string {
  return DEFAULT_ROLE_HOME_PATHS[role] ?? "/dashboard";
}

export function isDashboardRouteAllowed(pathname: string, role: string): boolean {
  for (const rule of EXACT_DASHBOARD_ROUTE_RULES) {
    if (pathname === rule.path) {
      return hasRequiredRole(role, rule.roles);
    }
  }
  for (const rule of PREFIX_DASHBOARD_ROUTE_RULES) {
    if (pathname.startsWith(rule.prefix)) {
      return hasRequiredRole(role, rule.roles);
    }
  }
  return true;
}

export function postLoginPath(role: UserRole, from: string | null): string {
  if (isDashboardPath(from) && isDashboardRouteAllowed(from as string, role)) {
    return from as string;
  }
  return getDefaultDashboardPath(role);
}
