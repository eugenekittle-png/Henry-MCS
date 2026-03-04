import { NextRequest, NextResponse } from "next/server";
import { getValidTokens } from "@/lib/netdocuments/tokens";
import { downloadDocument, getDocumentInfo } from "@/lib/netdocuments/api";

export async function GET(request: NextRequest) {
  const tokens = await getValidTokens();
  if (!tokens) {
    return NextResponse.json({ error: "Not connected" }, { status: 401 });
  }

  const id = request.nextUrl.searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "Missing id parameter" }, { status: 400 });
  }

  try {
    const [info, buffer] = await Promise.all([
      getDocumentInfo(tokens, id),
      downloadDocument(tokens, id),
    ]);

    const filename = info.extension
      ? `${info.name}.${info.extension}`
      : info.name;

    return new NextResponse(buffer, {
      headers: {
        "Content-Type": "application/octet-stream",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "X-ND-Filename": filename,
        "X-ND-Size": String(info.size),
      },
    });
  } catch (err) {
    console.error("Download failed:", err);
    return NextResponse.json({ error: "Download failed" }, { status: 500 });
  }
}
