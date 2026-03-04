"use client";

import { useState, useCallback } from "react";
import { useNetDocuments } from "./NetDocumentsContext";
import NetDocumentsBrowser from "./NetDocumentsBrowser";

interface NetDocumentsButtonProps {
  onFiles: (files: File[]) => void;
  mode?: "single" | "multiple";
  accept?: string[];
}

export default function NetDocumentsButton({
  onFiles,
  mode = "multiple",
  accept,
}: NetDocumentsButtonProps) {
  const { isConnected, isLoading } = useNetDocuments();
  const [isOpen, setIsOpen] = useState(false);

  const handleOpen = useCallback(() => {
    setIsOpen(true);
  }, []);

  const handleClose = useCallback(() => {
    setIsOpen(false);
  }, []);

  return (
    <>
      <button
        onClick={handleOpen}
        disabled={isLoading}
        className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50"
      >
        <span
          className={`w-2 h-2 rounded-full ${
            isLoading ? "bg-gray-300" : isConnected ? "bg-green-500" : "bg-gray-400"
          }`}
        />
        Browse NetDocuments
      </button>

      <NetDocumentsBrowser
        isOpen={isOpen}
        onClose={handleClose}
        onFiles={onFiles}
        mode={mode}
        accept={accept}
      />
    </>
  );
}
