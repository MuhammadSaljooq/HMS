"use client";

import Link from "next/link";
import { useState } from "react";

import { RoleGuard } from "@/components/layout/RoleGuard";
import { getApiErrorMessage } from "@/lib/api-errors";
import { api } from "@/lib/api";
import { LOGIN_ROLE_OPTIONS, USER_ROLE_LABELS } from "@/lib/roles";
import { SETTINGS_ROLES } from "@/lib/rbac";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { User, UserRole } from "@/types";
import styles from "../theme-dashboard.module.css";

type CreateUserForm = {
  full_name: string;
  email: string;
  password: string;
  role: UserRole;
};

const INITIAL_FORM: CreateUserForm = {
  full_name: "",
  email: "",
  password: "",
  role: "doctor",
};

export default function SettingsPage() {
  const [form, setForm] = useState<CreateUserForm>(INITIAL_FORM);
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<keyof CreateUserForm, string>>>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [createdUser, setCreatedUser] = useState<User | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const selectedRole = LOGIN_ROLE_OPTIONS.find((option) => option.role === form.role) ?? LOGIN_ROLE_OPTIONS[0];

  function updateForm<K extends keyof CreateUserForm>(key: K, value: CreateUserForm[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
    setFieldErrors((prev) => ({ ...prev, [key]: undefined }));
    setSubmitError(null);
    setCreatedUser(null);
  }

  function validate(values: CreateUserForm) {
    const nextErrors: Partial<Record<keyof CreateUserForm, string>> = {};
    if (!values.full_name.trim()) nextErrors.full_name = "Full name is required.";
    if (!values.email.trim()) nextErrors.email = "Email is required.";
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email.trim())) nextErrors.email = "Enter a valid email.";
    if (values.password.length < 12 || !/[A-Za-z]/.test(values.password) || !/[0-9]/.test(values.password))
      nextErrors.password = "Password must be at least 12 characters and include a letter and a digit.";
    if (!values.role) nextErrors.role = "Role is required.";
    return nextErrors;
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitError(null);
    setCreatedUser(null);
    const payload = {
      full_name: form.full_name.trim(),
      email: form.email.trim().toLowerCase(),
      password: form.password,
      role: form.role,
    };
    const nextErrors = validate(payload);
    setFieldErrors(nextErrors);
    if (Object.keys(nextErrors).length) return;

    setSubmitting(true);
    try {
      const { data } = await api.post<User>("/auth/register", payload);
      setCreatedUser(data);
      setForm({ ...INITIAL_FORM, role: payload.role });
      setFieldErrors({});
    } catch (error: unknown) {
      setSubmitError(getApiErrorMessage(error, "Could not create user."));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <RoleGuard roles={SETTINGS_ROLES}>
      <>
        <main className={styles.main}>
            <div className={styles.heroRow}>
              <div>
                <h1 className={styles.heroTitle}>Admin Settings</h1>
                <p className={styles.heroSubtitle}>
                  Create staff accounts, control built-in roles, and keep access aligned with the hospital workflow.
                </p>
              </div>
              <span className={styles.dropdown}>Admin only</span>
            </div>

            <div className={styles.statRow}>
              <div className={styles.summaryCard}>
                <p className={styles.summaryLabel}>Available roles</p>
                <p className={styles.summaryValue}>{LOGIN_ROLE_OPTIONS.length}</p>
                <p className={styles.summarySub}>Fixed system roles already supported by the backend.</p>
              </div>
              <div className={styles.summaryCard}>
                <p className={styles.summaryLabel}>Selected role</p>
                <p className={styles.summaryValue}>{selectedRole.label}</p>
                <p className={styles.summarySub}>New account will land in {selectedRole.landingLabel.toLowerCase()}.</p>
              </div>
              <div className={styles.summaryCard}>
                <p className={styles.summaryLabel}>Access policy</p>
                <p className={styles.summaryValue}>Protected</p>
                <p className={styles.summarySub}>Only admins can open this screen and submit creation requests.</p>
              </div>
            </div>

            <div className={styles.contentColumn}>
              <article className={styles.dataCard}>
                <header className={styles.dataHeader}>
                  <div>
                    <h3 className={styles.dataTitle}>Create team member</h3>
                    <p className={styles.heroSubtitle} style={{ margin: 0 }}>
                      Submit the same user payload the existing `/auth/register` route already expects.
                    </p>
                  </div>
                  <span className={styles.dropdown}>Live form</span>
                </header>

                <form className="space-y-5" onSubmit={handleSubmit}>
                  <div className="grid gap-5 sm:grid-cols-2">
                    <div className="space-y-2 sm:col-span-2">
                      <Label htmlFor="full_name">Full name</Label>
                      <Input
                        id="full_name"
                        className="h-11 bg-white"
                        placeholder="Enter staff member name"
                        value={form.full_name}
                        onChange={(event) => updateForm("full_name", event.target.value)}
                      />
                      {fieldErrors.full_name ? <p className="text-sm text-destructive">{fieldErrors.full_name}</p> : null}
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="email">Email</Label>
                      <Input
                        id="email"
                        type="email"
                        className="h-11 bg-white"
                        placeholder="name@hospital.com"
                        value={form.email}
                        onChange={(event) => updateForm("email", event.target.value)}
                      />
                      {fieldErrors.email ? <p className="text-sm text-destructive">{fieldErrors.email}</p> : null}
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="password">Temporary password</Label>
                      <Input
                        id="password"
                        type="password"
                        autoComplete="new-password"
                        className="h-11 bg-white"
                        placeholder="At least 12 characters"
                        value={form.password}
                        onChange={(event) => updateForm("password", event.target.value)}
                      />
                      <p className="text-xs text-muted-foreground">
                        At least 12 characters, including a letter and a digit.
                      </p>
                      {fieldErrors.password ? <p className="text-sm text-destructive">{fieldErrors.password}</p> : null}
                    </div>

                    <div className="space-y-2 sm:col-span-2">
                      <Label htmlFor="role">Role</Label>
                      <Select value={form.role} onValueChange={(value) => updateForm("role", value as UserRole)}>
                        <SelectTrigger id="role" className="h-11 bg-white">
                          <SelectValue placeholder="Select a role" />
                        </SelectTrigger>
                        <SelectContent>
                          {LOGIN_ROLE_OPTIONS.map((option) => (
                            <SelectItem key={option.role} value={option.role}>
                              {option.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {fieldErrors.role ? <p className="text-sm text-destructive">{fieldErrors.role}</p> : null}
                      <p className="text-sm text-muted-foreground">
                        {selectedRole.helperText} Default landing page: <strong>{selectedRole.landingLabel}</strong>.
                      </p>
                    </div>
                  </div>

                  {submitError ? (
                    <div className="rounded-2xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
                      {submitError}
                    </div>
                  ) : null}

                  {createdUser ? (
                    <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
                      <p className="font-medium">User created successfully.</p>
                      <p className="mt-1">
                        {createdUser.full_name} ({createdUser.email}) is now assigned to{" "}
                        <span className="font-medium">{USER_ROLE_LABELS[createdUser.role]}</span>.
                      </p>
                    </div>
                  ) : null}

                  <div className="flex flex-wrap gap-3">
                    <button
                      type="submit"
                      disabled={submitting}
                      className="rounded-full bg-[#f05c3a] px-5 py-2.5 text-sm font-semibold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {submitting ? "Creating user..." : "Create user"}
                    </button>
                    <button
                      type="button"
                      disabled={submitting}
                      className="rounded-full border border-slate-300 bg-white px-5 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60"
                      onClick={() => {
                        setForm(INITIAL_FORM);
                        setFieldErrors({});
                        setSubmitError(null);
                        setCreatedUser(null);
                      }}
                    >
                      Reset
                    </button>
                  </div>
                </form>
              </article>
            </div>
        </main>

        <aside className={styles.rightPanel}>
            <header className={styles.panelHeader}>
              <h3 className={styles.panelTitle}>Role Guide</h3>
              <span className={styles.smallBtn}>⚙</span>
            </header>

            <div className={styles.reminderCard}>
              <span className={styles.reminderIcon}>🔐</span>
              <p className={styles.reminderText}>
                Backend protection remains active. Non-admin users still cannot create accounts even if they try to call
                the endpoint directly.
              </p>
              <span className={styles.remindBtn}>Secure</span>
            </div>

            <div className={styles.conferenceList}>
              {LOGIN_ROLE_OPTIONS.map((option) => (
                <div key={option.role} className={styles.confItem}>
                  <div>
                    <span className={styles.confDate}>Role</span>
                    <span className={styles.confHour}>{option.label}</span>
                  </div>
                  <div>
                    <p className={styles.confName}>{option.landingLabel}</p>
                    <p className={styles.confDoctor}>{option.helperText}</p>
                  </div>
                  <span className={styles.confArrow}>{option.role === form.role ? "•" : "↗"}</span>
                </div>
              ))}
            </div>

            <Link href="/dashboard/records" className={styles.makeConfBtn}>
              + Review records access
            </Link>
        </aside>
      </>
    </RoleGuard>
  );
}
