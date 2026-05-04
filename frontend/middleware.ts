import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { isDashboardRouteAllowed } from "@/lib/rbac";

const ACCESS_COOKIE = process.env.NEXT_PUBLIC_ACCESS_TOKEN_COOKIE_NAME ?? "access_token";
const REFRESH_COOKIE = process.env.NEXT_PUBLIC_REFRESH_TOKEN_COOKIE_NAME ?? "refresh_token";

type JwtPayload = {
  exp?: number;
  role?: string;
  type?: string;
};

function decodeJwtPayload(token: string): JwtPayload | null {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    let payload = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const pad = payload.length % 4;
    if (pad) payload += "=".repeat(4 - pad);
    const json = JSON.parse(atob(payload)) as JwtPayload;
    return json;
  } catch {
    return null;
  }
}

function isNotExpired(payload: JwtPayload | null): boolean {
  if (!payload?.exp) return false;
  return payload.exp * 1000 > Date.now();
}

function sessionFromRequest(request: NextRequest): { role: string } | null {
  const access = request.cookies.get(ACCESS_COOKIE)?.value;
  if (access) {
    const p = decodeJwtPayload(access);
    if (isNotExpired(p) && p?.role) return { role: p.role };
  }
  const refresh = request.cookies.get(REFRESH_COOKIE)?.value;
  if (refresh) {
    const p = decodeJwtPayload(refresh);
    if (isNotExpired(p) && p?.type === "refresh" && p.role) return { role: p.role };
  }
  return null;
}

function accessSessionFromRequest(request: NextRequest): { role: string } | null {
  const access = request.cookies.get(ACCESS_COOKIE)?.value;
  if (!access) return null;
  const p = decodeJwtPayload(access);
  if (isNotExpired(p) && p?.role) return { role: p.role };
  return null;
}

function forbidden(request: NextRequest) {
  return NextResponse.redirect(new URL("/dashboard/forbidden", request.url));
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const session = sessionFromRequest(request);

  if (pathname.startsWith("/login")) {
    // Always allow rendering login page to avoid auth redirect loops.
    return NextResponse.next();
  }

  if (pathname === "/") {
    const accessSession = accessSessionFromRequest(request);
    if (accessSession) {
      return NextResponse.redirect(new URL("/dashboard", request.url));
    }
    return NextResponse.redirect(new URL("/login", request.url));
  }

  if (pathname.startsWith("/dashboard")) {
    if (!session) {
      const login = new URL("/login", request.url);
      login.searchParams.set("from", pathname);
      return NextResponse.redirect(login);
    }

    if (!isDashboardRouteAllowed(pathname, session.role)) {
      return forbidden(request);
    }

    return NextResponse.next();
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/", "/login", "/dashboard/:path*"],
};
