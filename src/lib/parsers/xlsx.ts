import * as XLSX from "xlsx";

export function parseXlsx(buffer: Buffer): string {
  const workbook = XLSX.read(buffer, { type: "buffer" });
  const sheets: string[] = [];

  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    const csv = XLSX.utils.sheet_to_csv(sheet);
    sheets.push(`--- Sheet: ${sheetName} ---\n${csv}`);
  }

  return sheets.join("\n\n");
}
