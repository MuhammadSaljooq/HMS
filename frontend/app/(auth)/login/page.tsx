"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { z } from "zod";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { postLoginPath } from "@/lib/auth-policy";
import { getApiErrorMessage } from "@/lib/api-errors";
import { useAuthStore } from "@/store/authStore";
import type { UserRole } from "@/types";

const schema = z.object({
  email: z.string().email("Enter a valid email"),
  password: z.string().min(1, "Password is required"),
});

type FormValues = z.infer<typeof schema>;

const roleBadge: Record<UserRole, string> = {
  admin: "Administrator",
  doctor: "Doctor",
  nurse: "Nurse",
  receptionist: "Receptionist",
};

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const from = searchParams.get("from");
  const { login, user, hydrateFromServer } = useAuthStore();
  const [error, setError] = useState<string | null>(null);
  const [justLoggedIn, setJustLoggedIn] = useState(false);
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
      setJustLoggedIn(true);
      const u = useAuthStore.getState().user;
      if (u) {
        router.replace(postLoginPath(u.role, from));
      }
    } catch (e: unknown) {
      setError(getApiErrorMessage(e, "Login failed"));
    }
  }

  return (
    <Card className="w-full max-w-md border-border shadow-lg">
      <CardHeader className="space-y-1 text-center">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-primary/10 text-primary">
          <span className="text-2xl font-bold">+</span>
        </div>
        <CardTitle className="font-sans text-2xl tracking-tight">Riverside Hospital</CardTitle>
        <CardDescription>Sign in to the Hospital Management System</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Controller
              name="email"
              control={form.control}
              render={({ field }) => (
                <Input id="email" type="email" autoComplete="email" inputMode="email" {...field} />
              )}
            />
            {form.formState.errors.email && (
              <p className="text-sm text-destructive">{form.formState.errors.email.message}</p>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <Controller
              name="password"
              control={form.control}
              render={({ field }) => (
                <Input id="password" type="password" autoComplete="current-password" {...field} />
              )}
            />
            {form.formState.errors.password && (
              <p className="text-sm text-destructive">{form.formState.errors.password.message}</p>
            )}
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button type="submit" className="w-full bg-primary text-primary-foreground hover:bg-primary/90">
            {form.formState.isSubmitting ? "Signing in…" : "Sign in"}
          </Button>
        </form>

        {justLoggedIn && user && (
          <div className="mt-6 rounded-lg border border-border bg-muted/40 p-4 text-center">
            <p className="text-sm text-muted-foreground">Signed in as</p>
            <p className="mt-1 font-medium">{user.full_name}</p>
            <Badge className="mt-2 bg-primary/15 text-primary hover:bg-primary/20">{roleBadge[user.role]}</Badge>
          </div>
        )}

        <p className="mt-6 text-center text-xs text-muted-foreground">
          Trouble signing in? Contact IT or your ward administrator.
        </p>
        <p className="mt-2 text-center text-xs">
          <Link href="/dashboard" className="text-primary hover:underline">
            Back to dashboard
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-[200px] items-center justify-center text-sm text-muted-foreground">Loading…</div>
      }
    >
      <LoginForm />
    </Suspense>
  );
}
