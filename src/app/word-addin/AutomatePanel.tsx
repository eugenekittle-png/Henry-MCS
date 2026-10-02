"use client";

// Automate tab: turn the open document into a reusable Matrix template by replacing
// concrete values with tagged content controls (variables).

import { useState, useEffect, type MutableRefObject } from "react";
import type { ClientRow, MatterRow } from "./MatterPicker";

/* eslint-disable @typescript-eslint/no-explicit-any */

interface MatrixTemplate { id: number; name: string; description: string; column_count: number }
interface MatrixColumn { id: number; column_name: string; instruction: string | null }

interface Props {
  officeReady: boolean;
  tokenRef: MutableRefObject<string | null>;
  selectedClient: ClientRow | null;
  selectedMatter: MatterRow | null;
}

export default function AutomatePanel({ officeReady, tokenRef, selectedClient, selectedMatter }: Props) {
  const [matrixTemplates, setMatrixTemplates] = useState<MatrixTemplate[]>([]);
  const [matrixTemplatesLoading, setMatrixTemplatesLoading] = useState(false);
  const [selectedTemplateId, setSelectedTemplateId] = useState<number | "">("");
  const [templateColumns, setTemplateColumns] = useState<MatrixColumn[]>([]);
  const [templateColumnsLoading, setTemplateColumnsLoading] = useState(false);
  // Variable placement state — tracks how many times each column has been placed in the doc as a content control
  const [insertedCounts, setInsertedCounts] = useState<Record<string, number>>({});
  const [insertError, setInsertError] = useState<string | null>(null);
  // AI auto-detect state
  const [detecting, setDetecting] = useState(false);
  const [detectError, setDetectError] = useState<string | null>(null);
  const [detectedVars, setDetectedVars] = useState<{ column_name: string; matched_text: string }[] | null>(null);
  const [placingVar, setPlacingVar] = useState<string | null>(null);

  // Template create state
  const [showNewTemplateForm, setShowNewTemplateForm] = useState(false);
  const [newTemplateName, setNewTemplateName] = useState("");
  const [newTemplateCreating, setNewTemplateCreating] = useState(false);

  // Column editor state
  const [editingColumnId, setEditingColumnId] = useState<number | null>(null);
  const [editColName, setEditColName] = useState("");
  const [editColInstruction, setEditColInstruction] = useState("");
  const [showAddColumn, setShowAddColumn] = useState(false);
  const [newColName, setNewColName] = useState("");
  const [newColInstruction, setNewColInstruction] = useState("");
  const [newColAdding, setNewColAdding] = useState(false);
  const [suggestingColumns, setSuggestingColumns] = useState(false);
  const [suggestColumnsError, setSuggestColumnsError] = useState<string | null>(null);

  // Fetch Matrix templates when client/matter are selected
  useEffect(() => {
    if (!selectedClient || !selectedMatter) {
      setMatrixTemplates([]);
      setSelectedTemplateId("");
      setTemplateColumns([]);
      setInsertedCounts({}); setDetectedVars(null); setInsertError(null);
      return;
    }
    setMatrixTemplatesLoading(true);
    setMatrixTemplates([]);
    setSelectedTemplateId("");
    setTemplateColumns([]);
    setInsertedCounts({}); setDetectedVars(null); setInsertError(null);
    const headers: HeadersInit = {};
    if (tokenRef.current) headers["Authorization"] = `Bearer ${tokenRef.current}`;
    fetch(
      `/api/matrix/templates?clientNumber=${encodeURIComponent(selectedClient.client_number)}&matterNumber=${encodeURIComponent(selectedMatter.matter_number)}`,
      { headers }
    )
      .then(r => r.ok ? r.json() : { templates: [] })
      .then(data => setMatrixTemplates(data.templates ?? []))
      .catch(() => {})
      .finally(() => setMatrixTemplatesLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedClient, selectedMatter]);

  // Fetch columns when a template is selected
  useEffect(() => {
    if (!selectedTemplateId) { setTemplateColumns([]); setInsertedCounts({}); setDetectedVars(null); return; }
    setTemplateColumnsLoading(true);
    setTemplateColumns([]);
    setInsertedCounts({}); setDetectedVars(null); setInsertError(null);
    const headers: HeadersInit = {};
    if (tokenRef.current) headers["Authorization"] = `Bearer ${tokenRef.current}`;
    fetch(`/api/matrix/templates/${selectedTemplateId}/columns`, { headers })
      .then(r => r.ok ? r.json() : { columns: [] })
      .then(data => setTemplateColumns(data.columns ?? []))
      .catch(() => {})
      .finally(() => setTemplateColumnsLoading(false));
  }, [selectedTemplateId]);

  async function getDocumentText(selectionOnly: boolean): Promise<string> {
    return (window as any).Word.run(async (context: any) => {
      const range = selectionOnly ? context.document.getSelection() : context.document.body;
      range.load("text");
      await context.sync();
      return range.text as string;
    });
  }

  // Wrap a Word range in a content control representing a template variable,
  // styled so it stands out clearly from regular document text.
  async function wrapRangeAsVariable(context: any, range: any, colName: string) {
    const cc = range.insertContentControl();
    cc.tag = `var:${colName}`;
    cc.title = colName;
    cc.appearance = "Tags";
    cc.color = "#2563eb";
    const r = cc.insertText(`«${colName}»`, "Replace");
    try {
      r.font.bold = true;
      r.font.color = "#1D4ED8";
      r.font.highlightColor = "#FDE68A";
    } catch { /* font styling unsupported on this host — content control still applied */ }
    await context.sync();
  }

  // Manual: replace the current selection with a variable content control
  async function handleInsertVariable(colName: string) {
    if (!officeReady) return;
    setInsertError(null);
    try {
      const placed = await (window as any).Word.run(async (context: any) => {
        const sel = context.document.getSelection();
        sel.load("text");
        await context.sync();
        if (!(sel.text as string).trim()) return false;
        await wrapRangeAsVariable(context, sel, colName);
        return true;
      });
      if (!placed) {
        setInsertError("Highlight text in the document first, then click ← to turn it into a variable.");
        setTimeout(() => setInsertError(null), 3500);
        return;
      }
      setInsertedCounts(prev => ({ ...prev, [colName]: (prev[colName] ?? 0) + 1 }));
    } catch (err) {
      setInsertError(err instanceof Error ? err.message : "Could not insert the variable.");
      setTimeout(() => setInsertError(null), 3500);
    }
  }

  // AI: scan document for spans that map to template columns
  async function handleAutoDetect() {
    if (!officeReady || !selectedTemplateId) return;
    setDetecting(true);
    setDetectError(null);
    setDetectedVars(null);

    let docText = "";
    try {
      docText = await getDocumentText(false);
    } catch {
      setDetectError("Could not read the document.");
      setDetecting(false);
      return;
    }
    if (!docText.trim()) {
      setDetectError("The document appears to be empty.");
      setDetecting(false);
      return;
    }

    try {
      const headers: HeadersInit = { "Content-Type": "application/json" };
      if (tokenRef.current) headers["Authorization"] = `Bearer ${tokenRef.current}`;
      const res = await fetch("/api/addin/detect-variables", {
        method: "POST",
        headers,
        body: JSON.stringify({ templateId: selectedTemplateId, documentText: docText }),
      });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error || `Request failed (${res.status})`); }
      const data = await res.json();
      const vars = (data.variables ?? []) as { column_name: string; matched_text: string }[];
      if (vars.length === 0) { setDetectError("No matching variable values found in the document."); }
      setDetectedVars(vars);
    } catch (err) {
      setDetectError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setDetecting(false);
    }
  }

  // Place one detected variable: find its text in the doc and wrap it as a content control
  async function handlePlaceDetected(proposal: { column_name: string; matched_text: string }) {
    if (!officeReady) return;
    const search = proposal.matched_text.slice(0, 255);
    setPlacingVar(proposal.matched_text);
    setInsertError(null);
    try {
      const placed = await (window as any).Word.run(async (context: any) => {
        const results = context.document.body.search(search, { matchCase: false });
        results.load("items");
        await context.sync();
        if (results.items.length === 0) return false;
        await wrapRangeAsVariable(context, results.items[0], proposal.column_name);
        return true;
      });
      if (!placed) {
        setInsertError(`Couldn't locate "${proposal.matched_text.slice(0, 40)}…" in the document.`);
        setTimeout(() => setInsertError(null), 3500);
        return;
      }
      setInsertedCounts(prev => ({ ...prev, [proposal.column_name]: (prev[proposal.column_name] ?? 0) + 1 }));
      setDetectedVars(prev => prev ? prev.filter(v => v !== proposal) : prev);
    } catch (err) {
      setInsertError(err instanceof Error ? err.message : "Could not place the variable.");
      setTimeout(() => setInsertError(null), 3500);
    } finally {
      setPlacingVar(null);
    }
  }

  async function handlePlaceAllDetected() {
    if (!detectedVars) return;
    for (const proposal of [...detectedVars]) {
      await handlePlaceDetected(proposal);
    }
  }

  async function handleCreateTemplate() {
    if (!newTemplateName.trim() || !selectedClient || !selectedMatter) return;
    setNewTemplateCreating(true);
    try {
      const headers: HeadersInit = { "Content-Type": "application/json" };
      if (tokenRef.current) headers["Authorization"] = `Bearer ${tokenRef.current}`;
      const res = await fetch("/api/matrix/templates", {
        method: "POST",
        headers,
        body: JSON.stringify({
          name: newTemplateName.trim(),
          description: "",
          clientId: selectedClient.id,
          matterId: selectedMatter.id,
          clientNumber: selectedClient.client_number,
          matterNumber: selectedMatter.matter_number,
        }),
      });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error || "Failed to create template"); }
      const { id } = await res.json();
      const created: MatrixTemplate = { id, name: newTemplateName.trim(), description: "", column_count: 0 };
      setMatrixTemplates(prev => [...prev, created]);
      setSelectedTemplateId(id);
      setTemplateColumns([]);
      setShowNewTemplateForm(false);
      setNewTemplateName("");
    } catch { /* silent — user can retry */ }
    finally { setNewTemplateCreating(false); }
  }

  async function handleAddColumn() {
    if (!newColName.trim() || !selectedTemplateId) return;
    setNewColAdding(true);
    try {
      const headers: HeadersInit = { "Content-Type": "application/json" };
      if (tokenRef.current) headers["Authorization"] = `Bearer ${tokenRef.current}`;
      const res = await fetch(`/api/matrix/templates/${selectedTemplateId}/columns`, {
        method: "POST",
        headers,
        body: JSON.stringify({ column_name: newColName.trim(), instruction: newColInstruction.trim() || null }),
      });
      if (!res.ok) throw new Error("Failed to add column");
      const { column } = await res.json();
      setTemplateColumns(prev => [...prev, column]);
      setShowAddColumn(false);
      setNewColName("");
      setNewColInstruction("");
    } catch { /* silent */ }
    finally { setNewColAdding(false); }
  }

  async function handleUpdateColumn(colId: number) {
    if (!editColName.trim() || !selectedTemplateId) return;
    try {
      const headers: HeadersInit = { "Content-Type": "application/json" };
      if (tokenRef.current) headers["Authorization"] = `Bearer ${tokenRef.current}`;
      await fetch(`/api/matrix/templates/${selectedTemplateId}/columns/${colId}`, {
        method: "PATCH",
        headers,
        body: JSON.stringify({ column_name: editColName.trim(), instruction: editColInstruction.trim() || null }),
      });
      setTemplateColumns(prev => prev.map(c =>
        c.id === colId ? { ...c, column_name: editColName.trim(), instruction: editColInstruction.trim() || null } : c
      ));
      setEditingColumnId(null);
    } catch { /* silent */ }
  }

  async function handleDeleteColumn(colId: number) {
    if (!selectedTemplateId) return;
    try {
      const headers: HeadersInit = {};
      if (tokenRef.current) headers["Authorization"] = `Bearer ${tokenRef.current}`;
      await fetch(`/api/matrix/templates/${selectedTemplateId}/columns/${colId}`, { method: "DELETE", headers });
      setTemplateColumns(prev => prev.filter(c => c.id !== colId));
    } catch { /* silent */ }
  }

  async function handleSuggestColumns() {
    if (!officeReady || !selectedTemplateId) return;
    setSuggestingColumns(true);
    setSuggestColumnsError(null);
    let docText = "";
    try {
      docText = await getDocumentText(false);
    } catch {
      setSuggestColumnsError("Could not read the document.");
      setSuggestingColumns(false);
      return;
    }
    if (!docText.trim()) {
      setSuggestColumnsError("The document appears to be empty.");
      setSuggestingColumns(false);
      return;
    }
    try {
      const headers: HeadersInit = { "Content-Type": "application/json" };
      if (tokenRef.current) headers["Authorization"] = `Bearer ${tokenRef.current}`;
      const res = await fetch("/api/addin/suggest-columns", {
        method: "POST",
        headers,
        body: JSON.stringify({ documentText: docText }),
      });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error || "Failed to suggest columns"); }
      const { columns: suggested } = await res.json();
      const addHeaders: HeadersInit = { "Content-Type": "application/json" };
      if (tokenRef.current) addHeaders["Authorization"] = `Bearer ${tokenRef.current}`;
      const added: MatrixColumn[] = [];
      for (const col of (suggested as { column_name: string; instruction: string | null }[])) {
        const r = await fetch(`/api/matrix/templates/${selectedTemplateId}/columns`, {
          method: "POST", headers: addHeaders,
          body: JSON.stringify({ column_name: col.column_name, instruction: col.instruction }),
        });
        if (r.ok) { const { column } = await r.json(); added.push(column); }
      }
      setTemplateColumns(prev => [...prev, ...added]);
    } catch (err) {
      setSuggestColumnsError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSuggestingColumns(false);
    }
  }

  const matterRequired = !selectedClient || !selectedMatter;

  return (
        <div className="flex-1 overflow-y-auto">
          {matterRequired ? (
            <p className="text-xs text-amber-600 text-center mt-6 px-4">Select a client and matter above to load templates.</p>
          ) : (
            <div className="p-3 space-y-3">

              {/* Template selector + New button */}
              {!showNewTemplateForm && (
                <div className="flex items-center gap-1.5">
                  <div className="flex-1 min-w-0">
                    {matrixTemplatesLoading ? (
                      <p className="text-xs text-gray-400">Loading templates...</p>
                    ) : (
                      <select
                        value={selectedTemplateId}
                        onChange={e => {
                          setSelectedTemplateId(e.target.value ? Number(e.target.value) : "");
                          setInsertedCounts({}); setDetectedVars(null); setInsertError(null);
                          setEditingColumnId(null);
                          setShowAddColumn(false);
                          setSuggestColumnsError(null);
                        }}
                        className="w-full border border-gray-200 rounded px-2 py-1.5 text-xs text-gray-900 focus:outline-none focus:ring-1 focus:ring-blue-500"
                      >
                        <option value="">— Select a template —</option>
                        {matrixTemplates.map(t => (
                          <option key={t.id} value={t.id}>{t.name}</option>
                        ))}
                      </select>
                    )}
                  </div>
                  <button
                    onClick={() => { setShowNewTemplateForm(true); setNewTemplateName(""); setSelectedTemplateId(""); }}
                    className="flex-shrink-0 text-xs text-blue-600 hover:text-blue-800 font-medium border border-blue-200 px-2 py-1.5 rounded whitespace-nowrap"
                  >
                    + New
                  </button>
                </div>
              )}

              {/* New template form */}
              {showNewTemplateForm && (
                <div className="space-y-2">
                  <p className="text-xs font-semibold text-gray-700">New Template</p>
                  <input
                    type="text"
                    value={newTemplateName}
                    onChange={e => setNewTemplateName(e.target.value)}
                    onKeyDown={e => { if (e.key === "Enter") handleCreateTemplate(); if (e.key === "Escape") setShowNewTemplateForm(false); }}
                    placeholder="Template name..."
                    autoFocus
                    className="w-full border border-gray-200 rounded px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                  <div className="flex gap-1.5">
                    <button
                      onClick={() => setShowNewTemplateForm(false)}
                      className="flex-1 bg-white border border-gray-200 text-gray-600 py-1.5 rounded text-xs font-medium hover:bg-gray-50"
                    >Cancel</button>
                    <button
                      onClick={handleCreateTemplate}
                      disabled={!newTemplateName.trim() || newTemplateCreating}
                      className="flex-1 bg-blue-600 text-white py-1.5 rounded text-xs font-semibold hover:bg-blue-700 disabled:opacity-50"
                    >{newTemplateCreating ? "Creating..." : "Create"}</button>
                  </div>
                </div>
              )}

              {/* Column editor */}
              {selectedTemplateId !== "" && !showNewTemplateForm && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-semibold text-gray-700">Columns</p>
                    <button
                      onClick={handleSuggestColumns}
                      disabled={suggestingColumns || !officeReady}
                      className="text-xs text-indigo-600 hover:text-indigo-800 font-medium disabled:opacity-50 whitespace-nowrap"
                    >
                      {suggestingColumns ? "Suggesting..." : "✨ Suggest from Doc"}
                    </button>
                  </div>

                  {suggestColumnsError && (
                    <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded px-2 py-1.5">{suggestColumnsError}</div>
                  )}

                  {templateColumnsLoading ? (
                    <p className="text-xs text-gray-400">Loading columns...</p>
                  ) : (
                    <div className="space-y-1">
                      {templateColumns.map(col => (
                        editingColumnId === col.id ? (
                          <div key={col.id} className="border border-blue-200 rounded p-2 space-y-1.5 bg-blue-50">
                            <input
                              type="text"
                              value={editColName}
                              onChange={e => setEditColName(e.target.value)}
                              placeholder="Column name"
                              autoFocus
                              className="w-full border border-gray-200 rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
                            />
                            <input
                              type="text"
                              value={editColInstruction}
                              onChange={e => setEditColInstruction(e.target.value)}
                              placeholder="Extraction instruction (optional)"
                              className="w-full border border-gray-200 rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
                            />
                            <div className="flex gap-1">
                              <button onClick={() => setEditingColumnId(null)} className="flex-1 bg-white border border-gray-200 text-gray-600 py-1 rounded text-xs hover:bg-gray-50">Cancel</button>
                              <button onClick={() => handleUpdateColumn(col.id)} disabled={!editColName.trim()} className="flex-1 bg-blue-600 text-white py-1 rounded text-xs font-medium hover:bg-blue-700 disabled:opacity-50">Save</button>
                            </div>
                          </div>
                        ) : (
                          <div key={col.id} className="flex items-center gap-1.5 bg-white border border-gray-100 rounded px-2 py-1.5">
                            <button
                              onClick={() => handleInsertVariable(col.column_name)}
                              disabled={!officeReady}
                              className="flex-shrink-0 text-xs bg-blue-50 text-blue-600 border border-blue-200 rounded px-1.5 py-0.5 font-medium hover:bg-blue-100 disabled:opacity-30"
                              title="Replace the highlighted text in the document with this variable"
                            >→ Insert</button>
                            <div className="flex-1 min-w-0">
                              <p className="text-xs font-medium text-gray-800 truncate">
                                {col.column_name}
                                {(insertedCounts[col.column_name] ?? 0) > 0 && (
                                  <span className="ml-1 text-green-600">✓{insertedCounts[col.column_name] > 1 ? ` ${insertedCounts[col.column_name]}` : ""}</span>
                                )}
                              </p>
                              {col.instruction && <p className="text-xs text-gray-400 truncate">{col.instruction}</p>}
                            </div>
                            <div className="flex gap-1.5 flex-shrink-0">
                              <button
                                onClick={() => { setEditingColumnId(col.id); setEditColName(col.column_name); setEditColInstruction(col.instruction ?? ""); }}
                                className="text-gray-400 hover:text-blue-600 text-xs leading-none"
                                title="Edit column"
                              >✎</button>
                              <button
                                onClick={() => handleDeleteColumn(col.id)}
                                className="text-gray-400 hover:text-red-500 text-xs leading-none"
                                title="Delete column"
                              >×</button>
                            </div>
                          </div>
                        )
                      ))}

                      {/* Add column inline form */}
                      {showAddColumn ? (
                        <div className="border border-gray-200 rounded p-2 space-y-1.5 bg-gray-50">
                          <input
                            type="text"
                            value={newColName}
                            onChange={e => setNewColName(e.target.value)}
                            placeholder="Column name"
                            autoFocus
                            className="w-full border border-gray-200 rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
                          />
                          <input
                            type="text"
                            value={newColInstruction}
                            onChange={e => setNewColInstruction(e.target.value)}
                            placeholder="Extraction instruction (optional)"
                            className="w-full border border-gray-200 rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
                          />
                          <div className="flex gap-1">
                            <button onClick={() => { setShowAddColumn(false); setNewColName(""); setNewColInstruction(""); }} className="flex-1 bg-white border border-gray-200 text-gray-600 py-1 rounded text-xs hover:bg-gray-50">Cancel</button>
                            <button onClick={handleAddColumn} disabled={!newColName.trim() || newColAdding} className="flex-1 bg-blue-600 text-white py-1 rounded text-xs font-medium hover:bg-blue-700 disabled:opacity-50">{newColAdding ? "Adding..." : "Add"}</button>
                          </div>
                        </div>
                      ) : (
                        <button
                          onClick={() => { setShowAddColumn(true); setNewColName(""); setNewColInstruction(""); setEditingColumnId(null); }}
                          className="w-full border border-dashed border-gray-300 text-gray-500 text-xs py-1.5 rounded hover:border-blue-400 hover:text-blue-600 transition-colors"
                        >+ Add Column</button>
                      )}
                    </div>
                  )}

                  {/* Footer: status + AI auto-detect */}
                  {templateColumns.length > 0 && (
                    <div className="pt-2 border-t border-gray-100 space-y-2">
                      {(() => {
                        const placed = templateColumns.filter(c => (insertedCounts[c.column_name] ?? 0) > 0).length;
                        return placed > 0 ? (
                          <p className="text-xs text-gray-500 text-center">{placed} of {templateColumns.length} variables placed</p>
                        ) : (
                          <p className="text-xs text-gray-400 text-center">Highlight text in Word, then click → Insert to turn it into a variable</p>
                        );
                      })()}

                      {insertError && (
                        <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1.5 text-center">{insertError}</p>
                      )}

                      {/* Auto-detect proposals */}
                      {detectedVars && detectedVars.length > 0 && (
                        <div className="space-y-1.5 bg-indigo-50 border border-indigo-100 rounded p-2">
                          <div className="flex items-center justify-between">
                            <p className="text-xs font-semibold text-indigo-800">Detected ({detectedVars.length})</p>
                            <button onClick={handlePlaceAllDetected} className="text-xs text-indigo-600 hover:text-indigo-800 font-medium">Insert all</button>
                          </div>
                          {detectedVars.map((v, i) => (
                            <div key={i} className="bg-white border border-indigo-100 rounded px-2 py-1.5">
                              <p className="text-xs font-medium text-gray-800">{v.column_name}</p>
                              <p className="text-xs text-gray-500 break-words leading-snug mb-1">{v.matched_text}</p>
                              <div className="flex gap-1.5">
                                <button
                                  onClick={() => handlePlaceDetected(v)}
                                  disabled={!officeReady || placingVar === v.matched_text}
                                  className="text-xs bg-indigo-600 text-white px-2 py-0.5 rounded font-medium hover:bg-indigo-700 disabled:opacity-50"
                                >{placingVar === v.matched_text ? "Inserting…" : "Insert"}</button>
                                <button
                                  onClick={() => setDetectedVars(prev => prev ? prev.filter(x => x !== v) : prev)}
                                  className="text-xs border border-gray-200 text-gray-500 px-2 py-0.5 rounded hover:bg-gray-50"
                                >Skip</button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}

                      <button
                        onClick={handleAutoDetect}
                        disabled={!officeReady || detecting}
                        className="w-full bg-indigo-600 text-white py-1.5 rounded-lg text-xs font-semibold hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {detecting ? (
                          <span className="flex items-center justify-center gap-1.5">
                            <span className="w-1 h-1 bg-white rounded-full animate-bounce [animation-delay:-0.3s]" />
                            <span className="w-1 h-1 bg-white rounded-full animate-bounce [animation-delay:-0.15s]" />
                            <span className="w-1 h-1 bg-white rounded-full animate-bounce" />
                            <span>Scanning…</span>
                          </span>
                        ) : "✨ Auto-detect variables"}
                      </button>
                      {detectError && (
                        <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded px-2 py-1">{detectError}</p>
                      )}
                    </div>
                  )}
                </div>
              )}

            </div>
          )}
        </div>
  );
}
