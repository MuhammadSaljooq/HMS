"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { visibleDashboardNav } from "@/lib/navigation";
import { useAuthStore } from "@/store/authStore";
import { cn } from "@/lib/utils";

export function MobileNav() {
  const pathname = usePathname();
  const role = useAuthStore((s) => s.user?.role);
  const visible = visibleDashboardNav(role);

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-40 flex border-t border-border bg-card/95 backdrop-blur md:hidden safe-area-pb"
      aria-label="Mobile navigation"
    >
      {visible.map(({ href, shortLabel, label, icon: Icon }) => {
        const active =
          href === "/dashboard"
            ? pathname === "/dashboard" || pathname === "/dashboard/"
            : pathname.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            className={cn(
              "flex flex-1 flex-col items-center justify-center gap-0.5 py-2 text-[10px] font-medium",
              active ? "text-primary" : "text-muted-foreground",
            )}
          >
            <Icon className="h-5 w-5" />
            <span>{shortLabel ?? label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
