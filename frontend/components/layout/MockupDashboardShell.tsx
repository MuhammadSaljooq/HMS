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
  X,
} from "lucide-react";

import { visibleDashboardNav } from "@/lib/navigation";
import { USER_ROLE_LABELS } from "@/lib/roles";
import { useAuthStore } from "@/store/authStore";
import type { User } from "@/types";

type MockupThemeStyles = Readonly<Record<string, string>>;

const SIDEBAR_STORAGE_KEY = "hms:sidebar-collapsed";

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

  const visibleNav = useMemo(() => visibleDashboardNav(user?.role), [user?.role]);
  const settingsItem = useMemo(
    () => visibleNav.find((item) => item.href === "/dashboard/settings"),
    [visibleNav],
  );
  const primaryNav = useMemo(
    () => visibleNav.filter((item) => item.href !== "/dashboard/settings"),
    [visibleNav],
  );

  // Refs for the shared moving active indicator.
  const listRef = useRef<HTMLUListElement | null>(null);
  const itemRefs = useRef<Record<string, HTMLLIElement | null>>({});
  const drawerRef = useRef<HTMLElement | null>(null);
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

  // Keyboard shortcut: Cmd/Ctrl + B toggles the sidebar.
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "b") {
        event.preventDefault();
        toggleCollapsed();
      }
      if (event.key === "Escape") {
        setMobileOpen(false);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [toggleCollapsed]);

  // Close the mobile drawer on route change.
  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  // Move focus into the drawer when it opens on mobile.
  useEffect(() => {
    if (mobileOpen && drawerRef.current) {
      const focusable = drawerRef.current.querySelector<HTMLElement>(
        'a[href], button:not([disabled])',
      );
      focusable?.focus();
    }
  }, [mobileOpen]);

  // Measure & position the shared active indicator.
  useLayoutEffect(() => {
    function updateIndicator() {
      const activeItem = primaryNav.find((item) => isNavItemActive(item.href, pathname));
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
  }, [pathname, collapsed, primaryNav]);

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
  const roleLabel = user ? USER_ROLE_LABELS[user.role] : "Staff";
  const userName = user?.full_name ?? "Loading session";

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
          <span className={styles.sbLogo}>{logo}</span>
          <span className={styles.sbWordmark}>{appName}</span>
          <button
            type="button"
            className={styles.sbToggle}
            onClick={toggleCollapsed}
            aria-expanded={!collapsed}
            aria-label="Toggle sidebar"
          >
            {collapsed ? (
              <PanelLeftOpen size={18} strokeWidth={1.75} aria-hidden="true" />
            ) : (
              <PanelLeftClose size={18} strokeWidth={1.75} aria-hidden="true" />
            )}
          </button>
          <button
            type="button"
            className={styles.sbClose}
            onClick={() => setMobileOpen(false)}
            aria-label="Close menu"
          >
            <X size={18} strokeWidth={1.75} aria-hidden="true" />
          </button>
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
            {primaryNav.map((item) => {
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
        </nav>

        <div className={styles.sbFooter}>
          {settingsItem ? (
            <Link
              className={`${styles.sbItem} ${
                isNavItemActive(settingsItem.href, pathname) ? styles.sbItemActive : ""
              }`}
              href={settingsItem.href}
              title={settingsItem.label}
              aria-label={settingsItem.label}
              aria-current={isNavItemActive(settingsItem.href, pathname) ? "page" : undefined}
            >
              <settingsItem.icon
                className={styles.sbIcon}
                size={20}
                strokeWidth={1.75}
                aria-hidden="true"
              />
              <span className={styles.sbLabel}>{settingsItem.label}</span>
            </Link>
          ) : null}

          <div className={styles.sbUserChip}>
            <span className={styles.sbAvatar} aria-hidden="true">
              {getInitials(user?.full_name)}
            </span>
            <span className={styles.sbUserText}>
              <span className={styles.sbUserName}>{userName}</span>
              <span className={styles.sbUserRole}>{roleLabel}</span>
            </span>
          </div>

          <button
            type="button"
            className={styles.sbLogout}
            onClick={handleLogout}
            disabled={isLoggingOut}
            title="Logout"
            aria-label="Logout"
          >
            <LogOut className={styles.sbIcon} size={20} strokeWidth={1.75} aria-hidden="true" />
            <span className={styles.sbLabel}>{isLoggingOut ? "Logging out…" : "Logout"}</span>
          </button>
        </div>
      </aside>

      <div className={styles.layout}>{children}</div>
    </div>
  );
}
