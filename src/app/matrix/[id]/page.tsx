"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter, useParams } from "next/navigation";
import { useAuth } from "@/components/AuthContext";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

interface MatrixTemplate {
  id: number;
  name: string;
  description: string | null;
  client_number: string | null;
  matter_number: string | null;
  column_count: number;
}

interface MatrixTemplateColumn {
  id: number;
  order_num: number;
  column_name: string;
  instruction: string | null;
}

interface SuggestedColumn {
  column_name: string;
  instruction: string | null;
  selected: boolean;
}

export default function MatrixTemplatePage() {
  const { user } = useAuth();
  const router = useRouter();
  const params = useParams();
  const templateId = Number(params.id);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [template, setTemplate] = useState<MatrixTemplate | null>(null);
  const [columns, setColumns] = useState<MatrixTemplateColumn[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Add column form
  const [showAdd, setShowAdd] = useState(false);
  const [addName, setAddName] = useState("");
  const [addInstruction, setAddInstruction] = useState("");
  const [addSaving, setAddSaving] = useState(false);
  const [addError, setAddError] = useState("");

  // Inline edit
  const [editing, setEditing] = useState<{ id: number; column_name: string; instruction: string } | null>(null);
  const [editSaving, setEditSaving] = useState(false);

  // Delete confirm
  const [deleteConfirm, setDeleteConfirm] = useState<number | null>(null);

  // Saved confirmation banner
  const [savedMsg, setSavedMsg] = useState("");
  const savedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  function showSaved(msg = "Changes saved") {
    setSavedMsg(msg);
    if (savedTimer.current) clearTimeout(savedTimer.current);
    savedTimer.current = setTimeout(() => setSavedMsg(""), 3000);
  }

  // Generate from document
  const [generateFile, setGenerateFile] = useState<File | null>(null);
  const [generating, setGenerating] = useState(false);
  const [generateError, setGenerateError] = useState("");
  const [suggestions, setSuggestions] = useState<SuggestedColumn[] | null>(null);
  const [addingSuggestions, setAddingSuggestions] = useState(false);

  const load = useCallback(async () => {
    try {
      const [tRes, cRes] = await Promise.all([
        fetch(`/api/matrix/templates/${templateId}`),
        fetch(`/api/matrix/templates/${templateId}/columns`),
      ]);
      if (!tRes.ok) { setError("Template not found."); return; }
      const { template } = await tRes.json();
      const { columns } = await cRes.json();
      setTemplate(template);
      setColumns(columns);
    } catch {
      setError("Could not load template.");
    } finally {
      setLoading(false);
    }
  }, [templateId]);

  useEffect(() => { load(); }, [load]);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    setAddError("");
    if (!addName.trim()) { setAddError("Column name is required."); return; }
    setAddSaving(true);
    try {
      const res = await fetch(`/api/matrix/templates/${templateId}/columns`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ column_name: addName.trim(), instruction: addInstruction.trim() }),
      });
      if (!res.ok) { const d = await res.json(); setAddError(d.error || "Failed to add."); return; }
      const { column } = await res.json();
      setColumns((prev) => [...prev, column]);
      setTemplate((prev) => prev ? { ...prev, column_count: prev.column_count + 1 } : prev);
      setAddName("");
      setAddInstruction("");
      setShowAdd(false);
      showSaved("Column added");
    } catch {
      setAddError("Failed to add column.");
    } finally {
      setAddSaving(false);
    }
  }

  async function handleEditSave() {
    if (!editing) return;
    if (!editing.column_name.trim()) return;
    setEditSaving(true);
    const res = await fetch(`/api/matrix/templates/${templateId}/columns/${editing.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ column_name: editing.column_name.trim(), instruction: editing.instruction.trim() }),
    });
    if (res.ok) {
      setColumns((prev) =>
        prev.map((c) => c.id === editing.id
          ? { ...c, column_name: editing.column_name.trim(), instruction: editing.instruction.trim() || null }
          : c
        )
      );
      showSaved("Column updated");
    }
    setEditing(null);
    setEditSaving(false);
  }

  async function handleDelete(id: number) {
    const res = await fetch(`/api/matrix/templates/${templateId}/columns/${id}`, { method: "DELETE" });
    if (res.ok) {
      setColumns((prev) => prev.filter((c) => c.id !== id).map((c, i) => ({ ...c, order_num: i })));
      setTemplate((prev) => prev ? { ...prev, column_count: Math.max(0, prev.column_count - 1) } : prev);
      showSaved("Column removed");
    }
    setDeleteConfirm(null);
  }

  const sensors = useSensors(useSensor(PointerSensor));

  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = columns.findIndex((c) => c.id === Number(active.id));
    const newIndex = columns.findIndex((c) => c.id === Number(over.id));
    const newCols = arrayMove(columns, oldIndex, newIndex);
    setColumns(newCols);
    await fetch(`/api/matrix/templates/${templateId}/columns/reorder`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ orderedIds: newCols.map((c) => c.id) }),
    });
  }

  async function handleGenerate() {
    if (!generateFile) return;
    setGenerating(true);
    setGenerateError("");
    setSuggestions(null);
    try {
      const fd = new FormData();
      fd.append("file", generateFile);
      const res = await fetch("/api/matrix/suggest-columns", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) { setGenerateError(data.error || "Failed to analyse file."); return; }
      setSuggestions(data.columns.map((c: { column_name: string; instruction: string | null }) => ({ ...c, selected: true })));
    } catch {
      setGenerateError("Failed to analyse file.");
    } finally {
      setGenerating(false);
    }
  }

  async function handleAddSuggestions() {
    if (!suggestions) return;
    const selected = suggestions.filter((s) => s.selected);
    if (selected.length === 0) return;
    setAddingSuggestions(true);
    try {
      const added: MatrixTemplateColumn[] = [];
      for (const s of selected) {
        const res = await fetch(`/api/matrix/templates/${templateId}/columns`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ column_name: s.column_name, instruction: s.instruction ?? "" }),
        });
        if (res.ok) {
          const { column } = await res.json();
          added.push(column);
        }
      }
      setColumns((prev) => [...prev, ...added]);
      setTemplate((prev) => prev ? { ...prev, column_count: prev.column_count + added.length } : prev);
      setSuggestions(null);
      setGenerateFile(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
      showSaved(`${added.length} column${added.length !== 1 ? "s" : ""} added`);
    } catch {
      setGenerateError("Failed to add some columns.");
    } finally {
      setAddingSuggestions(false);
    }
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0] ?? null;
    setGenerateFile(f);
    setSuggestions(null);
    setGenerateError("");
  }

  if (!user) return null;

  // Extracted to keep JSX clean
  function SortableRow({ col, index }: { col: MatrixTemplateColumn; index: number }) {
    const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: col.id });
    const style = {
      transform: CSS.Transform.toString(transform),
      transition,
      opacity: isDragging ? 0.5 : 1,
    };

    return (
      <div ref={setNodeRef} style={style} className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
        {editing?.id === col.id ? (
          <div className="p-4 space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Column Name</label>
                <input
                  autoFocus
                  value={editing.column_name}
                  onChange={(e) => setEditing({ ...editing, column_name: e.target.value })}
                  maxLength={100}
                  className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-400"
                />
                {editing.column_name.length > 80 && (
                  <p className="text-xs text-right mt-0.5 text-gray-400">{100 - editing.column_name.length} characters remaining</p>
                )}
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Instruction <span className="text-gray-400 font-normal">(optional)</span></label>
                <textarea
                  value={editing.instruction}
                  onChange={(e) => setEditing({ ...editing, instruction: e.target.value })}
                  placeholder="Leave blank if self-explanatory"
                  rows={3}
                  maxLength={500}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-400 resize-none"
                />
                {editing.instruction.length > 480 && (
                  <p className="text-xs text-right mt-0.5 text-gray-400">{500 - editing.instruction.length} characters remaining</p>
                )}
              </div>
            </div>
            <div className="flex gap-2">
              <button onClick={handleEditSave} disabled={editSaving} className="px-3 py-1 bg-blue-600 text-white text-xs font-medium rounded hover:bg-blue-700 disabled:opacity-50">
                {editSaving ? "Saving…" : "Save"}
              </button>
              <button onClick={() => setEditing(null)} className="px-3 py-1 text-xs text-gray-600 hover:text-gray-900">Cancel</button>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-[2rem_1fr_2fr_5rem] gap-3 items-center px-4 py-3">
            <button
              {...attributes}
              {...listeners}
              className="flex flex-col items-center justify-center gap-0.5 cursor-grab active:cursor-grabbing text-gray-300 hover:text-gray-500 transition-colors touch-none"
              title="Drag to reorder"
            >
              <svg className="w-4 h-4" viewBox="0 0 16 16" fill="currentColor">
                <circle cx="5" cy="4" r="1.2" />
                <circle cx="11" cy="4" r="1.2" />
                <circle cx="5" cy="8" r="1.2" />
                <circle cx="11" cy="8" r="1.2" />
                <circle cx="5" cy="12" r="1.2" />
                <circle cx="11" cy="12" r="1.2" />
              </svg>
              <span className="text-xs text-gray-300 leading-none">{index + 1}</span>
            </button>
            <p className="text-sm font-medium text-gray-900">{col.column_name}</p>
            <p className="text-sm text-gray-500 truncate">{col.instruction || <span className="text-gray-300 italic">None</span>}</p>
            <div className="flex items-center justify-end gap-1">
              <button onClick={() => setEditing({ id: col.id, column_name: col.column_name, instruction: col.instruction ?? "" })} className="p-1.5 text-gray-400 hover:text-gray-600 rounded transition-colors" title="Edit">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
              </button>
              <button onClick={() => setDeleteConfirm(col.id)} className="p-1.5 text-gray-300 hover:text-red-500 rounded transition-colors" title="Delete">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
              </button>
            </div>
          </div>
        )}

        {deleteConfirm === col.id && (
          <div className="px-4 py-3 bg-red-50 border-t border-red-100 flex items-center gap-3">
            <p className="text-sm text-gray-700 flex-1">Remove <strong>{col.column_name}</strong>?</p>
            <button onClick={() => handleDelete(col.id)} className="px-3 py-1 text-sm bg-red-600 text-white rounded hover:bg-red-700">Remove</button>
            <button onClick={() => setDeleteConfirm(null)} className="px-3 py-1 text-sm text-gray-600 hover:text-gray-900">Cancel</button>
          </div>
        )}
      </div>
    );
  }

  if (loading) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-8">
        <div className="h-8 w-48 bg-gray-100 rounded animate-pulse mb-6" />
        <div className="space-y-3">{[1, 2, 3].map((i) => <div key={i} className="h-16 bg-gray-100 rounded-xl animate-pulse" />)}</div>
      </div>
    );
  }

  if (error || !template) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-8">
        <p className="text-red-600">{error || "Template not found."}</p>
        <button onClick={() => router.push("/matrix")} className="mt-4 text-sm text-blue-600 hover:underline">Back to Matrix</button>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      {/* Back */}
      <button
        onClick={() => router.push("/matrix")}
        className="flex items-center gap-1 text-sm font-semibold text-gray-700 hover:text-gray-900 mb-6 transition-colors"
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
        </svg>
        Back to Matrix
      </button>

      {/* Saved banner */}
      {savedMsg && (
        <div className="mb-4 flex items-center gap-2 px-4 py-2.5 bg-green-50 border border-green-200 rounded-lg text-sm text-green-700">
          <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
          {savedMsg}
        </div>
      )}

      {/* Header */}
      <div className="flex items-start justify-between mb-2">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{template.name}</h1>
          {template.description && <p className="text-sm text-gray-500 mt-0.5">{template.description}</p>}
          {(template.client_number || template.matter_number) && (
            <p className="text-xs text-gray-400 mt-1">
              {template.client_number} {template.matter_number ? `/ ${template.matter_number}` : ""}
            </p>
          )}
        </div>
        {!showAdd && (
          <button
            onClick={() => { setShowAdd(true); setAddName(""); setAddInstruction(""); setAddError(""); }}
            className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors shrink-0"
          >
            + Add Column
          </button>
        )}
      </div>
      <p className="text-xs text-gray-400 mb-6">{columns.length} {columns.length === 1 ? "column" : "columns"}</p>

      {/* ── Generate from document ─────────────────────────────── */}
      <div className="mb-6 bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
        <p className="text-sm font-semibold text-gray-700 mb-1">Generate Columns from a Document</p>
        <p className="text-xs text-gray-500 mb-3">
          Upload a sample document and the AI will suggest column names based on the fields it contains.
          You can review and edit the suggestions before adding them.
        </p>

        <div className="flex items-center gap-3 flex-wrap">
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,.doc,.docx,.xlsx,.txt,.csv,.md"
            onChange={handleFileChange}
            className="text-sm text-gray-600 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border file:border-gray-300 file:text-xs file:font-medium file:text-gray-700 file:bg-white hover:file:bg-gray-50 file:cursor-pointer"
          />
          <button
            onClick={handleGenerate}
            disabled={!generateFile || generating}
            className="px-4 py-1.5 bg-gray-800 text-white text-sm font-medium rounded-lg hover:bg-gray-700 disabled:opacity-40 transition-colors"
          >
            {generating ? "Analysing…" : "Analyse Document"}
          </button>
        </div>

        {generateError && <p className="text-sm text-red-600 mt-2">{generateError}</p>}

        {/* Suggestions review */}
        {suggestions && (
          <div className="mt-4 pt-4 border-t border-gray-100">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide">
                {suggestions.filter((s) => s.selected).length} of {suggestions.length} suggestions selected
              </p>
              <div className="flex gap-3 text-xs">
                <button onClick={() => setSuggestions((prev) => prev?.map((s) => ({ ...s, selected: true })) ?? null)} className="text-blue-600 hover:underline">All</button>
                <button onClick={() => setSuggestions((prev) => prev?.map((s) => ({ ...s, selected: false })) ?? null)} className="text-gray-500 hover:underline">None</button>
              </div>
            </div>
            <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
              {suggestions.map((s, i) => (
                <div
                  key={i}
                  className={`flex items-start gap-3 p-2.5 rounded-lg border transition-colors ${s.selected ? "border-blue-200 bg-blue-50" : "border-gray-200 bg-gray-50 opacity-60"}`}
                >
                  <input
                    type="checkbox"
                    checked={s.selected}
                    onChange={(e) => setSuggestions((prev) => prev?.map((x, j) => j === i ? { ...x, selected: e.target.checked } : x) ?? null)}
                    className="mt-0.5 h-4 w-4 rounded border-gray-300 text-blue-600"
                  />
                  <div className="flex-1 min-w-0">
                    <input
                      value={s.column_name}
                      onChange={(e) => setSuggestions((prev) => prev?.map((x, j) => j === i ? { ...x, column_name: e.target.value } : x) ?? null)}
                      className="w-full text-sm font-medium text-gray-900 bg-transparent border-b border-transparent hover:border-gray-300 focus:border-blue-400 focus:outline-none pb-0.5"
                    />
                    {s.instruction && (
                      <input
                        value={s.instruction}
                        onChange={(e) => setSuggestions((prev) => prev?.map((x, j) => j === i ? { ...x, instruction: e.target.value } : x) ?? null)}
                        className="w-full text-xs text-gray-500 bg-transparent border-b border-transparent hover:border-gray-300 focus:border-blue-400 focus:outline-none mt-0.5"
                      />
                    )}
                  </div>
                </div>
              ))}
            </div>
            <div className="flex gap-2 mt-3">
              <button
                onClick={handleAddSuggestions}
                disabled={addingSuggestions || suggestions.filter((s) => s.selected).length === 0}
                className="px-4 py-1.5 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
              >
                {addingSuggestions ? "Adding…" : `Add ${suggestions.filter((s) => s.selected).length} Column${suggestions.filter((s) => s.selected).length !== 1 ? "s" : ""}`}
              </button>
              <button
                onClick={() => { setSuggestions(null); setGenerateFile(null); if (fileInputRef.current) fileInputRef.current.value = ""; }}
                className="px-4 py-1.5 text-sm text-gray-600 hover:text-gray-900 transition-colors"
              >
                Discard
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ── Manual add form ────────────────────────────────────── */}
      {showAdd && (
        <form onSubmit={handleAdd} className="mb-5 bg-white border border-blue-200 rounded-xl p-4 shadow-sm">
          <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">New Column</h2>
          {addError && <p className="text-sm text-red-600 mb-2">{addError}</p>}
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Column Name</label>
              <input
                autoFocus
                type="text"
                value={addName}
                onChange={(e) => setAddName(e.target.value)}
                placeholder="e.g. Governing Law"
                maxLength={100}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-400"
              />
              {addName.length > 80 && (
                <p className="text-xs text-right mt-0.5 text-gray-400">{100 - addName.length} characters remaining</p>
              )}
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                Extraction Instruction <span className="text-gray-400 font-normal">(optional)</span>
              </label>
              <textarea
                value={addInstruction}
                onChange={(e) => setAddInstruction(e.target.value)}
                placeholder="What should be extracted? Leave blank if self-explanatory."
                rows={2}
                maxLength={500}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-400 resize-none"
              />
              {addInstruction.length > 480 && (
                <p className="text-xs text-right mt-0.5 text-gray-400">{500 - addInstruction.length} characters remaining</p>
              )}
            </div>
          </div>
          <div className="flex gap-2 mt-3">
            <button type="submit" disabled={addSaving} className="px-4 py-1.5 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors">
              {addSaving ? "Adding…" : "Add Column"}
            </button>
            <button type="button" onClick={() => setShowAdd(false)} className="px-4 py-1.5 text-sm text-gray-600 hover:text-gray-900 transition-colors">Cancel</button>
          </div>
        </form>
      )}

      {/* ── Column list ────────────────────────────────────────── */}
      {columns.length === 0 ? (
        <div className="text-center py-12 text-gray-400 bg-white border border-gray-200 rounded-xl">
          <p className="text-base font-medium">No columns yet</p>
          <p className="text-sm mt-1">Generate from a document above or add columns manually</p>
        </div>
      ) : (
        <div className="space-y-2">
          <div className="grid grid-cols-[2rem_1fr_2fr_5rem] gap-3 px-4 py-1">
            <span />
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Column</span>
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Instruction</span>
            <span />
          </div>
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={columns.map((c) => c.id)} strategy={verticalListSortingStrategy}>
              {columns.map((col, index) => (
                <SortableRow key={col.id} col={col} index={index} />
              ))}
            </SortableContext>
          </DndContext>
        </div>
      )}

    </div>
  );
}
