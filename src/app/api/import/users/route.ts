import { NextRequest } from "next/server";
import { getSession } from "@/lib/auth";
import { parseCSV } from "@/lib/csv";
import { hashPassword, validatePassword } from "@/lib/password";
import { dbImportUser } from "@/lib/db";
import { logAction, getClientIp } from "@/lib/audit";

const TEMP_PASSWORD = "Welcome1!";

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

  const tempHash = await hashPassword(TEMP_PASSWORD);
  let usedTempPassword = false;

  let imported = 0;
  let skipped = 0;
  const errors: { row: number; reason: string }[] = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const email = row["email"]?.trim().toLowerCase();
    const first_name = row["first_name"]?.trim() || null;
    const last_name = row["last_name"]?.trim() || null;
    const role = row["role"]?.trim().toLowerCase() === "admin" ? "admin" : "user";
    const customPassword = row["password"]?.trim() || null;

    if (!email) {
      errors.push({ row: i + 2, reason: "Missing email" });
      continue;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      errors.push({ row: i + 2, reason: `Invalid email: ${email}` });
      continue;
    }

    let passwordHash: string;
    let mustChange: boolean;

    if (customPassword) {
      const validation = validatePassword(customPassword);
      if (validation) {
        errors.push({ row: i + 2, reason: `Password invalid: ${validation}` });
        continue;
      }
      passwordHash = await hashPassword(customPassword);
      mustChange = false;
    } else {
      passwordHash = tempHash;
      mustChange = true;
      usedTempPassword = true;
    }

    try {
      await dbImportUser(email, passwordHash, role, first_name, last_name, mustChange);
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
    action: "User-Import",
    details: { imported, skipped, errors: errors.length },
    success: true,
    ipAddress: ip,
  });

  return Response.json({
    imported,
    skipped,
    errors,
    tempPassword: usedTempPassword ? TEMP_PASSWORD : undefined,
  });
}
