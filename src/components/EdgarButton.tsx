"use client";

import { useState } from "react";
import EdgarBrowser, { type EdgarFiling } from "./EdgarBrowser";

interface Props {
  onAdd: (filing: EdgarFiling) => void;
  alreadyAdded: string[];
}

export default function EdgarButton({ onAdd, alreadyAdded }: Props) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-gray-300 bg-white text-sm font-medium text-gray-700 hover:bg-gray-50 hover:border-gray-400 transition-colors"
      >
        <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
        Add from SEC EDGAR
        {alreadyAdded.length > 0 && (
          <span className="ml-1 bg-blue-100 text-blue-700 text-xs font-semibold px-1.5 py-0.5 rounded-full">
            {alreadyAdded.length}
          </span>
        )}
      </button>

      {open && (
        <EdgarBrowser
          onAdd={(filing) => { onAdd(filing); }}
          onClose={() => setOpen(false)}
          alreadyAdded={alreadyAdded}
        />
      )}
    </>
  );
}
