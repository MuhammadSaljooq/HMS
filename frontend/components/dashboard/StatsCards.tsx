"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import type { DashboardStats } from "@/types";

function StatCard({ title, value, hint }: { title: string; value: string; hint: string }) {
  return (
    <Card className="border-border">
      <CardHeader className="pb-2">
        <CardDescription>{title}</CardDescription>
        <CardTitle className="font-mono text-3xl tabular-nums">{value}</CardTitle>
      </CardHeader>
      <CardContent className="text-xs text-muted-foreground">
        <Separator className="mb-2" />
        {hint}
      </CardContent>
    </Card>
  );
}

type StatsCardsProps = {
  stats: DashboardStats | null;
  loading: boolean;
};

export function StatsCards({ stats, loading }: StatsCardsProps) {
  const v = (n: number | undefined) => (loading ? "—" : String(n ?? "—"));

  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <StatCard
        title="Patients registered today"
        value={v(stats?.patients_registered_today)}
        hint={`${stats?.total_patients ?? "—"} total patients in the system`}
      />
      <StatCard
        title="Appointments today"
        value={v(stats?.appointments_today)}
        hint="Scheduled visits for today (UTC midnight window)"
      />
      <StatCard
        title="Pending transcriptions"
        value={v(stats?.pending_transcriptions)}
        hint="AI jobs pending or processing"
      />
      <StatCard title="Active doctors" value={v(stats?.active_doctors)} hint="Staff with doctor role" />
    </div>
  );
}
