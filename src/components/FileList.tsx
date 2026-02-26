"use client";

interface FileListProps {
  files: File[];
  onRemove: (index: number) => void;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const EXT_COLORS: Record<string, string> = {
  ".pdf": "bg-red-100 text-red-700",
  ".docx": "bg-blue-100 text-blue-700",
  ".xlsx": "bg-green-100 text-green-700",
  ".pptx": "bg-orange-100 text-orange-700",
  ".txt": "bg-gray-100 text-gray-700",
  ".md": "bg-purple-100 text-purple-700",
  ".csv": "bg-teal-100 text-teal-700",
  ".zip": "bg-yellow-100 text-yellow-700",
};

export default function FileList({ files, onRemove }: FileListProps) {
  if (!files.length) return null;

  return (
    <div className="space-y-2">
      <p className="text-sm font-medium text-gray-700">
        {files.length} file{files.length !== 1 ? "s" : ""} selected
      </p>
      <ul className="space-y-1">
        {files.map((file, i) => {
          const ext = file.name.substring(file.name.lastIndexOf(".")).toLowerCase();
          const colorClass = EXT_COLORS[ext] || "bg-gray-100 text-gray-700";

          return (
            <li
              key={`${file.name}-${i}`}
              className="flex items-center justify-between bg-white border border-gray-200 rounded-lg px-3 py-2"
            >
              <div className="flex items-center gap-2 min-w-0">
                <span className={`text-xs font-mono px-1.5 py-0.5 rounded ${colorClass}`}>
                  {ext}
                </span>
                <span className="text-sm text-gray-800 truncate">{file.name}</span>
                <span className="text-xs text-gray-400 flex-shrink-0">
                  {formatSize(file.size)}
                </span>
              </div>
              <button
                onClick={() => onRemove(i)}
                className="text-gray-400 hover:text-red-500 ml-2 flex-shrink-0"
                aria-label={`Remove ${file.name}`}
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
