"use client";

import { RoleGuard } from "@/components/layout/RoleGuard";
import { SETTINGS_ROLES } from "@/lib/rbac";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function SettingsPage() {
  return (
    <RoleGuard roles={SETTINGS_ROLES}>
      <Card className="max-w-2xl border-border">
        <CardHeader>
          <CardTitle>Settings</CardTitle>
          <CardDescription>Profile and hospital preferences.</CardDescription>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">Placeholder page.</CardContent>
      </Card>
    </RoleGuard>
  );
}
