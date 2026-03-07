"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface ParsedCallback {
  code: string;
  state: string;
  tk: string;
  sc: string;
  expires_in: string;
  raw: Record<string, string>;
}

export default function CallbackUrlInput() {
  const [url, setUrl] = useState("");
  const [error, setError] = useState("");
  const [parsed, setParsed] = useState<ParsedCallback | null>(null);
  const router = useRouter();

  function parseUrl() {
    setError("");
    setParsed(null);
    try {
      const parsed = new URL(url.trim());
      const code = parsed.searchParams.get("code");
      if (!code) {
        setError("No 'code' parameter found in the URL.");
        return;
      }
      const raw: Record<string, string> = {};
      parsed.searchParams.forEach((value, key) => {
        raw[key] = value;
      });
      setParsed({
        code,
        state: raw.state || "",
        tk: raw.tk || "",
        sc: raw.sc || "",
        expires_in: raw.expires_in || "",
        raw,
      });
    } catch {
      setError("Invalid URL. Paste the full redirect URL including http://");
    }
  }

  function proceed() {
    if (!parsed) return;
    let qs = `nd_code=${encodeURIComponent(parsed.code)}`;
    if (parsed.tk) qs += `&nd_tk=${encodeURIComponent(parsed.tk)}`;
    if (parsed.expires_in) qs += `&nd_expires=${encodeURIComponent(parsed.expires_in)}`;
    router.push(`/netdocuments-debug?${qs}`);
  }

  return (
    <div className="mt-6 border-t border-gray-200 pt-6">
      <p className="text-sm font-medium mb-2">
        After authorizing, NetDocuments redirects to{" "}
        <span className="font-mono text-blue-700">http://localhost?code=...&state=...&tk=...&sc=...</span>.
        Copy that full URL from your browser and paste it below:
      </p>

      <div className="flex gap-2">
        <input
          type="text"
          value={url}
          onChange={(e) => { setUrl(e.target.value); setParsed(null); setError(""); }}
          placeholder="http://localhost/?code=...&state=...&tk=...&sc=..."
          className="flex-1 border border-gray-300 rounded px-3 py-2 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <button
          onClick={parseUrl}
          disabled={!url.trim()}
          className="bg-gray-700 hover:bg-gray-800 disabled:bg-gray-400 text-white px-4 py-2 rounded font-medium text-sm whitespace-nowrap"
        >
          Parse
        </button>
      </div>

      {error && <p className="text-red-600 text-sm mt-2">{error}</p>}

      {parsed && (
        <div className="mt-4">
          <p className="text-sm font-semibold text-green-700 mb-2">Parsed parameters:</p>
          <table className="w-full border-collapse text-sm mb-4">
            <thead>
              <tr className="bg-gray-100">
                <th className="border border-gray-300 px-3 py-2 text-left w-36">Parameter</th>
                <th className="border border-gray-300 px-3 py-2 text-left">Value</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(parsed.raw).map(([key, value]) => (
                <tr key={key} className={key === "code" || key === "tk" ? "bg-yellow-50" : ""}>
                  <td className="border border-gray-300 px-3 py-2 font-mono font-semibold">{key}</td>
                  <td className="border border-gray-300 px-3 py-2 font-mono break-all">{value}</td>
                </tr>
              ))}
            </tbody>
          </table>

          {parsed.expires_in && (
            <p className="text-xs text-amber-600 mb-3">
              Code expires in {parsed.expires_in}s — proceed quickly.
            </p>
          )}

          <button
            onClick={proceed}
            className="bg-blue-600 hover:bg-blue-700 text-white px-5 py-2 rounded font-medium text-sm"
          >
            Next — Proceed to Token Exchange →
          </button>
        </div>
      )}
    </div>
  );
}
