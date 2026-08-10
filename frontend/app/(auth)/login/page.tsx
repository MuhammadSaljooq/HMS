"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { postLoginPath } from "@/lib/auth-policy";
import { getApiErrorMessage } from "@/lib/api-errors";
import { LOGIN_ROLE_OPTIONS } from "@/lib/roles";
import { useAuthStore } from "@/store/authStore";
import type { UserRole } from "@/types";
import styles from "./theme-login.module.css";

const schema = z.object({
  email: z.string().email("Enter a valid email"),
  password: z.string().min(1, "Password is required"),
});

type FormValues = z.infer<typeof schema>;

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const from = searchParams.get("from");
  const { login, hydrateFromServer } = useAuthStore();
  const [error, setError] = useState<string | null>(null);
  const [selectedRole, setSelectedRole] = useState<UserRole>("admin");
  const [rememberMe, setRememberMe] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [persistReady, setPersistReady] = useState(() => useAuthStore.persist.hasHydrated());
  const selectedRoleOption = LOGIN_ROLE_OPTIONS.find((option) => option.role === selectedRole) ?? LOGIN_ROLE_OPTIONS[0];

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { email: "", password: "" },
    mode: "onSubmit",
  });

  useEffect(() => {
    if (useAuthStore.persist.hasHydrated()) {
      setPersistReady(true);
      return;
    }
    const unsub = useAuthStore.persist.onFinishHydration(() => {
      setPersistReady(true);
    });
    return unsub;
  }, []);

  useEffect(() => {
    if (!persistReady) return;
    void hydrateFromServer();
  }, [persistReady, hydrateFromServer]);

  async function onSubmit(values: FormValues) {
    setError(null);
    try {
      await login(values.email, values.password);
      const u = useAuthStore.getState().user;
      if (u) {
        router.replace(postLoginPath(u.role, from));
      }
    } catch (e: unknown) {
      setError(getApiErrorMessage(e, "Login failed"));
    }
  }

  return (
    <div className={styles.page}>
      <div className={`${styles.bgBlob} ${styles.bgBlobOne}`} />
      <div className={`${styles.bgBlob} ${styles.bgBlobTwo}`} />
      <div className={`${styles.bgBlob} ${styles.bgBlobThree}`} />

      <div className={styles.wrapper}>
        <section className={styles.leftPanel}>
          <div className={`${styles.decoCircle} ${styles.decoCircleOne}`} />
          <div className={`${styles.decoCircle} ${styles.decoCircleTwo}`} />
          <div className={`${styles.decoCircle} ${styles.decoCircleThree}`} />
          <div className={`${styles.decoDot} ${styles.decoDotOne}`} />
          <div className={`${styles.decoDot} ${styles.decoDotTwo}`} />
          <div className={`${styles.decoDot} ${styles.decoDotThree}`} />

          <div className={styles.leftTop}>
            <div className={styles.leftLogo}>
              <svg className={styles.leftLogoIcon} viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
                <circle cx="15" cy="15" r="10" fill="#4CAF50" opacity="0.9" />
                <circle cx="25" cy="15" r="10" fill="#2196F3" opacity="0.9" />
                <circle cx="20" cy="25" r="10" fill="#FF5722" opacity="0.9" />
              </svg>
              <span className={styles.leftLogoText}>RSST Klaten</span>
            </div>

            <h1 className={styles.leftHeading}>
              Manage your
              <br />
              hospital <span>smarter</span>
              <br />
              {"& faster"}
            </h1>
            <p className={styles.leftSubtext}>
              Integrated platform for patient care, scheduling, and hospital operations.
            </p>
          </div>

          <div className={styles.leftStats}>
            <div className={styles.leftStat}>
              <div className={styles.leftStatLabel}>Patient records</div>
            </div>
            <div className={styles.leftStat}>
              <div className={styles.leftStatLabel}>Appointment scheduling</div>
            </div>
            <div className={styles.leftStat}>
              <div className={styles.leftStatLabel}>Clinical transcription</div>
            </div>
          </div>
        </section>

        <section className={styles.rightPanel}>
          <p className={styles.loginEyebrow}>WELCOME BACK</p>
          <h2 className={styles.loginTitle}>Sign in to your account</h2>
          <p className={styles.loginSubtitle}>
            Enter your credentials to continue. After sign-in, your authenticated account role decides where you land.
          </p>

          <div className={styles.roleSelector}>
            {LOGIN_ROLE_OPTIONS.map((option) => (
              <button
                key={option.role}
                type="button"
                className={`${styles.roleBtn} ${selectedRole === option.role ? styles.roleBtnActive : ""}`}
                onClick={() => setSelectedRole(option.role)}
              >
                {option.label}
              </button>
            ))}
          </div>
          <div className={styles.roleHint}>
            <p className={styles.roleHintTitle}>{selectedRoleOption.label} workspace preview</p>
            <p className={styles.roleHintText}>
              {selectedRoleOption.helperText} Default landing page: <strong>{selectedRoleOption.landingLabel}</strong>.
            </p>
          </div>

          <form onSubmit={form.handleSubmit(onSubmit)} className={styles.formStack}>
            <div className={styles.formGroup}>
              <label htmlFor="email" className={styles.formLabel}>
                Employee ID / Email
              </label>
              <div className={styles.inputWrap}>
                <span className={styles.inputIcon}>@</span>
                <input
                  id="email"
                  type="email"
                  autoComplete="email"
                  inputMode="email"
                  placeholder="Email address"
                  className={styles.formInput}
                  {...form.register("email")}
                />
              </div>
              {form.formState.errors.email && <p className={styles.formError}>{form.formState.errors.email.message}</p>}
            </div>

            <div className={styles.formGroup}>
              <label htmlFor="password" className={styles.formLabel}>
                Password
              </label>
              <div className={styles.inputWrap}>
                <span className={styles.inputIcon}>*</span>
                <input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  placeholder="Enter your password"
                  className={styles.formInput}
                  {...form.register("password")}
                />
                <button
                  type="button"
                  className={styles.eyeBtn}
                  onClick={() => setShowPassword((prev) => !prev)}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? "Hide" : "Show"}
                </button>
              </div>
              {form.formState.errors.password && (
                <p className={styles.formError}>{form.formState.errors.password.message}</p>
              )}
            </div>

            <div className={styles.formRow}>
              <label className={styles.rememberWrap}>
                <input
                  type="checkbox"
                  className={styles.checkboxInput}
                  checked={rememberMe}
                  onChange={(event) => setRememberMe(event.target.checked)}
                />
                <span className={`${styles.customCheck} ${rememberMe ? styles.customCheckChecked : ""}`}>
                  {rememberMe ? "x" : ""}
                </span>
                <span className={styles.rememberLabel}>Remember me</span>
              </label>
              <a href="#" className={styles.forgotLink}>
                Forgot password?
              </a>
            </div>

            {error && <p className={styles.formError}>{error}</p>}

            <button type="submit" className={styles.loginBtn} disabled={form.formState.isSubmitting}>
              {form.formState.isSubmitting ? "Signing in..." : "Sign In"}
            </button>
          </form>

          <div className={styles.divider}>or continue with</div>

          <button type="button" className={styles.ssoBtn}>
            <span className={styles.ssoIcon}>+</span>
            Sign in with Hospital SSO
          </button>

          <p className={styles.loginFooter}>
            Trouble signing in? Contact IT or your ward administrator.
          </p>
          <p className={styles.backLinkRow}>
            <Link href="/dashboard" className={styles.backLink}>
              Back to dashboard
            </Link>
          </p>
        </section>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className={styles.loadingWrap}>
          <span className={styles.loadingText}>Loading...</span>
        </div>
      }
    >
      <LoginForm />
    </Suspense>
  );
}
