"use client";

import { useState } from "react";
import CourtListenerBrowser, { type CourtListenerOpinion } from "./CourtListenerBrowser";

interface Props {
  onAdd: (opinion: CourtListenerOpinion) => void;
  alreadyAdded: string[];
}

export default function CourtListenerButton({ onAdd, alreadyAdded }: Props) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-gray-300 bg-white text-sm font-medium text-gray-700 hover:bg-gray-50 hover:border-gray-400 transition-colors"
      >
        <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 6l3 1m0 0l-3 9a5.002 5.002 0 006.001 0M6 7l3 9M6 7l6-2m6 2l3-1m-3 1l-3 9a5.002 5.002 0 006.001 0M18 7l3 9m-3-9l-6-2m0-2v2m0 16V5m0 16H9m3 0h3" />
        </svg>
        Add from CourtListener
        {alreadyAdded.length > 0 && (
          <span className="ml-1 bg-blue-100 text-blue-700 text-xs font-semibold px-1.5 py-0.5 rounded-full">
            {alreadyAdded.length}
          </span>
        )}
      </button>

      {open && (
        <CourtListenerBrowser
          onAdd={(opinion) => { onAdd(opinion); }}
          onClose={() => setOpen(false)}
          alreadyAdded={alreadyAdded}
        />
      )}
    </>
  );
}
