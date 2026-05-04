import type { AppointmentStatus } from "@/types";

export function appointmentStatusBadgeClass(status: AppointmentStatus): string {
  switch (status) {
    case "scheduled":
      return "border-blue-600/30 bg-blue-600/10 text-blue-800 dark:text-blue-200";
    case "completed":
      return "border-emerald-600/30 bg-emerald-600/10 text-emerald-800 dark:text-emerald-200";
    case "cancelled":
      return "border-red-600/30 bg-red-600/10 text-red-800 dark:text-red-200";
    case "no_show":
      return "border-amber-600/40 bg-amber-500/15 text-amber-900 dark:text-amber-100";
    default:
      return "border-border bg-muted text-muted-foreground";
  }
}
