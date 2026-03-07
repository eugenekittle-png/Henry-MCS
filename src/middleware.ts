import { NextRequest, NextResponse } from "next/server";
import { verifySessionToken } from "@/lib/auth";

const PUBLIC_PATHS = ["/login", "/api/auth/login"];
const CHANGE_PW_PATHS = ["/change-password", "/api/auth/change-password", "/api/auth/logout"];
const ADMIN_PATHS = ["/clients", "/matters", "/users", "/api/clients", "/api/matters", "/api/users"];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Allow public paths, static assets, Next.js internals
  if (
    PUBLIC_PATHS.some(p => pathname.startsWith(p)) ||
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon") ||
    pathname.endsWith(".ico")
  ) {
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
    const changePwUrl = new URL("/change-password", request.url);
    return NextResponse.redirect(changePwUrl);
  }

  // Admin-only routes
  if (ADMIN_PATHS.some(p => pathname.startsWith(p)) && session.role !== "admin") {
    const homeUrl = new URL("/", request.url);
    return NextResponse.redirect(homeUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
