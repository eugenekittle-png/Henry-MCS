import { NextRequest } from "next/server";
import ExcelJS from "exceljs";
import { getSession } from "@/lib/auth";
import type { ExcelDiffResult, ExcelSheetDiff } from "@/components/ExcelDiffDisplay";

const FILL_ADDED:   ExcelJS.Fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFD1FAE5" } };
const FILL_REMOVED: ExcelJS.Fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFEE2E2" } };
const FILL_CHANGED: ExcelJS.Fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFEF9C3" } };
const FILL_CELL:    ExcelJS.Fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFDE68A" } };
const FILL_HEADER:  ExcelJS.Fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF3F4F6" } };

const BORDER_LEFT_ADDED:   Partial<ExcelJS.Borders> = { left: { style: "medium", color: { argb: "FF4ADE80" } } };
const BORDER_LEFT_REMOVED: Partial<ExcelJS.Borders> = { left: { style: "medium", color: { argb: "FFF87171" } } };
const BORDER_LEFT_CHANGED: Partial<ExcelJS.Borders> = { left: { style: "medium", color: { argb: "FFFBBF24" } } };

function colLabel(index: number): string {
  let label = "";
  let n = index + 1;
  while (n > 0) {
    const rem = (n - 1) % 26;
    label = String.fromCharCode(65 + rem) + label;
    n = Math.floor((n - 1) / 26);
  }
  return label;
}

function buildSheetTab(wb: ExcelJS.Workbook, diff: ExcelSheetDiff, file1Name: string, file2Name: string) {
  const ws = wb.addWorksheet(diff.sheetName);
  const colCount = diff.colCount;

  // Column widths: row# + data columns
  ws.columns = [
    { width: 6 },
    ...Array.from({ length: colCount }, () => ({ width: 18 })),
  ];

  // Header row
  const headerRow = ws.addRow(["#", ...Array.from({ length: colCount }, (_, c) => colLabel(c))]);
  headerRow.eachCell(cell => {
    cell.fill = FILL_HEADER;
    cell.font = { bold: true, color: { argb: "FF6B7280" }, size: 9 };
    cell.alignment = { horizontal: "center", vertical: "middle" };
    cell.border = { bottom: { style: "thin", color: { argb: "FFE5E7EB" } } };
  });

  // Data rows
  diff.rows.forEach((row, rowIdx) => {
    const originalRowNum = rowIdx + 1;

    if (row.type === "unchanged") {
      const values = row.cells.map(c => c.value1);
      const exRow = ws.addRow([originalRowNum, ...values]);
      exRow.eachCell((cell, colNum) => {
        cell.font = { size: 9, color: { argb: "FF374151" } };
        cell.border = { bottom: { style: "hair", color: { argb: "FFE5E7EB" } } };
        if (colNum === 1) cell.font = { ...cell.font, color: { argb: "FF9CA3AF" } };
      });
      return;
    }

    if (row.type === "added") {
      const values = row.cells.map(c => c.value2);
      const exRow = ws.addRow([originalRowNum, ...values]);
      exRow.eachCell((cell, colNum) => {
        cell.fill = FILL_ADDED;
        cell.font = { size: 9, color: { argb: "FF065F46" } };
        cell.border = { ...BORDER_LEFT_ADDED, bottom: { style: "hair", color: { argb: "FFD1FAE5" } } };
        if (colNum === 1) { cell.font = { ...cell.font, color: { argb: "FF6EE7B7" } }; }
      });
      return;
    }

    if (row.type === "removed") {
      const values = row.cells.map(c => c.value1);
      const exRow = ws.addRow([originalRowNum, ...values]);
      exRow.eachCell((cell, colNum) => {
        cell.fill = FILL_REMOVED;
        cell.font = { size: 9, color: { argb: "FF991B1B" }, strike: true };
        cell.border = { ...BORDER_LEFT_REMOVED, bottom: { style: "hair", color: { argb: "FFFEE2E2" } } };
        if (colNum === 1) { cell.font = { ...cell.font, color: { argb: "FFFCA5A5" }, strike: false }; }
      });
      return;
    }

    // changed row
    const values = row.cells.map(c =>
      c.type === "changed"
        ? (c.value1 && c.value2 ? `${c.value1} → ${c.value2}` : c.value2 || c.value1)
        : c.value1
    );
    const exRow = ws.addRow([originalRowNum, ...values]);
    exRow.eachCell((cell, colNum) => {
      const cellIdx = colNum - 2; // 0-based data cell index (col 1 = row#, col 2 = cell 0)
      const diffCell = row.cells[cellIdx];
      const isChangedCell = diffCell?.type === "changed";

      cell.fill = isChangedCell ? FILL_CELL : FILL_CHANGED;
      cell.font = { size: 9, color: { argb: isChangedCell ? "FF92400E" : "FF374151" } };
      cell.border = { ...BORDER_LEFT_CHANGED, bottom: { style: "hair", color: { argb: "FFFEF9C3" } } };
      if (colNum === 1) { cell.fill = FILL_CHANGED; cell.font = { size: 9, color: { argb: "FFFBBF24" } }; }
    });
  });

  // Sheet-level info note if only in one file
  if (!diff.inFile2) {
    ws.getCell("A1").note = `This sheet only exists in ${file1Name}`;
  } else if (!diff.inFile1) {
    ws.getCell("A1").note = `This sheet only exists in ${file2Name}`;
  }

  // Freeze header row
  ws.views = [{ state: "frozen", ySplit: 1 }];
}

function buildSummarySheet(wb: ExcelJS.Workbook, result: ExcelDiffResult) {
  const ws = wb.addWorksheet("Summary");
  ws.columns = [{ width: 24 }, { width: 14 }, { width: 14 }, { width: 14 }, { width: 14 }];

  // Title
  const titleRow = ws.addRow(["Comparison Summary"]);
  titleRow.getCell(1).font = { bold: true, size: 13 };
  ws.addRow([`${result.file1Name}  vs  ${result.file2Name}`]).getCell(1).font = { size: 10, color: { argb: "FF6B7280" } };
  ws.addRow([`Generated: ${new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}`])
    .getCell(1).font = { size: 10, color: { argb: "FF6B7280" } };
  ws.addRow([]);

  // Header
  const hdr = ws.addRow(["Sheet", "Changed Rows", "Added Rows", "Removed Rows", "Total Rows"]);
  hdr.eachCell(cell => {
    cell.fill = FILL_HEADER;
    cell.font = { bold: true, size: 10 };
    cell.border = { bottom: { style: "thin", color: { argb: "FFD1D5DB" } } };
  });

  // Data
  for (const sheet of result.sheets) {
    const changed = sheet.rows.filter(r => r.type === "changed").length;
    const added   = sheet.rows.filter(r => r.type === "added").length;
    const removed = sheet.rows.filter(r => r.type === "removed").length;
    const total   = sheet.rows.length;

    const row = ws.addRow([sheet.sheetName, changed, added, removed, total]);
    row.getCell(1).font = { size: 10 };
    if (changed > 0) { row.getCell(2).fill = FILL_CHANGED; row.getCell(2).font = { size: 10, color: { argb: "FF92400E" } }; }
    if (added   > 0) { row.getCell(3).fill = FILL_ADDED;   row.getCell(3).font = { size: 10, color: { argb: "FF065F46" } }; }
    if (removed > 0) { row.getCell(4).fill = FILL_REMOVED; row.getCell(4).font = { size: 10, color: { argb: "FF991B1B" } }; }
    row.getCell(5).font = { size: 10, color: { argb: "FF6B7280" } };
  }

  ws.views = [{ state: "normal" }];
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const result = await req.json() as ExcelDiffResult;

    if (!result?.sheets?.length) {
      return Response.json({ error: "No diff data provided" }, { status: 400 });
    }

    const wb = new ExcelJS.Workbook();
    wb.creator = "Henry MCS";
    wb.created = new Date();

    buildSummarySheet(wb, result);
    for (const sheet of result.sheets) {
      buildSheetTab(wb, sheet, result.file1Name, result.file2Name);
    }

    const buffer = await wb.xlsx.writeBuffer();

    const file1Base = result.file1Name.replace(/\.[^.]+$/, "");
    const file2Base = result.file2Name.replace(/\.[^.]+$/, "");

    return new Response(buffer, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="diff-${file1Base}-vs-${file2Base}.xlsx"`,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Export failed";
    return Response.json({ error: message }, { status: 500 });
  }
}
