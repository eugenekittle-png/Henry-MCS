import { NextRequest, NextResponse } from "next/server";
import {
  ND_CLIENT_ID,
  ND_CLIENT_SECRET,
  ND_TOKEN_URL,
  getRedirectUri,
} from "@/lib/netdocuments/config";

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const tk = request.nextUrl.searchParams.get("tk"); // token URL from callback

  if (!code) {
    return NextResponse.json({ error: "Missing code parameter" }, { status: 400 });
  }

  const tokenUrl = tk || ND_TOKEN_URL;
  const redirectUri = getRedirectUri();

  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: redirectUri,
  });

  const credentials = Buffer.from(`${ND_CLIENT_ID}:${ND_CLIENT_SECRET}`).toString("base64");

  const requestInfo = {
    url: tokenUrl,
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${credentials}`,
    },
    body: Object.fromEntries(body),
    note: tk ? `Using tk from callback (${tk})` : `Using default ND_TOKEN_URL (${ND_TOKEN_URL})`,
  };

  let responseStatus: number;
  let responseHeaders: Record<string, string> = {};
  let responseBody: unknown;

  try {
    const res = await fetch(tokenUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: `Basic ${credentials}`,
      },
      body: body.toString(),
    });

    responseStatus = res.status;
    res.headers.forEach((value, key) => {
      responseHeaders[key] = value;
    });

    const text = await res.text();
    try {
      responseBody = JSON.parse(text);
    } catch {
      responseBody = text;
    }
  } catch (err) {
    return NextResponse.json(
      { request: requestInfo, error: "Fetch failed", detail: String(err) },
      { status: 500 }
    );
  }

  return NextResponse.json({
    request: requestInfo,
    response: {
      status: responseStatus!,
      headers: responseHeaders,
      body: responseBody,
    },
  });
}
