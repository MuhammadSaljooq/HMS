"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  LogOut,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
  Search,
  Settings,
  X,
} from "lucide-react";

import { visibleDashboardNav, type DashboardNavItem } from "@/lib/navigation";
import { USER_ROLE_LABELS } from "@/lib/roles";
import { useAuthStore } from "@/store/authStore";
import type { User } from "@/types";

type MockupThemeStyles = Readonly<Record<string, string>>;

const SIDEBAR_STORAGE_KEY = "hms:sidebar-collapsed";

// Section groupings, mapped by href. Order within a section follows this list.
const NAV_SECTIONS: Array<{ label: string | null; hrefs: string[] }> = [
  { label: null, hrefs: ["/dashboard"] },
  {
    label: "Clinical",
    hrefs: [
      "/dashboard/patients",
      "/dashboard/appointments",
      "/dashboard/records",
      "/dashboard/transcriber",
    ],
  },
  { label: "Billing", hrefs: ["/dashboard/billing"] },
  {
    label: "Admin",
    hrefs: [
      "/dashboard/doctors-staff",
      "/dashboard/room",
      "/dashboard/medicine",
      "/dashboard/analitik",
      "/dashboard/inventory",
      "/dashboard/settings",
    ],
  },
];

type NavGroup = { label: string | null; items: DashboardNavItem[] };

function getInitials(name: string | null | undefined): string {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function isNavItemActive(href: string, pathname: string): boolean {
  return href === "/dashboard" ? pathname === "/dashboard" : pathname.startsWith(href);
}

export function MockupDashboardShell({
  styles,
  user,
  children,
}: {
  styles: MockupThemeStyles;
  user: User | null;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [search, setSearch] = useState("");

  const visibleNav = useMemo(() => visibleDashboardNav(user?.role), [user?.role]);

  // Build role-filtered, grouped nav. Memoized on visibleNav so it is stable
  // across renders that don't change the user's role (prevents effect churn).
  const groups = useMemo<NavGroup[]>(() => {
    const byHref = new Map(visibleNav.map((item) => [item.href, item]));
    return NAV_SECTIONS.map((section) => ({
      label: section.label,
      items: section.hrefs
        .map((href) => byHref.get(href))
        .filter((item): item is DashboardNavItem => Boolean(item)),
    })).filter((group) => group.items.length > 0);
  }, [visibleNav]);

  // Apply the live search filter (case-insensitive label match) per group.
  const query = search.trim().toLowerCase();
  const filtering = query.length > 0;
  const filteredGroups = useMemo<NavGroup[]>(() => {
    if (!query) return groups;
    return groups
      .map((group) => ({
        label: group.label,
        items: group.items.filter((item) => item.label.toLowerCase().includes(query)),
      }))
      .filter((group) => group.items.length > 0);
  }, [groups, query]);

  // Flat list of the currently-rendered items — the indicator measures against
  // this. Memoized so its identity only changes when the visible items change.
  const flatItems = useMemo(
    () => filteredGroups.flatMap((group) => group.items),
    [filteredGroups],
  );

  const isAdmin = user?.role === "admin";

  // Refs for the shared moving active indicator.
  const listRef = useRef<HTMLUListElement | null>(null);
  const itemRefs = useRef<Record<string, HTMLLIElement | null>>({});
  const drawerRef = useRef<HTMLElement | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const [indicator, setIndicator] = useState<{ top: number; height: number; visible: boolean }>({
    top: 0,
    height: 0,
    visible: false,
  });

  // Restore persisted collapse preference on mount (avoids SSR hydration mismatch).
  useEffect(() => {
    let stored: string | null = null;
    try {
      stored = window.localStorage.getItem(SIDEBAR_STORAGE_KEY);
    } catch {
      stored = null;
    }
    if (stored === "true") {
      setCollapsed(true);
    } else if (stored === "false") {
      setCollapsed(false);
    } else if (window.innerWidth >= 768 && window.innerWidth < 1280) {
      // Auto-collapse on tablet widths when no explicit preference exists.
      setCollapsed(true);
    }
  }, []);

  const toggleCollapsed = useCallback(() => {
    setCollapsed((prev) => {
      const next = !prev;
      try {
        window.localStorage.setItem(SIDEBAR_STORAGE_KEY, String(next));
      } catch {
        /* ignore persistence errors */
      }
      return next;
    });
  }, []);

  // Expand (if collapsed) and move focus into the search input.
  const focusSearch = useCallback(() => {
    setCollapsed((prev) => {
      if (prev) {
        try {
          window.localStorage.setItem(SIDEBAR_STORAGE_KEY, "false");
        } catch {
          /* ignore persistence errors */
        }
      }
      return false;
    });
    // Defer focus so the input is mounted/visible after the expand.
    requestAnimationFrame(() => searchInputRef.current?.focus());
  }, []);

  // Keyboard shortcuts: Cmd/Ctrl+B toggles the sidebar, Cmd/Ctrl+K focuses search.
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "b") {
        event.preventDefault();
        toggleCollapsed();
      }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        focusSearch();
      }
      if (event.key === "Escape") {
        setMobileOpen(false);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [toggleCollapsed, focusSearch]);

  // Close the mobile drawer on route change.
  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  // Move focus into the drawer when it opens on mobile.
  useEffect(() => {
    if (mobileOpen && drawerRef.current) {
      const focusable = drawerRef.current.querySelector<HTMLElement>(
        'a[href], button:not([disabled]), input',
      );
      focusable?.focus();
    }
  }, [mobileOpen]);

  // Measure & position the shared active indicator. Depends on the visible flat
  // list (changes with search + role) and collapse state so it repositions when
  // items are filtered; hides when the active item is filtered out.
  useLayoutEffect(() => {
    function updateIndicator() {
      const activeItem = flatItems.find((item) => isNavItemActive(item.href, pathname));
      const node = activeItem ? itemRefs.current[activeItem.href] : null;
      if (!node) {
        setIndicator((prev) => (prev.visible ? { ...prev, visible: false } : prev));
        return;
      }
      const top = node.offsetTop;
      const height = node.offsetHeight;
      setIndicator((prev) =>
        prev.visible && prev.top === top && prev.height === height
          ? prev
          : { top, height, visible: true },
      );
    }
    updateIndicator();
    window.addEventListener("resize", updateIndicator);
    return () => window.removeEventListener("resize", updateIndicator);
  }, [pathname, collapsed, flatItems]);

  async function handleLogout() {
    if (isLoggingOut) return;
    setIsLoggingOut(true);
    try {
      await useAuthStore.getState().logout();
      router.replace("/login");
    } finally {
      setIsLoggingOut(false);
    }
  }

  const appName = "National Eye Care";
  const userName = user?.full_name ?? "Loading session";
  const userEmail = user?.email ?? (user ? USER_ROLE_LABELS[user.role] : "");
  // When collapsed on desktop, the logo itself becomes the expand control.
  const showCollapsedHeader = collapsed && !mobileOpen;

  const logo = (
    <svg
      className={styles.sbLogoIcon}
      viewBox="0 0 36 36"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <circle cx="13" cy="13" r="9" fill="#4CAF50" opacity="0.85" />
      <circle cx="23" cy="13" r="9" fill="#2196F3" opacity="0.85" />
      <circle cx="18" cy="23" r="9" fill="#FF5722" opacity="0.85" />
    </svg>
  );

  const noResults = filtering && flatItems.length === 0;

  return (
    <div
      className={styles.page}
      data-collapsed={collapsed ? "true" : "false"}
    >
      {/* Mobile top bar */}
      <div className={styles.mobileBar}>
        <span className={styles.mobileLogo}>{logo}</span>
        <button
          type="button"
          className={styles.mobileMenuBtn}
          aria-label="Open menu"
          onClick={() => setMobileOpen(true)}
        >
          <Menu size={20} strokeWidth={1.75} aria-hidden="true" />
        </button>
      </div>

      {/* Scrim for mobile drawer */}
      <div
        className={`${styles.sbScrim} ${mobileOpen ? styles.sbScrimOpen : ""}`}
        onClick={() => setMobileOpen(false)}
        aria-hidden="true"
      />

      {/* Floating sidebar */}
      <aside
        ref={drawerRef}
        className={`${styles.sidebar} ${mobileOpen ? styles.sidebarMobileOpen : ""}`}
      >
        <div className={styles.sbHeader}>
          {showCollapsedHeader ? (
            <button
              type="button"
              className={styles.sbLogoBtn}
              onClick={toggleCollapsed}
              aria-expanded={false}
              aria-label="Expand sidebar"
              title="Expand sidebar"
            >
              <span className={styles.sbLogoMark}>{logo}</span>
              <PanelLeftOpen
                className={styles.sbLogoExpand}
                size={18}
                strokeWidth={1.75}
                aria-hidden="true"
              />
            </button>
          ) : (
            <>
              <span className={styles.sbLogo}>{logo}</span>
              <span className={styles.sbWordmark}>{appName}</span>
              <button
                type="button"
                className={styles.sbToggle}
                onClick={toggleCollapsed}
                aria-expanded={true}
                aria-label="Collapse sidebar"
                title="Collapse sidebar"
              >
                <PanelLeftClose size={18} strokeWidth={1.75} aria-hidden="true" />
              </button>
              <button
                type="button"
                className={styles.sbClose}
                onClick={() => setMobileOpen(false)}
                aria-label="Close menu"
              >
                <X size={18} strokeWidth={1.75} aria-hidden="true" />
              </button>
            </>
          )}
        </div>

        {/* Search: full box when expanded, single icon button when collapsed. */}
        <div className={styles.sbSearch}>
          {showCollapsedHeader ? (
            <button
              type="button"
              className={styles.sbSearchIconBtn}
              onClick={focusSearch}
              aria-label="Search"
              title="Search (⌘K)"
            >
              <Search size={18} strokeWidth={1.75} aria-hidden="true" />
            </button>
          ) : (
            <div className={styles.sbSearchBox}>
              <Search className={styles.sbSearchIcon} size={16} strokeWidth={1.75} aria-hidden="true" />
              <input
                ref={searchInputRef}
                type="text"
                className={styles.sbSearchInput}
                placeholder="Search…"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                aria-label="Search navigation"
              />
              <kbd className={styles.sbSearchKbd} aria-hidden="true">⌘K</kbd>
            </div>
          )}
        </div>

        <nav className={styles.sbNav} aria-label="Primary">
          <ul className={styles.sbList} ref={listRef}>
            <li
              className={styles.sbIndicator}
              aria-hidden="true"
              style={{
                transform: `translateY(${indicator.top}px)`,
                height: `${indicator.height}px`,
                opacity: indicator.visible ? 1 : 0,
              }}
            />
            {filteredGroups.map((group) => (
              <li key={group.label ?? "__top"} className={styles.sbGroup}>
                {group.label && !filtering ? (
                  <span className={styles.sbGroupLabel}>{group.label}</span>
                ) : null}
                <ul className={styles.sbGroupList}>
                  {group.items.map((item) => {
                    const active = isNavItemActive(item.href, pathname);
                    const Icon = item.icon;
                    return (
                      <li
                        key={item.href}
                        ref={(node) => {
                          itemRefs.current[item.href] = node;
                        }}
                      >
                        <Link
                          className={`${styles.sbItem} ${active ? styles.sbItemActive : ""}`}
                          href={item.href}
                          title={item.label}
                          aria-label={item.label}
                          aria-current={active ? "page" : undefined}
                        >
                          <Icon className={styles.sbIcon} size={20} strokeWidth={1.75} aria-hidden="true" />
                          <span className={styles.sbLabel}>{item.label}</span>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </li>
            ))}
            {noResults ? (
              <li className={styles.sbNoResults}>No matches</li>
            ) : null}
          </ul>
        </nav>

        <div className={styles.sbFooter}>
          <div className={styles.sbUserChip}>
            <span className={styles.sbUserAvatar} aria-hidden="true">
              {getInitials(user?.full_name)}
            </span>
            <span className={styles.sbUserText}>
              <span className={styles.sbUserName}>{userName}</span>
              <span className={styles.sbUserEmail}>{userEmail}</span>
            </span>
            <span className={styles.sbUserActions}>
              {isAdmin ? (
                <Link
                  className={styles.sbIconBtn}
                  href="/dashboard/settings"
                  aria-label="Settings"
                  title="Settings"
                >
                  <Settings size={18} strokeWidth={1.75} aria-hidden="true" />
                </Link>
              ) : null}
              <button
                type="button"
                className={styles.sbIconBtn}
                onClick={handleLogout}
                disabled={isLoggingOut}
                aria-label={isLoggingOut ? "Logging out" : "Logout"}
                title="Logout"
              >
                <LogOut size={18} strokeWidth={1.75} aria-hidden="true" />
              </button>
            </span>
          </div>

          {/* Collapsed rail: a standalone logout icon under the centered avatar. */}
          <button
            type="button"
            className={styles.sbLogoutRail}
            onClick={handleLogout}
            disabled={isLoggingOut}
            aria-label={isLoggingOut ? "Logging out" : "Logout"}
            title="Logout"
          >
            <LogOut size={18} strokeWidth={1.75} aria-hidden="true" />
          </button>
        </div>
      </aside>

      <div className={styles.layout}>{children}</div>
    </div>
  );
}
