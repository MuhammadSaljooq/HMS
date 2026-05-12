import type { UserRole } from "@/types";
import { isDashboardRouteAllowed } from "@/lib/rbac";

const DASHBOARD_PREFIX = "/dashboard";
const DEFAULT_ROLE_HOME_PATHS: Record<UserRole, string> = {
  admin: "/dashboard",
  doctor: "/dashboard/records",
  nurse: "/dashboard/patients",
  receptionist: "/dashboard/appointments",
};

export function isDashboardPath(path: string | null | undefined): boolean {
  return !!path && path.startsWith(DASHBOARD_PREFIX);
}

export function postLoginPath(role: UserRole, from: string | null): string {
  if (isDashboardPath(from) && isDashboardRouteAllowed(from as string, role)) {
    return from as string;
  }
  return DEFAULT_ROLE_HOME_PATHS[role] ?? "/dashboard";
}
