"use client";

import { useState, useCallback } from "react";

/* eslint-disable @typescript-eslint/no-explicit-any */

export interface DetectedVariable {
  suggestedName: string;
  type: "person" | "org" | "date" | "amount" | "address" | "reference" | "other";
  occurrences: string[];
  description: string;
}

interface WizardVariable extends DetectedVariable {
  name: string;
  enabled: boolean;
}

type Step = "idle" | "scanning" | "review" | "applying" | "done";

const TYPE_LABELS: Record<string, string> = {
  person: "Person",
  org: "Organisation",
  date: "Date",
  amount: "Amount",
  address: "Address",
  reference: "Reference",
  other: "Other",
};

const TYPE_COLOURS: Record<string, string> = {
  person: "bg-blue-100 text-blue-700",
  org: "bg-purple-100 text-purple-700",
  date: "bg-amber-100 text-amber-700",
  amount: "bg-green-100 text-green-700",
  address: "bg-pink-100 text-pink-700",
  reference: "bg-gray-100 text-gray-600",
  other: "bg-gray-100 text-gray-600",
};

interface Props {
  officeReady: boolean;
  tokenRef: React.MutableRefObject<string | null>;
}

export default function TemplateWizard({ officeReady, tokenRef }: Props) {
  const [step, setStep] = useState<Step>("idle");
  const [variables, setVariables] = useState<WizardVariable[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [applyProgress, setApplyProgress] = useState<{ current: number; total: number; label: string } | null>(null);
  const [appliedCount, setAppliedCount] = useState(0);

  const handleScan = useCallback(async () => {
    if (!officeReady) return;
    setStep("scanning");
    setError(null);

    let docText = "";
    try {
      docText = await (window as any).Word.run(async (context: any) => {
        const body = context.document.body;
        body.load("text");
        await context.sync();
        return body.text as string;
      });
    } catch {
      setError("Could not read the document. Make sure a Word document is open.");
      setStep("idle");
      return;
    }

    if (!docText.trim()) {
      setError("The document appears to be empty.");
      setStep("idle");
      return;
    }

    try {
      const headers: HeadersInit = { "Content-Type": "application/json" };
      if (tokenRef.current) headers["Authorization"] = `Bearer ${tokenRef.current}`;
      const res = await fetch("/api/addin/template-detect", {
        method: "POST",
        headers,
        body: JSON.stringify({ text: docText }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);

      const detected: DetectedVariable[] = data.variables ?? [];
      if (detected.length === 0) {
        setError("No variables were detected. The document may already be a template, or it may not contain matter-specific data.");
        setStep("idle");
        return;
      }

      setVariables(detected.map(v => ({ ...v, name: v.suggestedName, enabled: true })));
      setStep("review");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setStep("idle");
    }
  }, [officeReady, tokenRef]);

  const handleApply = useCallback(async () => {
    const toApply = variables.filter(v => v.enabled && v.name.trim());
    if (toApply.length === 0) return;

    setStep("applying");
    setError(null);
    setApplyProgress({ current: 0, total: toApply.length, label: "" });
    let applied = 0;

    for (let i = 0; i < toApply.length; i++) {
      const variable = toApply[i];
      setApplyProgress({ current: i + 1, total: toApply.length, label: variable.name });

      try {
        await (window as any).Word.run(async (context: any) => {
          const body = context.document.body;

          for (const occurrence of variable.occurrences) {
            if (!occurrence.trim()) continue;
            const results = body.search(occurrence, { matchCase: false, matchWholeWord: false });
            results.load("items");
            await context.sync();

            for (const range of results.items) {
              const cc = range.insertContentControl();
              cc.title = variable.name;
              cc.tag = variable.name;
              cc.placeholderText = `{{${variable.name}}}`;
              cc.appearance = "Tags";
              cc.color = typeToColour(variable.type);
            }
            await context.sync();
          }
        });
        applied++;
      } catch {
        // Skip this variable and continue
      }
    }

    setAppliedCount(applied);
    setStep("done");
    setApplyProgress(null);
  }, [variables]);

  function typeToColour(type: string): string {
    const map: Record<string, string> = {
      person: "#0078d4",
      org: "#8764b8",
      date: "#ca5010",
      amount: "#107c10",
      address: "#e3008c",
      reference: "#767676",
      other: "#767676",
    };
    return map[type] ?? "#767676";
  }

  function handleReset() {
    setStep("idle");
    setVariables([]);
    setError(null);
    setApplyProgress(null);
    setAppliedCount(0);
  }

  function updateVariable(index: number, patch: Partial<WizardVariable>) {
    setVariables(prev => prev.map((v, i) => i === index ? { ...v, ...patch } : v));
  }

  const enabledCount = variables.filter(v => v.enabled).length;

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* ── Idle ── */}
      {step === "idle" && (
        <div className="flex-1 flex flex-col items-center justify-center px-4 py-6 text-center">
          <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center mb-3">
            <svg className="w-5 h-5 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414A1 1 0 0119 9.414V19a2 2 0 01-2 2z" />
            </svg>
          </div>
          <p className="text-sm font-semibold text-gray-800 mb-1">Document Template Wizard</p>
          <p className="text-xs text-gray-500 mb-5 leading-relaxed">
            Scans the open document for matter-specific data — names, dates, amounts, references — and converts them into reusable template fields.
          </p>
          {error && (
            <div className="w-full mb-4 text-xs text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2 text-left">{error}</div>
          )}
          <button
            onClick={handleScan}
            disabled={!officeReady}
            className="w-full bg-blue-600 text-white py-2 rounded-lg text-sm font-semibold hover:bg-blue-700 disabled:opacity-50"
          >
            Scan Document
          </button>
          {!officeReady && (
            <p className="text-xs text-gray-400 mt-2">Connecting to Word...</p>
          )}
        </div>
      )}

      {/* ── Scanning ── */}
      {step === "scanning" && (
        <div className="flex-1 flex flex-col items-center justify-center px-4 py-6 text-center">
          <div className="flex items-center gap-2 text-gray-400 text-xs mb-2">
            <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce [animation-delay:-0.3s]" />
            <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce [animation-delay:-0.15s]" />
            <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" />
          </div>
          <p className="text-xs text-gray-500">Analysing document for variables...</p>
        </div>
      )}

      {/* ── Review ── */}
      {step === "review" && (
        <div className="flex-1 flex flex-col overflow-hidden">
          <div className="px-3 py-2 border-b border-gray-100 flex items-center justify-between flex-shrink-0">
            <div>
              <p className="text-xs font-semibold text-gray-800">{variables.length} variables detected</p>
              <p className="text-xs text-gray-500">{enabledCount} selected for replacement</p>
            </div>
            <button onClick={handleReset} className="text-xs text-gray-400 hover:text-gray-600">Rescan</button>
          </div>

          <div className="flex-1 overflow-y-auto px-3 py-2 space-y-2">
            {variables.map((v, i) => (
              <div
                key={i}
                className={`border rounded-lg px-3 py-2 transition-colors ${v.enabled ? "bg-white border-gray-200" : "bg-gray-50 border-gray-100 opacity-60"}`}
              >
                <div className="flex items-start gap-2">
                  <input
                    type="checkbox"
                    checked={v.enabled}
                    onChange={e => updateVariable(i, { enabled: e.target.checked })}
                    className="mt-0.5 flex-shrink-0"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 mb-1">
                      <input
                        type="text"
                        value={v.name}
                        onChange={e => updateVariable(i, { name: e.target.value })}
                        disabled={!v.enabled}
                        className="flex-1 border border-gray-200 rounded px-2 py-0.5 text-xs font-mono text-gray-900 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:opacity-50 disabled:bg-gray-50"
                      />
                      <span className={`text-xs px-1.5 py-0.5 rounded-full flex-shrink-0 ${TYPE_COLOURS[v.type]}`}>
                        {TYPE_LABELS[v.type]}
                      </span>
                    </div>
                    <p className="text-xs text-gray-500 leading-snug mb-1">{v.description}</p>
                    <div className="flex flex-wrap gap-1">
                      {v.occurrences.map((occ, j) => (
                        <span key={j} className="text-xs bg-gray-100 text-gray-600 rounded px-1.5 py-0.5 font-mono truncate max-w-full">
                          {occ}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="px-3 py-2 border-t border-gray-100 flex-shrink-0">
            <button
              onClick={handleApply}
              disabled={enabledCount === 0}
              className="w-full bg-blue-600 text-white py-2 rounded-lg text-xs font-semibold hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Insert {enabledCount} Content Control{enabledCount !== 1 ? "s" : ""}
            </button>
          </div>
        </div>
      )}

      {/* ── Applying ── */}
      {step === "applying" && applyProgress && (
        <div className="flex-1 flex flex-col items-center justify-center px-4 py-6">
          <p className="text-xs font-semibold text-gray-800 mb-1">Applying template fields...</p>
          <p className="text-xs text-gray-500 mb-3 truncate max-w-full">{applyProgress.label}</p>
          <div className="w-full bg-gray-200 rounded-full h-1.5 mb-1">
            <div
              className="bg-blue-600 h-1.5 rounded-full transition-all"
              style={{ width: `${(applyProgress.current / applyProgress.total) * 100}%` }}
            />
          </div>
          <p className="text-xs text-gray-400">{applyProgress.current} / {applyProgress.total}</p>
        </div>
      )}

      {/* ── Done ── */}
      {step === "done" && (
        <div className="flex-1 flex flex-col items-center justify-center px-4 py-6 text-center">
          <div className="w-10 h-10 rounded-full bg-green-100 flex items-center justify-center mb-3">
            <svg className="w-5 h-5 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <p className="text-sm font-semibold text-gray-800 mb-1">Template ready</p>
          <p className="text-xs text-gray-500 mb-5">
            {appliedCount} variable{appliedCount !== 1 ? "s" : ""} inserted as content controls. Save the document as a <strong>.dotx</strong> template to reuse it.
          </p>
          <button
            onClick={handleReset}
            className="w-full bg-gray-100 hover:bg-gray-200 text-gray-700 py-2 rounded-lg text-xs font-medium"
          >
            Scan Another Document
          </button>
        </div>
      )}
    </div>
  );
}
