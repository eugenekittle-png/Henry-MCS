import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import {
  ND_CLIENT_ID,
  ND_CLIENT_SECRET,
  ND_TOKEN_URL,
  ND_RETURN_COOKIE,
  getRedirectUri,
} from "@/lib/netdocuments/config";
import { setTokensCookie } from "@/lib/netdocuments/tokens";
import type { NetDocTokens } from "@/lib/netdocuments/types";
console.log("HERE");
export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");

  const cookieStore = await cookies();
  const returnUrl = cookieStore.get(ND_RETURN_COOKIE)?.value || "/summary";

  cookieStore.delete(ND_RETURN_COOKIE);
console.log("THERE");
  if (!code) {
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost";
    return NextResponse.redirect(`${appUrl}${returnUrl}?nd_error=missing_code`);
  }

  try {
    const body = new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: getRedirectUri(),
    });
    const credentials = Buffer.from(`${ND_CLIENT_ID}:${ND_CLIENT_SECRET}`).toString("base64");
console.log("Token request body:", body.toString());
    const res = await fetch(ND_TOKEN_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "Authorization": `Basic ${credentials}`,
      },
      body: body.toString(),
    });

    if (!res.ok) {
      const text = await res.text();
      console.error("NetDocuments token exchange failed:", res.status, text);
      const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost";
      const detail = encodeURIComponent(`${res.status}: ${text.slice(0, 500)}`);
      const codeParam = returnUrl.startsWith("/netdocuments-debug")
        ? `&nd_code=${encodeURIComponent(code)}`
        : "";
      return NextResponse.redirect(`${appUrl}${returnUrl}?nd_error=token_exchange&nd_detail=${detail}${codeParam}`);
    }

    const data = await res.json();
    const tokens: NetDocTokens = {
      access_token: data.access_token,
      refresh_token: data.refresh_token,
      expires_at: Date.now() + data.expires_in * 1000,
    };

    

    await setTokensCookie(tokens);

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost";
    const successUrl = returnUrl.startsWith("/netdocuments-debug")
      ? `${appUrl}${returnUrl}?success=1`
      : `${appUrl}${returnUrl}`;
    return NextResponse.redirect(successUrl);
  } catch (err) {
    console.error("NetDocuments OAuth callback error:", err);
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost";
    return NextResponse.redirect(`${appUrl}${returnUrl}?nd_error=server_error`);
  }
}
