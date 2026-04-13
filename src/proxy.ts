import { NextRequest, NextResponse } from "next/server";
import { verifySessionToken } from "@/lib/auth";

const PUBLIC_PATHS = ["/", "/login", "/api/auth/login", "/api/auth/me", "/word-addin", "/api/addin", "/api/chat", "/api/edgar"];
const CHANGE_PW_PATHS = ["/change-password", "/api/auth/change-password", "/api/auth/logout"];
const ADMIN_PATHS = ["/clients", "/matters", "/users", "/audit", "/usage", "/api/users", "/api/audit", "/api/usage", "/playbooks"];

const PENDING_2FA_COOKIE = "henry_pending_2fa";
const PENDING_SETUP_COOKIE = "henry_pending_setup";

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Allow static assets and Next.js internals
  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon") ||
    pathname.endsWith(".ico")
  ) {
    return NextResponse.next();
  }

  // Allow all auth API routes and login pages to pass through
  if (
    pathname.startsWith("/api/auth") ||
    pathname.startsWith("/login")
  ) {
    return NextResponse.next();
  }

  const hasPending2fa = !!request.cookies.get(PENDING_2FA_COOKIE);
  const hasPendingSetup = !!request.cookies.get(PENDING_SETUP_COOKIE);

  // Awaiting 2FA verification — redirect to verify page
  if (hasPending2fa && pathname !== "/login/verify") {
    return NextResponse.redirect(new URL("/login/verify", request.url));
  }

  // Awaiting forced 2FA setup — redirect to security page
  if (hasPendingSetup && pathname !== "/account/security") {
    return NextResponse.redirect(new URL("/account/security?setup=required", request.url));
  }

  // Allow remaining public paths
  if (PUBLIC_PATHS.some(p => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  const token = request.cookies.get("henry_session")?.value;
  const session = token ? await verifySessionToken(token) : null;

  if (!session) {
    const loginUrl = new URL("/login", request.url);
    return NextResponse.redirect(loginUrl);
  }

  // Force password change — only allow change-password page and logout
  if (session.mustChangePassword) {
    if (CHANGE_PW_PATHS.some(p => pathname.startsWith(p))) {
      return NextResponse.next();
    }
    return NextResponse.redirect(new URL("/change-password", request.url));
  }

  // Admin-only routes
  if (ADMIN_PATHS.some(p => pathname.startsWith(p)) && session.role !== "admin") {
    return NextResponse.redirect(new URL("/", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|images/).*)"],
};
