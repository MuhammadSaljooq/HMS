"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CalendarDays, ClipboardList, LayoutDashboard, Mic, Settings, Users } from "lucide-react";

import { useAuthStore } from "@/store/authStore";
import { cn } from "@/lib/utils";
import type { UserRole } from "@/types";

type NavItem = {
  href: string;
  label: string;
  icon: typeof LayoutDashboard;
  roles?: UserRole[];
};

const nav: NavItem[] = [
  { href: "/dashboard", label: "Home", icon: LayoutDashboard },
  { href: "/dashboard/patients", label: "Patients", icon: Users },
  { href: "/dashboard/appointments", label: "Appts", icon: CalendarDays },
  { href: "/dashboard/transcriber", label: "Mic", icon: Mic, roles: ["doctor", "admin"] },
  { href: "/dashboard/records", label: "Records", icon: ClipboardList },
  { href: "/dashboard/settings", label: "More", icon: Settings, roles: ["admin"] },
];

function canSeeNavItem(role: UserRole | null | undefined, item: NavItem): boolean {
  if (!role) return false;
  if (role === "admin") return true;
  if (!item.roles) return true;
  return item.roles.includes(role);
}

export function MobileNav() {
  const pathname = usePathname();
  const role = useAuthStore((s) => s.user?.role);
  const visible = nav.filter((item) => canSeeNavItem(role, item));

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-40 flex border-t border-border bg-card/95 backdrop-blur md:hidden safe-area-pb"
      aria-label="Mobile navigation"
    >
      {visible.map(({ href, label, icon: Icon }) => {
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
            <span>{label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
