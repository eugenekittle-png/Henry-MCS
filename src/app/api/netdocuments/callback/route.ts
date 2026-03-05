import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import {
  ND_CLIENT_ID,
  ND_CLIENT_SECRET,
  ND_TOKEN_URL,
  ND_STATE_COOKIE,
  ND_RETURN_COOKIE,
  getRedirectUri,
} from "@/lib/netdocuments/config";
import { setTokensCookie } from "@/lib/netdocuments/tokens";
import type { NetDocTokens } from "@/lib/netdocuments/types";

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const state = request.nextUrl.searchParams.get("state");

  const cookieStore = await cookies();
  const savedState = cookieStore.get(ND_STATE_COOKIE)?.value;
  const returnUrl = cookieStore.get(ND_RETURN_COOKIE)?.value || "/summary";

  // Clean up state cookies
  cookieStore.delete(ND_STATE_COOKIE);
  cookieStore.delete(ND_RETURN_COOKIE);

  if (!code || !state || state !== savedState) {
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
    return NextResponse.redirect(`${appUrl}${returnUrl}?nd_error=invalid_state`);
  }

  try {
    const body = new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: getRedirectUri(),
    });

    const basicAuth = Buffer.from(`${ND_CLIENT_ID}:${ND_CLIENT_SECRET}`).toString("base64");

    const res = await fetch(ND_TOKEN_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: `Basic ${basicAuth}`,
      },
      body: body.toString(),
    });

    if (!res.ok) {
      const text = await res.text();
      console.error("NetDocuments token exchange failed:", res.status, text);
      const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
      const detail = encodeURIComponent(`${res.status}: ${text.slice(0, 200)}`);
      return NextResponse.redirect(`${appUrl}${returnUrl}?nd_error=token_exchange&nd_detail=${detail}`);
    }

    const data = await res.json();
    const tokens: NetDocTokens = {
      access_token: data.access_token,
      refresh_token: data.refresh_token,
      expires_at: Date.now() + data.expires_in * 1000,
    };

    await setTokensCookie(tokens);

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
    return NextResponse.redirect(`${appUrl}${returnUrl}`);
  } catch (err) {
    console.error("NetDocuments OAuth callback error:", err);
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
    return NextResponse.redirect(`${appUrl}${returnUrl}?nd_error=server_error`);
  }
}
