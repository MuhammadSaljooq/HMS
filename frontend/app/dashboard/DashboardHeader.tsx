"use client";

import { useEffect, useState } from "react";

import { useAuthStore } from "@/store/authStore";
import styles from "./theme-dashboard.module.css";

const CLINIC_TZ = "Asia/Karachi";

const timeFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: CLINIC_TZ,
  hour: "numeric",
  minute: "2-digit",
  second: "2-digit",
  hour12: true,
});

const dateFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: CLINIC_TZ,
  weekday: "short",
  month: "short",
  day: "numeric",
});

function greetingFor(date: Date): string {
  const hour = Number(
    new Intl.DateTimeFormat("en-US", { timeZone: CLINIC_TZ, hour: "numeric", hour12: false }).format(date),
  );
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

/** Ticking clock isolated in its own component so only it re-renders each second. */
function LiveClock() {
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    setNow(new Date());
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  return (
    <div className={styles.clockPill} role="status" aria-live="off">
      <span className={styles.clockDot} aria-hidden="true" />
      <span className={`${styles.clockTime} tabular`}>{now ? timeFormatter.format(now) : "--:-- --"}</span>
      <span className={styles.clockTz}>PKT</span>
      <span className={styles.clockSep} aria-hidden="true" />
      <span className={styles.clockDate}>{now ? dateFormatter.format(now) : ""}</span>
    </div>
  );
}

export function DashboardHeader() {
  const user = useAuthStore((state) => state.user);
  const [greeting, setGreeting] = useState("Welcome");

  useEffect(() => {
    setGreeting(greetingFor(new Date()));
  }, []);

  const firstName = user?.full_name?.trim().split(/\s+/)[0] ?? "there";

  return (
    <header className={styles.pageHeader}>
      <p className={styles.greeting}>
        {greeting}, {firstName}
      </p>
      <div className={styles.titleRow}>
        <h1 className={styles.pageTitle}>Operations Dashboard</h1>
        <LiveClock />
      </div>
    </header>
  );
}
