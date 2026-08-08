"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { DashboardChrome } from "@/components/layout/DashboardChrome";
import { useAuthStore } from "@/store/authStore";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { user, hydrateFromServer } = useAuthStore();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      await useAuthStore.persist.rehydrate();
      await hydrateFromServer();
      if (!cancelled) setReady(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [hydrateFromServer]);

  useEffect(() => {
    if (!ready) return;
    if (!user) {
      router.replace("/login");
    }
  }, [ready, router, user]);

  if (!ready || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background text-muted-foreground">
        {ready ? "Redirecting to login…" : "Loading…"}
      </div>
    );
  }

  return <DashboardChrome>{children}</DashboardChrome>;
}
