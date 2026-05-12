import type { UserRole } from "@/types";

export const ASSIGNABLE_USER_ROLES: UserRole[] = ["admin", "doctor", "nurse", "receptionist"];

export const USER_ROLE_LABELS: Record<UserRole, string> = {
  admin: "Admin",
  doctor: "Doctor",
  nurse: "Nurse",
  receptionist: "Receptionist",
};

export const ASSIGNABLE_USER_ROLE_OPTIONS = ASSIGNABLE_USER_ROLES.map((role) => ({
  role,
  label: USER_ROLE_LABELS[role],
}));

export const LOGIN_ROLE_OPTIONS: Array<{
  role: UserRole;
  label: string;
  landingLabel: string;
  helperText: string;
}> = [
  {
    role: "admin",
    label: USER_ROLE_LABELS.admin,
    landingLabel: "Dashboard overview",
    helperText: "Oversee hospital operations, staffing, and system settings.",
  },
  {
    role: "doctor",
    label: USER_ROLE_LABELS.doctor,
    landingLabel: "Medical records",
    helperText: "Jump into patient records, charting, and transcription workflows.",
  },
  {
    role: "nurse",
    label: USER_ROLE_LABELS.nurse,
    landingLabel: "Patients",
    helperText: "Open the patient worklist to review charts and capture vitals.",
  },
  {
    role: "receptionist",
    label: USER_ROLE_LABELS.receptionist,
    landingLabel: "Appointments",
    helperText: "Start with front-desk scheduling and patient registration tasks.",
  },
];
