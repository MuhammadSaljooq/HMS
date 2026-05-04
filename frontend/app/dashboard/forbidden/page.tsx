import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function ForbiddenPage() {
  return (
    <Card className="mx-auto max-w-lg border-destructive/30">
      <CardHeader>
        <CardTitle className="text-destructive">Access denied</CardTitle>
        <CardDescription>
          You do not have permission to open this page. If you believe this is a mistake, contact your administrator.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Button asChild variant="outline">
          <Link href="/dashboard">Return to dashboard</Link>
        </Button>
      </CardContent>
    </Card>
  );
}
