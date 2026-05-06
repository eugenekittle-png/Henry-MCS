"use client";

import { useState } from "react";

export interface ExcelCellDiff {
  type: "unchanged" | "changed" | "added" | "removed";
  value1: string;
  value2: string;
}

export interface ExcelRowDiff {
  type: "unchanged" | "changed" | "added" | "removed";
  cells: ExcelCellDiff[];
}

export interface ExcelSheetDiff {
  sheetName: string;
  inFile1: boolean;
  inFile2: boolean;
  rows: ExcelRowDiff[];
  colCount: number;
}

export interface ExcelDiffResult {
  sheets: ExcelSheetDiff[];
  file1Name: string;
  file2Name: string;
}

interface Props {
  result: ExcelDiffResult;
}

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

function SheetGrid({ sheet, changesOnly }: { sheet: ExcelSheetDiff; changesOnly: boolean }) {
  const rows = changesOnly ? sheet.rows.filter(r => r.type !== "unchanged") : sheet.rows;
  const colCount = sheet.colCount;

  if (rows.length === 0) {
    return (
      <div className="px-6 py-10 text-center text-sm text-gray-500">
        {changesOnly ? "No differences found in this sheet." : "This sheet is empty."}
      </div>
    );
  }

  return (
    <div className="overflow-auto max-h-[65vh]">
      <table className="text-xs border-collapse min-w-full">
        <thead className="sticky top-0 z-10 bg-gray-100">
          <tr>
            <th className="sticky left-0 z-20 bg-gray-100 w-10 min-w-[2.5rem] px-2 py-1.5 text-right text-gray-400 font-normal border-b border-r border-gray-200">
              #
            </th>
            {Array.from({ length: colCount }, (_, c) => (
              <th key={c} className="px-2 py-1.5 text-center text-gray-400 font-normal border-b border-r border-gray-200 min-w-[6rem]">
                {colLabel(c)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, rowIdx) => {
            const originalIndex = changesOnly
              ? sheet.rows.indexOf(row)
              : rowIdx;

            const rowBg =
              row.type === "added" ? "bg-green-50" :
              row.type === "removed" ? "bg-red-50" :
              row.type === "changed" ? "bg-yellow-50" :
              "";

            const rowBorder =
              row.type === "added" ? "border-l-4 border-green-400" :
              row.type === "removed" ? "border-l-4 border-red-400" :
              row.type === "changed" ? "border-l-4 border-yellow-400" :
              "";

            return (
              <tr key={rowIdx} className={`${rowBg} ${rowBorder}`}>
                <td className={`sticky left-0 z-10 px-2 py-1 text-right text-gray-400 border-b border-r border-gray-200 ${rowBg || "bg-white"}`}>
                  {originalIndex + 1}
                </td>
                {row.cells.map((cell, cellIdx) => {
                  const cellHighlight = cell.type === "changed" ? "bg-yellow-100" : "";

                  return (
                    <td
                      key={cellIdx}
                      className={`px-2 py-1 border-b border-r border-gray-200 whitespace-nowrap max-w-[16rem] overflow-hidden text-ellipsis align-top ${cellHighlight}`}
                    >
                      {cell.type === "changed" ? (
                        <span className="flex flex-col gap-0.5">
                          <span className="text-red-600 line-through leading-tight">{cell.value1 || <span className="opacity-30">empty</span>}</span>
                          <span className="text-green-700 leading-tight">{cell.value2 || <span className="opacity-30">empty</span>}</span>
                        </span>
                      ) : cell.type === "added" ? (
                        <span className="text-green-700">{cell.value2}</span>
                      ) : cell.type === "removed" ? (
                        <span className="text-red-600 line-through">{cell.value1}</span>
                      ) : (
                        <span className="text-gray-700">{cell.value1}</span>
                      )}
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export default function ExcelDiffDisplay({ result }: Props) {
  const [activeSheet, setActiveSheet] = useState(0);
  const [changesOnly, setChangesOnly] = useState(true);

  const sheet = result.sheets[activeSheet];

  const totalAdded = sheet.rows.filter(r => r.type === "added").length;
  const totalRemoved = sheet.rows.filter(r => r.type === "removed").length;
  const totalChanged = sheet.rows.filter(r => r.type === "changed").length;
  const hasChanges = totalAdded + totalRemoved + totalChanged > 0;

  return (
    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-4 px-4 py-3 bg-gray-50 border-b border-gray-200 text-sm">
        <span className="font-medium text-gray-700">Comparing:</span>
        <span className="text-gray-600">{result.file1Name}</span>
        <span className="text-gray-400">vs</span>
        <span className="text-gray-600">{result.file2Name}</span>
      </div>

      {/* Legend + toggle */}
      <div className="flex items-center justify-between px-4 py-2 bg-gray-50 border-b border-gray-200">
        <div className="flex items-center gap-4 text-xs text-gray-500">
          <span className="flex items-center gap-1.5">
            <span className="inline-block w-3 h-3 rounded bg-green-100 border border-green-400" />
            Added
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block w-3 h-3 rounded bg-red-100 border border-red-400" />
            Removed
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block w-3 h-3 rounded bg-yellow-100 border border-yellow-400" />
            Changed
          </span>
        </div>
        <label className="flex items-center gap-2 text-xs text-gray-600 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={changesOnly}
            onChange={e => setChangesOnly(e.target.checked)}
            className="rounded border-gray-300 text-purple-600 focus:ring-purple-500"
          />
          Show only changes
        </label>
      </div>

      {/* Sheet tabs */}
      {result.sheets.length > 1 && (
        <div className="flex border-b border-gray-200 bg-gray-50 overflow-x-auto">
          {result.sheets.map((s, i) => {
            const sheetChanged = s.rows.some(r => r.type !== "unchanged");
            return (
              <button
                key={i}
                onClick={() => setActiveSheet(i)}
                className={`px-4 py-2 text-xs font-medium whitespace-nowrap border-r border-gray-200 transition-colors ${
                  i === activeSheet
                    ? "bg-white text-gray-900 border-b-2 border-b-purple-500 -mb-px"
                    : "text-gray-500 hover:text-gray-700 hover:bg-gray-100"
                }`}
              >
                {s.sheetName}
                {sheetChanged && (
                  <span className="ml-1.5 inline-block w-1.5 h-1.5 rounded-full bg-yellow-500" />
                )}
                {!s.inFile1 && (
                  <span className="ml-1.5 inline-block w-1.5 h-1.5 rounded-full bg-green-500" />
                )}
                {!s.inFile2 && (
                  <span className="ml-1.5 inline-block w-1.5 h-1.5 rounded-full bg-red-500" />
                )}
              </button>
            );
          })}
        </div>
      )}

      {/* Stats bar */}
      {hasChanges && (
        <div className="flex items-center gap-4 px-4 py-2 bg-white border-b border-gray-100 text-xs">
          {totalChanged > 0 && <span className="text-yellow-700">{totalChanged} row{totalChanged !== 1 ? "s" : ""} changed</span>}
          {totalAdded > 0 && <span className="text-green-700">{totalAdded} row{totalAdded !== 1 ? "s" : ""} added</span>}
          {totalRemoved > 0 && <span className="text-red-700">{totalRemoved} row{totalRemoved !== 1 ? "s" : ""} removed</span>}
          {!sheet.inFile2 && <span className="text-red-700 font-medium">Sheet only in {result.file1Name}</span>}
          {!sheet.inFile1 && <span className="text-green-700 font-medium">Sheet only in {result.file2Name}</span>}
        </div>
      )}

      <SheetGrid sheet={sheet} changesOnly={changesOnly} />
    </div>
  );
}
