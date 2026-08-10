"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Activity, ChevronLeft, ChevronRight } from "lucide-react";

import { Button } from "@/components/ui/button";
import { visibleDashboardNav } from "@/lib/navigation";
import { useAuthStore } from "@/store/authStore";
import { cn } from "@/lib/utils";

export function Sidebar({
  collapsed,
  onToggle,
}: {
  collapsed: boolean;
  onToggle: () => void;
}) {
  const pathname = usePathname();
  const role = useAuthStore((s) => s.user?.role);

  const visible = visibleDashboardNav(role);

  return (
    <aside
      className={cn(
        "hidden md:flex border-r border-border bg-card flex-col transition-[width] duration-200 ease-out",
        collapsed ? "w-[72px]" : "w-56",
      )}
    >
      <div className="flex h-14 items-center justify-between gap-2 border-b border-border px-3">
        {!collapsed && (
          <Link href="/dashboard" className="flex items-center gap-2 font-semibold text-primary truncate">
            <Activity className="h-6 w-6 shrink-0" />
            <span className="truncate">National Eye Care Hospital</span>
          </Link>
        )}
        {collapsed && (
          <Link href="/dashboard" className="mx-auto text-primary" aria-label="Home">
            <Activity className="h-7 w-7" />
          </Link>
        )}
      </div>
      <nav className="flex-1 space-y-1 p-2">
        {visible.map(({ href, label, icon: Icon }) => {
          const active =
            href === "/dashboard" ? pathname === "/dashboard" || pathname === "/dashboard/" : pathname.startsWith(href);
          return (
            <Link key={href} href={href}>
              <span
                className={cn(
                  "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                  active
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground",
                  collapsed && "justify-center px-0",
                )}
                title={collapsed ? label : undefined}
              >
                <Icon className="h-5 w-5 shrink-0" />
                {!collapsed && <span>{label}</span>}
              </span>
            </Link>
          );
        })}
      </nav>
      <div className="border-t border-border p-2">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="w-full justify-center gap-0"
          onClick={onToggle}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
        </Button>
      </div>
    </aside>
  );
}
