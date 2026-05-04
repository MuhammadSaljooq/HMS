import type { UserRole } from "@/types";

export const SETTINGS_ROLES: UserRole[] = ["admin"];
export const TRANSCRIBER_ROLES: UserRole[] = ["admin", "doctor"];
export const NEW_PATIENT_ROLES: UserRole[] = ["admin", "doctor", "receptionist"];

const DASHBOARD_ROUTE_RULES: Array<{ prefix: string; roles: UserRole[] }> = [
  { prefix: "/dashboard/settings", roles: SETTINGS_ROLES },
  { prefix: "/dashboard/transcriber", roles: TRANSCRIBER_ROLES },
  { prefix: "/dashboard/patients/new", roles: NEW_PATIENT_ROLES },
];

export function hasRequiredRole(role: string, allowedRoles: readonly UserRole[]): boolean {
  return allowedRoles.includes(role as UserRole);
}

export function isDashboardRouteAllowed(pathname: string, role: string): boolean {
  for (const rule of DASHBOARD_ROUTE_RULES) {
    if (pathname.startsWith(rule.prefix)) {
      return hasRequiredRole(role, rule.roles);
    }
  }
  return true;
}
