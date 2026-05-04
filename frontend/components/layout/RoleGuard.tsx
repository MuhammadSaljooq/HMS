"use client";

import type { ReactNode } from "react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuthStore } from "@/store/authStore";
import type { UserRole } from "@/types";

type RoleGuardProps = {
  roles: UserRole[];
  children: ReactNode;
};

export function RoleGuard({ roles, children }: RoleGuardProps) {
  const user = useAuthStore((s) => s.user);
  const role = user?.role;

  const allowed = role === "admin" || (role && roles.includes(role));

  if (!user) {
    return (
      <Card className="max-w-md border-border">
        <CardHeader>
          <CardTitle className="text-base">Checking access…</CardTitle>
          <CardDescription>Please wait while we verify your session.</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  if (!allowed) {
    return (
      <Card className="max-w-lg border-destructive/30">
        <CardHeader>
          <CardTitle className="text-destructive">403 — Forbidden</CardTitle>
          <CardDescription>
            This area is restricted to: {roles.join(", ")}. Your role is{" "}
            <span className="font-medium text-foreground">{role}</span>.
          </CardDescription>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          Use the sidebar to navigate to a section you are allowed to access.
        </CardContent>
      </Card>
    );
  }

  return <>{children}</>;
}
