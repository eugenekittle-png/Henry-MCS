import { NextRequest } from "next/server";
import * as XLSX from "xlsx";
import { MAX_FILE_SIZE } from "@/lib/constants";
import { getClient, getMatter } from "@/lib/db";
import { getSession, hasPage } from "@/lib/auth";
import { logAction, getClientIp } from "@/lib/audit";
import type { ExcelCellDiff, ExcelRowDiff, ExcelSheetDiff, ExcelDiffResult } from "@/components/ExcelDiffDisplay";

function sheetToRows(sheet: XLSX.WorkSheet): string[][] {
  return XLSX.utils.sheet_to_json<string[]>(sheet, { header: 1, defval: "" }) as string[][];
}

function parseCsvToRows(buffer: Buffer): string[][] {
  const text = buffer.toString("utf-8").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const lines = text.split("\n").filter(l => l.trim().length > 0);
  return lines.map(line => {
    const fields: string[] = [];
    let current = "";
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (inQuotes) {
        if (ch === '"' && line[i + 1] === '"') { current += '"'; i++; }
        else if (ch === '"') { inQuotes = false; }
        else { current += ch; }
      } else {
        if (ch === '"') { inQuotes = true; }
        else if (ch === ',') { fields.push(current.trim()); current = ""; }
        else { current += ch; }
      }
    }
    fields.push(current.trim());
    return fields;
  });
}

function compareSheets(rows1: string[][], rows2: string[][]): { rows: ExcelRowDiff[]; colCount: number } {
  const maxRows = Math.max(rows1.length, rows2.length);
  const colCount = Math.max(
    ...rows1.map(r => r.length),
    ...rows2.map(r => r.length),
    0
  );

  const rows: ExcelRowDiff[] = [];

  for (let r = 0; r < maxRows; r++) {
    const row1 = rows1[r] ?? [];
    const row2 = rows2[r] ?? [];

    if (r >= rows1.length) {
      rows.push({
        type: "added",
        cells: Array.from({ length: colCount }, (_, c) => ({
          type: "added" as const,
          value1: "",
          value2: String(row2[c] ?? ""),
        })),
      });
    } else if (r >= rows2.length) {
      rows.push({
        type: "removed",
        cells: Array.from({ length: colCount }, (_, c) => ({
          type: "removed" as const,
          value1: String(row1[c] ?? ""),
          value2: "",
        })),
      });
    } else {
      const cells: ExcelCellDiff[] = [];
      let hasChange = false;
      for (let c = 0; c < colCount; c++) {
        const v1 = String(row1[c] ?? "");
        const v2 = String(row2[c] ?? "");
        if (v1 === v2) {
          cells.push({ type: "unchanged", value1: v1, value2: v2 });
        } else {
          cells.push({ type: "changed", value1: v1, value2: v2 });
          hasChange = true;
        }
      }
      rows.push({ type: hasChange ? "changed" : "unchanged", cells });
    }
  }

  return { rows, colCount };
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  const ip = getClientIp(req);
  if (!session || !hasPage(session, "compare")) return Response.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const formData = await req.formData();
    const file1 = formData.get("file1") as File | null;
    const file2 = formData.get("file2") as File | null;

    if (!file1 || !file2) return Response.json({ error: "Two files are required" }, { status: 400 });

    const TABULAR_EXTENSIONS = [".xlsx", ".csv"];
    for (const file of [file1, file2]) {
      const ext = file.name.substring(file.name.lastIndexOf(".")).toLowerCase();
      if (!TABULAR_EXTENSIONS.includes(ext)) return Response.json({ error: `Expected .xlsx or .csv files, got: ${file.name}` }, { status: 400 });
      if (file.size > MAX_FILE_SIZE) return Response.json({ error: `File too large: ${file.name} (max 10MB)` }, { status: 400 });
    }

    const ext1 = file1.name.substring(file1.name.lastIndexOf(".")).toLowerCase();
    const ext2 = file2.name.substring(file2.name.lastIndexOf(".")).toLowerCase();

    const getRows = async (file: File, ext: string): Promise<{ name: string; rows: string[][] }[]> => {
      const buffer = Buffer.from(await file.arrayBuffer());
      if (ext === ".csv") {
        return [{ name: "Sheet1", rows: parseCsvToRows(buffer) }];
      }
      const wb = XLSX.read(buffer, { type: "buffer" });
      return wb.SheetNames.map(name => ({ name, rows: sheetToRows(wb.Sheets[name]) }));
    };

    const sheets1 = await getRows(file1, ext1);
    const sheets2 = await getRows(file2, ext2);

    const sheetMap1 = new Map(sheets1.map(s => [s.name, s.rows]));
    const sheetMap2 = new Map(sheets2.map(s => [s.name, s.rows]));
    const allSheetNames = [...new Set([...sheetMap1.keys(), ...sheetMap2.keys()])];
    const sheets: ExcelSheetDiff[] = [];

    for (const sheetName of allSheetNames) {
      const r1 = sheetMap1.get(sheetName);
      const r2 = sheetMap2.get(sheetName);

      if (r1 && r2) {
        const { rows, colCount } = compareSheets(r1, r2);
        sheets.push({ sheetName, inFile1: true, inFile2: true, rows, colCount });
      } else if (r1) {
        const colCount = Math.max(...r1.map(r => r.length), 0);
        sheets.push({
          sheetName, inFile1: true, inFile2: false, colCount,
          rows: r1.map(row => ({
            type: "removed" as const,
            cells: Array.from({ length: colCount }, (_, c) => ({
              type: "removed" as const,
              value1: String(row[c] ?? ""),
              value2: "",
            })),
          })),
        });
      } else {
        const r2rows = r2!;
        const colCount = Math.max(...r2rows.map(r => r.length), 0);
        sheets.push({
          sheetName, inFile1: false, inFile2: true, colCount,
          rows: r2rows.map(row => ({
            type: "added" as const,
            cells: Array.from({ length: colCount }, (_, c) => ({
              type: "added" as const,
              value1: "",
              value2: String(row[c] ?? ""),
            })),
          })),
        });
      }
    }

    let clientNumber: string | null = null;
    let matterNumber: string | null = null;
    const clientId = formData.get("clientId");
    const matterId = formData.get("matterId");
    if (clientId && matterId) {
      const client = await getClient(parseInt(clientId as string, 10));
      const matter = await getMatter(parseInt(matterId as string, 10));
      if (client && matter) {
        clientNumber = client.client_number;
        matterNumber = matter.matter_number;
      }
    }

    const changedSheets = sheets.filter(s => s.rows.some(r => r.type !== "unchanged")).length;
    await logAction({
      username: session?.email ?? null,
      action: "Compare-Diff-Excel",
      clientNumber,
      matterNumber,
      details: { file1: file1.name, file2: file2.name, sheets: sheets.length, changedSheets },
      success: true,
      ipAddress: ip,
    });

    return Response.json({ sheets, file1Name: file1.name, file2Name: file2.name } satisfies ExcelDiffResult);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal server error";
    await logAction({ username: session?.email ?? null, action: "Compare-Diff-Excel", details: { error: message }, success: false, ipAddress: ip });
    return Response.json({ error: message }, { status: 500 });
  }
}
