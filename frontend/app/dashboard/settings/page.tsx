"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";

import { RoleGuard } from "@/components/layout/RoleGuard";
import { getApiErrorMessage } from "@/lib/api-errors";
import { api } from "@/lib/api";
import { LOGIN_ROLE_OPTIONS, USER_ROLE_LABELS } from "@/lib/roles";
import { SETTINGS_ROLES } from "@/lib/rbac";
import { useUpdateUserMutation, useUsersQuery } from "@/hooks/queries/useUsers";
import { useAuthStore } from "@/store/authStore";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { User, UserRole } from "@/types";
import styles from "../theme-dashboard.module.css";

const PAGE_SIZE = 50;

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
  const queryClient = useQueryClient();

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
      await queryClient.invalidateQueries({ queryKey: ["users"] });
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

              <ManageAccountsSection />
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

const ALL_ROLES: UserRole[] = LOGIN_ROLE_OPTIONS.map((option) => option.role);

function formatCreatedAt(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

function ManageAccountsSection() {
  const currentUserId = useAuthStore((state) => state.user?.id);

  const [page, setPage] = useState(0);
  const [roleFilter, setRoleFilter] = useState<UserRole | "all">("all");
  const [activeOnly, setActiveOnly] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [pendingUserId, setPendingUserId] = useState<string | null>(null);
  const [confirmUserId, setConfirmUserId] = useState<string | null>(null);

  const skip = page * PAGE_SIZE;

  const { items, total, loading, fetching, error } = useUsersQuery({
    skip,
    limit: PAGE_SIZE,
    role: roleFilter === "all" ? undefined : roleFilter,
    isActive: activeOnly ? true : undefined,
  });

  const updateMutation = useUpdateUserMutation();

  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const rangeStart = total === 0 ? 0 : skip + 1;
  const rangeEnd = Math.min(skip + items.length, total);

  const roleSelectItems = useMemo(
    () => LOGIN_ROLE_OPTIONS.map((option) => ({ role: option.role, label: option.label })),
    [],
  );

  async function runUpdate(user: User, body: { role?: UserRole; is_active?: boolean }) {
    setActionError(null);
    setPendingUserId(user.id);
    try {
      await updateMutation.mutateAsync({ id: user.id, body });
    } catch (mutationError: unknown) {
      setActionError(getApiErrorMessage(mutationError, "Could not update the account."));
    } finally {
      setPendingUserId(null);
    }
  }

  function handleRoleChange(user: User, nextRole: UserRole) {
    if (nextRole === user.role) return;
    void runUpdate(user, { role: nextRole });
  }

  function handleToggleActive(user: User) {
    if (user.is_active) {
      setConfirmUserId(user.id);
      return;
    }
    void runUpdate(user, { is_active: true });
  }

  function confirmDeactivate(user: User) {
    setConfirmUserId(null);
    void runUpdate(user, { is_active: false });
  }

  function resetFilters(next: () => void) {
    setActionError(null);
    setPage(0);
    next();
  }

  return (
    <article className={styles.dataCard}>
      <header className={styles.dataHeader}>
        <div>
          <h3 className={styles.dataTitle}>Manage accounts</h3>
          <p className={styles.heroSubtitle} style={{ margin: 0 }}>
            Change built-in roles or deactivate accounts. Backend guards still protect the last admin and your own account.
          </p>
        </div>
        <span className={styles.dropdown}>{total} total</span>
      </header>

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <Label htmlFor="user-role-filter" className="text-xs uppercase tracking-wide text-muted-foreground">
            Role
          </Label>
          <Select
            value={roleFilter}
            onValueChange={(value) => resetFilters(() => setRoleFilter(value as UserRole | "all"))}
          >
            <SelectTrigger id="user-role-filter" className="h-9 w-[150px] bg-white">
              <SelectValue placeholder="All roles" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All roles</SelectItem>
              {roleSelectItems.map((option) => (
                <SelectItem key={option.role} value={option.role}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-700">
          <input
            type="checkbox"
            className="h-4 w-4 rounded border-slate-300"
            checked={activeOnly}
            onChange={(event) => resetFilters(() => setActiveOnly(event.target.checked))}
          />
          Active only
        </label>

        {fetching ? <span className="text-xs text-muted-foreground">Refreshing…</span> : null}
      </div>

      {actionError ? (
        <div className="mb-4 rounded-2xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          {actionError}
        </div>
      ) : null}

      {error ? (
        <div className="rounded-2xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      ) : loading ? (
        <p className="py-8 text-center text-sm text-muted-foreground">Loading accounts…</p>
      ) : items.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">No accounts match the current filters.</p>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-slate-200">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Created</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((user) => {
                const isSelf = !!currentUserId && user.id === currentUserId;
                const isBusy = pendingUserId === user.id;
                const selfTooltip = isSelf ? "You can't change your own account here." : undefined;

                return (
                  <TableRow key={user.id}>
                    <TableCell className="font-medium text-slate-900">{user.full_name}</TableCell>
                    <TableCell className="text-slate-600">{user.email}</TableCell>
                    <TableCell>
                      <Select
                        value={user.role}
                        onValueChange={(value) => handleRoleChange(user, value as UserRole)}
                        disabled={isSelf || isBusy}
                      >
                        <SelectTrigger
                          className="h-9 w-[150px] bg-white"
                          title={selfTooltip}
                          aria-label={`Change role for ${user.full_name}`}
                        >
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {ALL_ROLES.map((role) => (
                            <SelectItem key={role} value={role}>
                              {USER_ROLE_LABELS[role]}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell>
                      <Badge variant={user.is_active ? "secondary" : "outline"}>
                        {user.is_active ? "Active" : "Inactive"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-slate-600">{formatCreatedAt(user.created_at)}</TableCell>
                    <TableCell className="text-right">
                      {confirmUserId === user.id ? (
                        <div className="flex items-center justify-end gap-2">
                          <span className="text-xs text-slate-600">Deactivate?</span>
                          <button
                            type="button"
                            disabled={isBusy}
                            onClick={() => confirmDeactivate(user)}
                            className="rounded-full bg-destructive px-3 py-1.5 text-xs font-semibold text-destructive-foreground transition hover:opacity-90 disabled:opacity-60"
                          >
                            Confirm
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirmUserId(null)}
                            className="rounded-full border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-100"
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          disabled={isSelf || isBusy}
                          title={selfTooltip}
                          onClick={() => handleToggleActive(user)}
                          className={
                            user.is_active
                              ? "rounded-full border border-destructive/40 bg-white px-4 py-1.5 text-xs font-semibold text-destructive transition hover:bg-destructive/5 disabled:cursor-not-allowed disabled:opacity-50"
                              : "rounded-full border border-emerald-300 bg-white px-4 py-1.5 text-xs font-semibold text-emerald-700 transition hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-50"
                          }
                        >
                          {isBusy ? "Saving…" : user.is_active ? "Deactivate" : "Reactivate"}
                        </button>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      {!loading && !error && items.length > 0 ? (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs text-muted-foreground">
            Showing {rangeStart}–{rangeEnd} of {total} · Page {page + 1} of {pageCount}
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={page === 0 || fetching}
              onClick={() => setPage((prev) => Math.max(0, prev - 1))}
              className="rounded-full border border-slate-300 bg-white px-4 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Previous
            </button>
            <button
              type="button"
              disabled={skip + items.length >= total || fetching}
              onClick={() => setPage((prev) => prev + 1)}
              className="rounded-full border border-slate-300 bg-white px-4 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Next
            </button>
          </div>
        </div>
      ) : null}
    </article>
  );
}
