"use client";

import Link from "next/link";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { AppointmentListItem } from "@/types";

type RecentActivityProps = {
  appointments: AppointmentListItem[];
  loading: boolean;
};

export function RecentActivity({ appointments, loading }: RecentActivityProps) {
  return (
    <Card className="border-border lg:col-span-2">
      <CardHeader>
        <CardTitle>Recent appointments</CardTitle>
        <CardDescription>Latest scheduled visits — open a row for full detail</CardDescription>
      </CardHeader>
      <CardContent className="p-0">
        <ScrollArea className="h-64 pr-3">
          <ul className="divide-y divide-border">
            {appointments.length === 0 && !loading && (
              <li className="px-4 py-6 text-sm text-muted-foreground">No appointments loaded.</li>
            )}
            {appointments.map((a) => (
              <li key={a.id}>
                <Link
                  href={`/dashboard/appointments/${a.id}`}
                  className="flex flex-col gap-1 px-4 py-3 hover:bg-muted/40"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-medium text-foreground">{a.patient_full_name}</span>
                    <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] uppercase text-muted-foreground">
                      {a.status}
                    </span>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {new Date(a.scheduled_at).toLocaleString(undefined, {
                      dateStyle: "medium",
                      timeStyle: "short",
                    })}{" "}
                    · {a.doctor_full_name}
                  </p>
                  {a.chief_complaint && (
                    <p className="line-clamp-2 text-xs text-muted-foreground">{a.chief_complaint}</p>
                  )}
                </Link>
              </li>
            ))}
          </ul>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
