"use client";

import { useEffect } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex min-h-[50vh] items-center justify-center">
      <Card className="max-w-xl border-destructive/20">
        <CardHeader>
          <CardTitle>Dashboard temporarily unavailable</CardTitle>
          <CardDescription>
            We hit an unexpected issue while loading this section. Your data is safe.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex gap-2">
          <Button onClick={reset}>Retry</Button>
          <Button variant="outline" onClick={() => window.location.assign("/dashboard")}>
            Back to dashboard
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
