import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { cookies } from "next/headers";
import {
  ND_CLIENT_ID,
  ND_AUTH_URL,
  ND_STATE_COOKIE,
  ND_RETURN_COOKIE,
  getRedirectUri,
} from "@/lib/netdocuments/config";

export async function GET(request: NextRequest) {
  const returnUrl = request.nextUrl.searchParams.get("returnUrl") || "/summary";
  const state = randomBytes(32).toString("hex");

  const cookieStore = await cookies();
  cookieStore.set(ND_STATE_COOKIE, state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 600, // 10 minutes
    path: "/",
  });
  cookieStore.set(ND_RETURN_COOKIE, returnUrl, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 600,
    path: "/",
  });

  const params = new URLSearchParams({
    client_id: ND_CLIENT_ID,
    scope: "read",
    response_type: "code",
    redirect_uri: getRedirectUri(),
  });
console.log("Auth",params);
  return NextResponse.redirect(`${ND_AUTH_URL}?${params}`);
}
