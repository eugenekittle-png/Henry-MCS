import { NextRequest } from "next/server";
import { getSession } from "@/lib/auth";
import { getClientByNumber, dbCreateMatter } from "@/lib/db";
import { parseCSV } from "@/lib/csv";
import { logAction, getClientIp } from "@/lib/audit";

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session || session.role !== "admin") {
    return Response.json({ error: "Unauthorized" }, { status: 403 });
  }
  const ip = getClientIp(req);

  const text = await req.text();
  const rows = parseCSV(text);

  if (!rows.length) {
    return Response.json({ error: "No data rows found in CSV" }, { status: 400 });
  }

  let imported = 0;
  let skipped = 0;
  const errors: { row: number; reason: string }[] = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const client_number = row["client_number"]?.trim();
    const matter_number = row["matter_number"]?.trim();
    const description = row["description"]?.trim();

    if (!client_number || !matter_number || !description) {
      errors.push({ row: i + 2, reason: "Missing client_number, matter_number, or description" });
      continue;
    }

    const client = await getClientByNumber(client_number);
    if (!client) {
      errors.push({ row: i + 2, reason: `Client "${client_number}" not found` });
      continue;
    }

    try {
      await dbCreateMatter(client.id, matter_number, description);
      imported++;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes("UNIQUE") || msg.includes("unique")) {
        skipped++;
      } else {
        errors.push({ row: i + 2, reason: msg });
      }
    }
  }

  await logAction({
    username: session.email ?? null,
    action: "Matter-Import",
    details: { imported, skipped, errors: errors.length },
    success: true,
    ipAddress: ip,
  });

  return Response.json({ imported, skipped, errors });
}
