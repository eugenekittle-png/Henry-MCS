"use client";

import { useRef, useEffect } from "react";

export interface DiffLine {
  type: "added" | "removed" | "unchanged";
  value: string;
}

interface DiffDisplayProps {
  lines: DiffLine[];
  file1Name: string;
  file2Name: string;
}

export default function DiffDisplay({ lines, file1Name, file2Name }: DiffDisplayProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.scrollTop = 0;
    }
  }, [lines]);

  if (!lines.length) return null;

  return (
    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
      <div className="flex items-center gap-4 px-4 py-3 bg-gray-50 border-b border-gray-200 text-sm">
        <span className="font-medium text-gray-700">Comparing:</span>
        <span className="text-gray-600">{file1Name}</span>
        <span className="text-gray-400">vs</span>
        <span className="text-gray-600">{file2Name}</span>
      </div>
      <div className="flex items-center gap-4 px-4 py-2 bg-gray-50 border-b border-gray-200 text-xs text-gray-500">
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-3 h-3 rounded bg-blue-100 border border-blue-300" />
          Added in {file2Name}
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-3 h-3 rounded bg-red-100 border border-red-300" />
          Removed from {file1Name}
        </span>
      </div>
      <div
        ref={containerRef}
        className="max-h-[70vh] overflow-y-auto font-mono text-sm"
      >
        {lines.map((line, i) => {
          if (line.type === "added") {
            return (
              <div key={i} className="px-4 py-0.5 bg-blue-50 border-l-4 border-blue-400">
                <span className="text-blue-700 select-none mr-2">+</span>
                <span className="text-blue-800">{line.value || "\u00A0"}</span>
              </div>
            );
          }
          if (line.type === "removed") {
            return (
              <div key={i} className="px-4 py-0.5 bg-red-50 border-l-4 border-red-400">
                <span className="text-red-700 select-none mr-2">-</span>
                <span className="text-red-800 line-through">{line.value || "\u00A0"}</span>
              </div>
            );
          }
          return (
            <div key={i} className="px-4 py-0.5">
              <span className="text-gray-300 select-none mr-2">&nbsp;</span>
              <span className="text-gray-700">{line.value || "\u00A0"}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
