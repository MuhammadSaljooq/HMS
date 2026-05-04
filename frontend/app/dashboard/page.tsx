"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { PatientCard } from "@/components/patients/PatientCard";
import { RecentActivity } from "@/components/dashboard/RecentActivity";
import { StatsCards } from "@/components/dashboard/StatsCards";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { api } from "@/lib/api";
import type { AppointmentListItem, DashboardStats, Patient } from "@/types";

function formatDay(iso: string) {
  return new Date(iso).toISOString().slice(0, 10);
}

export default function DashboardPage() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [appointments, setAppointments] = useState<AppointmentListItem[]>([]);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [statsRes, apptRes, patRes] = await Promise.all([
          api.get<DashboardStats>("/dashboard/stats"),
          api.get<AppointmentListItem[]>("/appointments"),
          api.get<{ items: Patient[] }>("/patients", { params: { limit: 500, skip: 0 } }),
        ]);
        if (cancelled) return;
        setStats(statsRes.data);
        setAppointments(apptRes.data.slice(0, 8));
        setPatients(patRes.data.items);
      } catch {
        if (!cancelled) {
          setStats(null);
          setAppointments([]);
          setPatients([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const trend = useMemo(() => {
    const days = 30;
    const end = new Date();
    const start = new Date();
    start.setDate(end.getDate() - (days - 1));
    const keys: string[] = [];
    for (let i = 0; i < days; i++) {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      keys.push(d.toISOString().slice(0, 10));
    }
    const counts = Object.fromEntries(keys.map((k) => [k, 0]));
    for (const p of patients) {
      const k = formatDay(p.created_at);
      if (k in counts) counts[k] += 1;
    }
    return keys.map((date) => ({ date: date.slice(5), count: counts[date] }));
  }, [patients]);

  const recentPatients = useMemo(() => {
    return [...patients].sort((a, b) => (a.created_at < b.created_at ? 1 : -1)).slice(0, 6);
  }, [patients]);

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="font-sans text-2xl font-semibold tracking-tight md:text-3xl">Dashboard</h1>
          <p className="text-sm text-muted-foreground">Overview of hospital activity and quick actions.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild className="bg-primary text-primary-foreground hover:bg-primary/90">
            <Link href="/dashboard/patients/new">New patient</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/dashboard/appointments">New appointment</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/dashboard/transcriber">Open transcriber</Link>
          </Button>
        </div>
      </div>

      <StatsCards stats={stats} loading={loading} />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {recentPatients.map((p) => (
          <PatientCard key={p.id} patient={p} />
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-5">
        <Card className="border-border lg:col-span-3">
          <CardHeader>
            <CardTitle>Patient registrations</CardTitle>
            <CardDescription>New patients per day (last 30 days)</CardDescription>
          </CardHeader>
          <CardContent className="h-64 pl-0">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={trend} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="fillReg" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.35} />
                    <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                <YAxis allowDecimals={false} width={32} tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                <Tooltip
                  contentStyle={{
                    background: "hsl(var(--card))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: "8px",
                  }}
                />
                <Area type="monotone" dataKey="count" stroke="hsl(var(--primary))" fill="url(#fillReg)" />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <RecentActivity appointments={appointments} loading={loading} />
      </div>
    </div>
  );
}
