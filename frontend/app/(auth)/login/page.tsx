"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { postLoginPath } from "@/lib/auth-policy";
import { getApiErrorMessage } from "@/lib/api-errors";
import { useAuthStore } from "@/store/authStore";
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
  const [showPassword, setShowPassword] = useState(false);
  const [persistReady, setPersistReady] = useState(() => useAuthStore.persist.hasHydrated());

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
        <section className={styles.rightPanel}>
          <div className={styles.brand}>
            <svg className={styles.brandIcon} viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
              <circle cx="15" cy="15" r="10" fill="#4CAF50" opacity="0.9" />
              <circle cx="25" cy="15" r="10" fill="#2196F3" opacity="0.9" />
              <circle cx="20" cy="25" r="10" fill="#FF5722" opacity="0.9" />
            </svg>
            <span className={styles.brandText}>National Eye Care</span>
          </div>

          <p className={styles.loginEyebrow}>WELCOME BACK</p>
          <h2 className={styles.loginTitle}>Sign in to your account</h2>
          <p className={styles.loginSubtitle}>Enter your credentials to continue.</p>

          <form onSubmit={form.handleSubmit(onSubmit)} className={styles.formStack}>
            <div className={styles.formGroup}>
              <label htmlFor="email" className={styles.formLabel}>
                Email
              </label>
              <div className={styles.inputWrap}>
                <span className={styles.inputIcon} aria-hidden="true">@</span>
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
                <span className={styles.inputIcon} aria-hidden="true">*</span>
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

            {error && <p className={styles.formError}>{error}</p>}

            <button type="submit" className={styles.loginBtn} disabled={form.formState.isSubmitting}>
              {form.formState.isSubmitting ? "Signing in..." : "Sign In"}
            </button>
          </form>

          <p className={styles.loginFooter}>
            Trouble signing in? Contact IT or your ward administrator.
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
