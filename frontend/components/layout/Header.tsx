"use client";

import { Bell, Search } from "lucide-react";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { USER_ROLE_LABELS } from "@/lib/roles";
import type { User } from "@/types";

function initials(user: User) {
  return user.full_name
    .split(/\s+/)
    .map((p) => p[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

export function Header({ user }: { user: User }) {
  return (
    <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-border bg-card/90 px-4 backdrop-blur">
      <div className="relative max-w-md flex-1">
        <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          type="search"
          placeholder="Search patients, MRN, appointments…"
          className="pl-9"
          aria-label="Search"
        />
      </div>
      <button
        type="button"
        className="relative rounded-full p-2 text-muted-foreground hover:bg-muted hover:text-foreground"
        aria-label="Notifications"
      >
        <Bell className="h-5 w-5" />
        <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-primary" />
      </button>
      <div className="flex items-center gap-2">
        <Avatar className="h-9 w-9 border border-border">
          <AvatarFallback className="bg-primary/10 text-xs font-medium text-primary">
            {initials(user)}
          </AvatarFallback>
        </Avatar>
        <div className="hidden min-w-0 sm:block">
          <p className="truncate text-sm font-medium leading-none">{user.full_name}</p>
          <Badge variant="secondary" className="mt-1 text-[10px] font-normal">
            {USER_ROLE_LABELS[user.role]}
          </Badge>
        </div>
      </div>
    </header>
  );
}
