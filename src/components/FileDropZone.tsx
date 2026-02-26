"use client";

import { useCallback, useState, useRef } from "react";
import { SUPPORTED_EXTENSIONS, MAX_FILE_SIZE } from "@/lib/constants";

interface FileDropZoneProps {
  onFiles: (files: File[]) => void;
  accept?: string;
  multiple?: boolean;
  label?: string;
}

export default function FileDropZone({
  onFiles,
  accept,
  multiple = true,
  label = "Drop files here or click to browse",
}: FileDropZoneProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const validateFiles = useCallback(
    (files: File[]): File[] => {
      setError(null);
      const valid: File[] = [];

      for (const file of files) {
        const ext = file.name.substring(file.name.lastIndexOf(".")).toLowerCase();
        const allowedExts = accept
          ? accept.split(",").map((s) => s.trim())
          : SUPPORTED_EXTENSIONS;

        if (!allowedExts.includes(ext)) {
          setError(`Unsupported file type: ${file.name}`);
          continue;
        }
        if (file.size > MAX_FILE_SIZE) {
          setError(`File too large: ${file.name} (max 10MB)`);
          continue;
        }
        valid.push(file);
      }

      return valid;
    },
    [accept]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      const files = Array.from(e.dataTransfer.files);
      const valid = validateFiles(files);
      if (valid.length) onFiles(valid);
    },
    [onFiles, validateFiles]
  );

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(e.target.files || []);
      const valid = validateFiles(files);
      if (valid.length) onFiles(valid);
      if (inputRef.current) inputRef.current.value = "";
    },
    [onFiles, validateFiles]
  );

  return (
    <div>
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
        onClick={() => inputRef.current?.click()}
        className={`border-2 border-dashed rounded-xl p-10 text-center cursor-pointer transition-colors ${
          isDragging
            ? "border-blue-500 bg-blue-50"
            : "border-gray-300 hover:border-gray-400 hover:bg-gray-50"
        }`}
      >
        <svg
          className="mx-auto h-10 w-10 text-gray-400 mb-3"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
            d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
          />
        </svg>
        <p className="text-gray-600 font-medium">{label}</p>
        <p className="text-gray-400 text-sm mt-1">
          Supported: PDF, DOCX, XLSX, PPTX, TXT, MD, CSV
          {accept?.includes(".zip") ? ", ZIP" : ""} (max 10MB)
        </p>
        <input
          ref={inputRef}
          type="file"
          className="hidden"
          multiple={multiple}
          accept={accept || SUPPORTED_EXTENSIONS.filter((e) => e !== ".zip").join(",")}
          onChange={handleChange}
        />
      </div>
      {error && (
        <p className="text-red-500 text-sm mt-2">{error}</p>
      )}
    </div>
  );
}
