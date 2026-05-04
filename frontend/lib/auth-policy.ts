import type { UserRole } from "@/types";

const DASHBOARD_PREFIX = "/dashboard";

export function isDashboardPath(path: string | null | undefined): boolean {
  return !!path && path.startsWith(DASHBOARD_PREFIX);
}

export function postLoginPath(role: UserRole, from: string | null): string {
  if (isDashboardPath(from)) {
    return from as string;
  }
  switch (role) {
    case "admin":
      return "/dashboard";
    case "doctor":
      return "/dashboard/patients";
    case "receptionist":
      return "/dashboard/appointments";
    case "nurse":
      return "/dashboard/patients";
    default:
      return "/dashboard";
  }
}
