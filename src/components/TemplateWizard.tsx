"use client";

import { useState, useCallback, useEffect } from "react";

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
  isManual: boolean;
  isFromLibrary: boolean;
  showLibraryPicker: boolean;
  isSuggested: boolean;
  suggestedMatch: LibraryVariable | null;
}

interface LibraryVariable {
  id: number;
  name: string;
  type: string;
  description: string | null;
  format: string | null;
  is_manual: number;
}

interface ManageEntry {
  id: number | null;
  name: string;
  newName: string;
  count: number;
  type: string;
  format: string | null;
}

interface UndoEntry {
  name: string;
  color: string;
  texts: string[];
}

type Mode = "create" | "manage" | "fill";
type CreateStep = "idle" | "scanning" | "review" | "applying" | "done";
type ManageStep = "idle" | "loading" | "list" | "saving";
type FillStep = "idle" | "loading" | "form" | "filling" | "done";

interface FillVariable {
  name: string;
  type: string;
  format: string | null;
  value: string;
  isAutoFilled: boolean;
  isManual: boolean;
}

interface ClientRow { id: number; client_number: string; name: string }
interface MatterRow { id: number; matter_number: string; description: string }

// ── Format options (shown in Manage tab per variable type) ───────────────────

const FORMAT_OPTIONS: Record<string, { value: string; label: string; example: string }[]> = {
  date: [
    { value: "as-entered", label: "As entered", example: "" },
    { value: "long",       label: "Long form",          example: "August 12, 2026" },
    { value: "dmy",        label: "Day Month Year",     example: "12 August 2026" },
    { value: "mmddyyyy",   label: "Short MM/DD/YYYY",   example: "08/12/2026" },
    { value: "ddmmyyyy",   label: "Short DD/MM/YYYY",   example: "12/08/2026" },
    { value: "monthyear",  label: "Month and Year",     example: "August 2026" },
  ],
  amount: [
    { value: "as-entered",       label: "As entered",         example: "" },
    { value: "currency",         label: "Currency ($)",       example: "$1,000.00" },
    { value: "currency-nocents", label: "Currency, no cents", example: "$1,000" },
    { value: "number",           label: "Number only",        example: "1,000.00" },
    { value: "words-figure",     label: "Words + figure",     example: "One Thousand Dollars ($1,000.00)" },
  ],
  person: [
    { value: "as-entered", label: "As entered", example: "" },
    { value: "title-case", label: "Title Case", example: "John Smith" },
    { value: "uppercase",  label: "UPPERCASE",  example: "JOHN SMITH" },
    { value: "lowercase",  label: "lowercase",  example: "john smith" },
  ],
  org: [
    { value: "as-entered", label: "As entered",       example: "" },
    { value: "title-case", label: "Title Case",       example: "Acme Corporation" },
    { value: "uppercase",  label: "UPPERCASE",        example: "ACME CORPORATION" },
    { value: "lowercase",  label: "lowercase",        example: "acme corporation" },
  ],
};

function numberToWords(n: number): string {
  const ones = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine",
    "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"];
  const tens = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];
  function convert(num: number): string {
    if (num === 0) return "";
    if (num < 20) return ones[num];
    if (num < 100) return tens[Math.floor(num / 10)] + (num % 10 ? " " + ones[num % 10] : "");
    if (num < 1000) return ones[Math.floor(num / 100)] + " Hundred" + (num % 100 ? " " + convert(num % 100) : "");
    if (num < 1_000_000) return convert(Math.floor(num / 1000)) + " Thousand" + (num % 1000 ? " " + convert(num % 1000) : "");
    if (num < 1_000_000_000) return convert(Math.floor(num / 1_000_000)) + " Million" + (num % 1_000_000 ? " " + convert(num % 1_000_000) : "");
    return convert(Math.floor(num / 1_000_000_000)) + " Billion" + (num % 1_000_000_000 ? " " + convert(num % 1_000_000_000) : "");
  }
  const dollars = Math.floor(Math.abs(n));
  const cents = Math.round((Math.abs(n) - dollars) * 100);
  return `${convert(dollars) || "Zero"} Dollars${cents > 0 ? ` and ${cents}/100` : " and No/100"}`;
}

function applyFormat(raw: string, type: string, format: string | null): string {
  if (!format || format === "as-entered" || !raw.trim()) return raw;

  if (type === "date") {
    const d = new Date(raw);
    if (isNaN(d.getTime())) return raw;
    // Adjust for timezone so date-only strings (2026-08-12) don't shift a day.
    const utc = new Date(d.getTime() + d.getTimezoneOffset() * 60000);
    switch (format) {
      case "long":      return utc.toLocaleDateString("en-US", { month: "long",    day: "numeric", year: "numeric" });
      case "dmy":       return utc.toLocaleDateString("en-GB", { day: "numeric",   month: "long",  year: "numeric" });
      case "mmddyyyy":  return utc.toLocaleDateString("en-US", { month: "2-digit", day: "2-digit", year: "numeric" });
      case "ddmmyyyy":  return utc.toLocaleDateString("en-GB", { day: "2-digit",   month: "2-digit", year: "numeric" });
      case "monthyear": return utc.toLocaleDateString("en-US", { month: "long",    year: "numeric" });
    }
  }

  if (type === "amount") {
    const num = parseFloat(raw.replace(/[$,\s]/g, ""));
    if (isNaN(num)) return raw;
    switch (format) {
      case "currency":         return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(num);
      case "currency-nocents": return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(num);
      case "number":           return new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(num);
      case "words-figure":     return `${numberToWords(num)} (${new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(num)})`;
    }
  }

  if (type === "person" || type === "org") {
    switch (format) {
      case "title-case": return raw.replace(/\w\S*/g, w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase());
      case "uppercase":  return raw.toUpperCase();
      case "lowercase":  return raw.toLowerCase();
    }
  }

  return raw;
}

function getValidationError(value: string, type: string, format: string | null): string | null {
  if (!value.trim()) return null;           // empty fields are fine — just unfilled
  if (!format || format === "as-entered") return null; // no format = no constraint

  if (type === "date") {
    const d = new Date(value);
    if (isNaN(d.getTime())) return "Not a recognisable date";
  }

  if (type === "amount") {
    const num = parseFloat(value.replace(/[$,\s]/g, ""));
    if (isNaN(num)) return "Enter a number";
  }

  return null;
}

const TYPE_LABELS: Record<string, string> = {
  person: "Person", org: "Organisation", date: "Date",
  amount: "Amount", address: "Address", reference: "Reference", other: "Other",
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

function typeToColour(type: string): string {
  const map: Record<string, string> = {
    person: "#0078d4", org: "#8764b8", date: "#ca5010",
    amount: "#107c10", address: "#e3008c", reference: "#767676", other: "#767676",
  };
  return map[type] ?? "#767676";
}

interface Props {
  officeReady: boolean;
  tokenRef: React.MutableRefObject<string | null>;
  selectedClient: ClientRow | null;
  selectedMatter: MatterRow | null;
}

export default function TemplateWizard({ officeReady, tokenRef, selectedClient, selectedMatter }: Props) {
  const [mode, setMode] = useState<Mode>("create");

  // Variable library
  const [library, setLibrary] = useState<LibraryVariable[]>([]);

  // Create mode
  const [step, setStep] = useState<CreateStep>("idle");
  const [variables, setVariables] = useState<WizardVariable[]>([]);
  const [createError, setCreateError] = useState<string | null>(null);
  const [applyProgress, setApplyProgress] = useState<{ current: number; total: number; label: string } | null>(null);
  const [appliedCount, setAppliedCount] = useState(0);

  // Manage mode
  const [manageStep, setManageStep] = useState<ManageStep>("idle");
  const [entries, setEntries] = useState<ManageEntry[]>([]);
  const [manageError, setManageError] = useState<string | null>(null);
  const [lastDeleted, setLastDeleted] = useState<UndoEntry | null>(null);

  // Fill mode
  const [fillStep, setFillStep] = useState<FillStep>("idle");
  const [fillVars, setFillVars] = useState<FillVariable[]>([]);
  const [fillError, setFillError] = useState<string | null>(null);
  const [filledCount, setFilledCount] = useState(0);

  // ── Helpers ──────────────────────────────────────────────────────────────

  async function auditLog(action: string, variableNames: string[]) {
    try {
      const headers: HeadersInit = { "Content-Type": "application/json" };
      if (tokenRef.current) headers["Authorization"] = `Bearer ${tokenRef.current}`;
      await fetch("/api/addin/template-log", {
        method: "POST",
        headers,
        body: JSON.stringify({
          action,
          variables: variableNames,
          clientNumber: selectedClient?.client_number ?? null,
          matterNumber: selectedMatter?.matter_number ?? null,
        }),
      });
    } catch { /* non-blocking */ }
  }

  // ── Library ──────────────────────────────────────────────────────────────

  const loadLibrary = useCallback(async () => {
    if (!selectedClient || !selectedMatter) return;
    try {
      const params = new URLSearchParams({
        clientNumber: selectedClient.client_number,
        matterNumber: selectedMatter.matter_number,
      });
      const headers: HeadersInit = {};
      if (tokenRef.current) headers["Authorization"] = `Bearer ${tokenRef.current}`;
      const res = await fetch(`/api/template-variables?${params}`, { headers });
      if (res.ok) setLibrary(await res.json());
    } catch { /* non-blocking */ }
  }, [tokenRef, selectedClient, selectedMatter]);

  // Load library once on mount
  useEffect(() => { loadLibrary(); }, [loadLibrary]);

  function normalize(s: string) {
    return s.toLowerCase().replace(/[^a-z0-9]/g, "");
  }

  function splitWords(s: string): string[] {
    return s
      .replace(/([a-z])([A-Z])/g, "$1 $2")
      .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter(Boolean);
  }

  function libSimilarity(a: string, b: string): number {
    const na = normalize(a);
    const nb = normalize(b);
    if (na === nb) return 1.0;
    if (na.includes(nb) || nb.includes(na)) return 0.85;
    const wa = new Set(splitWords(a));
    const wb = new Set(splitWords(b));
    const intersection = [...wa].filter(w => wb.has(w)).length;
    const union = new Set([...splitWords(a), ...splitWords(b)]).size;
    return union === 0 ? 0 : intersection / union;
  }

  function findBestLibraryMatch(suggestedName: string): { exact: LibraryVariable | null; suggested: LibraryVariable | null } {
    let exact: LibraryVariable | null = null;
    let best: { v: LibraryVariable; score: number } | null = null;
    for (const v of library) {
      const score = libSimilarity(suggestedName, v.name);
      if (score === 1.0) { exact = v; break; }
      if (score >= 0.5 && score > (best?.score ?? 0)) best = { v, score };
    }
    return { exact, suggested: exact ? null : (best?.v ?? null) };
  }

  // ── Create mode ──────────────────────────────────────────────────────────

  const handleScan = useCallback(async () => {
    if (!officeReady) return;
    setStep("scanning");
    setCreateError(null);

    let docText = "";
    try {
      docText = await (window as any).Word.run(async (context: any) => {
        const body = context.document.body;
        body.load("text");
        await context.sync();
        return body.text as string;
      });
    } catch {
      setCreateError("Could not read the document. Make sure a Word document is open.");
      setStep("idle");
      return;
    }

    if (!docText.trim()) {
      setCreateError("The document appears to be empty.");
      setStep("idle");
      return;
    }

    try {
      const headers: HeadersInit = { "Content-Type": "application/json" };
      if (tokenRef.current) headers["Authorization"] = `Bearer ${tokenRef.current}`;
      const res = await fetch("/api/addin/template-detect", {
        method: "POST",
        headers,
        body: JSON.stringify({
          text: docText,
          clientName: selectedClient?.name ?? null,
          clientNumber: selectedClient?.client_number ?? null,
          matterDescription: selectedMatter?.description ?? null,
          matterNumber: selectedMatter?.matter_number ?? null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);

      const detected: DetectedVariable[] = data.variables ?? [];
      if (detected.length === 0) {
        setCreateError("No variables were detected. The document may already be a template, or it may not contain matter-specific data.");
        setStep("idle");
        return;
      }

      setVariables(detected.map(v => {
        const { exact, suggested } = findBestLibraryMatch(v.suggestedName);
        return {
          ...v,
          name: exact ? exact.name : v.suggestedName,
          enabled: true,
          isManual: exact ? exact.is_manual === 1 : false,
          isFromLibrary: !!exact,
          showLibraryPicker: false,
          isSuggested: !exact && !!suggested,
          suggestedMatch: !exact ? suggested : null,
        };
      }));
      setStep("review");
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : "Something went wrong");
      setStep("idle");
    }
  }, [officeReady, tokenRef, selectedClient, selectedMatter, library]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleApply = useCallback(async () => {
    const toApply = variables.filter(v => v.enabled && v.name.trim());
    if (toApply.length === 0) return;

    setStep("applying");
    setCreateError(null);
    setApplyProgress({ current: 0, total: toApply.length, label: "" });
    let applied = 0;

    // Pre-pass: remove existing controls for these tags so re-applying is idempotent.
    try {
      await (window as any).Word.run(async (context: any) => {
        const tagSet = new Set(toApply.map(v => v.name));
        const existing = context.document.contentControls;
        existing.load("items");
        await context.sync();
        for (const cc of existing.items) cc.load("tag");
        await context.sync();
        for (const cc of existing.items) {
          if (tagSet.has(cc.tag)) {
            cc.cannotDelete = false;
            cc.delete(true); // remove wrapper, keep text
          }
        }
        await context.sync();
      });
    } catch { /* non-blocking */ }

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
            // Load parent control info so we can skip ranges already inside a control
            // (prevents nesting when one occurrence text is a substring of another).
            for (const range of results.items) range.load("parentContentControlOrNullObject");
            await context.sync();
            for (const range of results.items) {
              if (!range.parentContentControlOrNullObject.isNullObject) continue; // skip nested
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
      } catch { /* skip and continue */ }
    }

    await auditLog("CreateTemplate (Word)", toApply.map(v => v.name));

    // Save confirmed variables scoped to this user + client/matter
    try {
      const headers: HeadersInit = { "Content-Type": "application/json" };
      if (tokenRef.current) headers["Authorization"] = `Bearer ${tokenRef.current}`;
      await fetch("/api/template-variables", {
        method: "POST",
        headers,
        body: JSON.stringify({
          variables: toApply.map(v => ({
            name: v.name.trim(),
            type: v.type,
            description: v.description || null,
            isManual: v.isManual,
          })),
          clientNumber: selectedClient?.client_number ?? "",
          matterNumber: selectedMatter?.matter_number ?? "",
        }),
      });
      await loadLibrary();
    } catch { /* non-blocking */ }

    setAppliedCount(applied);
    setStep("done");
    setApplyProgress(null);
  }, [variables, selectedClient, selectedMatter]); // eslint-disable-line react-hooks/exhaustive-deps

  function handleCreateReset() {
    setStep("idle");
    setVariables([]);
    setCreateError(null);
    setApplyProgress(null);
    setAppliedCount(0);
    loadLibrary(); // refresh in case new variables were added
  }

  function updateVariable(index: number, patch: Partial<WizardVariable>) {
    setVariables(prev => prev.map((v, i) => i === index ? { ...v, ...patch } : v));
  }

  // ── Manage mode ──────────────────────────────────────────────────────────

  const handleLoadControls = useCallback(async () => {
    if (!officeReady) return;
    setManageStep("loading");
    setManageError(null);

    try {
      const grouped = await (window as any).Word.run(async (context: any) => {
        const controls = context.document.contentControls;
        controls.load("items");
        await context.sync();

        if (controls.items.length === 0) return {};

        for (const cc of controls.items) cc.load("title,tag");
        await context.sync();

        const map: Record<string, number> = {};
        for (const cc of controls.items) {
          const key = cc.tag || cc.title || "(unnamed)";
          map[key] = (map[key] ?? 0) + 1;
        }
        return map;
      });

      const names = Object.keys(grouped);
      if (names.length === 0) {
        setManageError("No content controls found in this document. Use Create to add template fields first.");
        setManageStep("idle");
        return;
      }

      setEntries(names.sort().map(name => {
        const lib = library.find(l => normalize(l.name) === normalize(name)); // eslint-disable-line react-hooks/exhaustive-deps
        return { id: lib?.id ?? null, name, newName: name, count: grouped[name], type: lib?.type ?? "other", format: lib?.format ?? null };
      }));
      setManageStep("list");
    } catch {
      setManageError("Could not read content controls. Make sure a Word document is open.");
      setManageStep("idle");
    }
  }, [officeReady]);

  const handleSaveRenames = useCallback(async () => {
    const dirty = entries.filter(e => e.newName.trim() && e.newName !== e.name);
    if (dirty.length === 0) return;

    setManageStep("saving");
    try {
      await (window as any).Word.run(async (context: any) => {
        const controls = context.document.contentControls;
        controls.load("items");
        await context.sync();
        for (const cc of controls.items) cc.load("tag,title");
        await context.sync();

        for (const cc of controls.items) {
          const match = dirty.find(e => (cc.tag || cc.title) === e.name);
          if (match) {
            cc.title = match.newName.trim();
            cc.tag = match.newName.trim();
            cc.placeholderText = `{{${match.newName.trim()}}}`;
          }
        }
        await context.sync();
      });

      await auditLog("RenameVariable (Word)", dirty.map(e => `${e.name} → ${e.newName}`));
      // Reload the updated list
      await handleLoadControls();
    } catch {
      setManageError("Failed to apply renames.");
      setManageStep("list");
    }
  }, [entries, handleLoadControls]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleDeleteGroup = useCallback(async (name: string) => {
    try {
      // Capture text + color before deleting so we can undo
      const { texts, color } = await (window as any).Word.run(async (context: any) => {
        const controls = context.document.contentControls;
        controls.load("items");
        await context.sync();
        for (const cc of controls.items) cc.load("tag,title,text,color");
        await context.sync();
        const result: string[] = [];
        let savedColor = "#767676";
        for (const cc of controls.items) {
          if ((cc.tag || cc.title) === name) {
            result.push(cc.text);
            savedColor = cc.color || savedColor;
          }
        }
        return { texts: result, color: savedColor };
      });

      await (window as any).Word.run(async (context: any) => {
        const controls = context.document.contentControls;
        controls.load("items");
        await context.sync();
        for (const cc of controls.items) cc.load("tag,title");
        await context.sync();
        for (const cc of controls.items) {
          if ((cc.tag || cc.title) === name) cc.delete(false);
        }
        await context.sync();
      });

      setLastDeleted({ name, color, texts });
      await auditLog("DeleteVariable (Word)", [name]);
      setEntries(prev => prev.filter(e => e.name !== name));
    } catch {
      setManageError(`Failed to remove "${name}".`);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleUndo = useCallback(async () => {
    if (!lastDeleted) return;
    try {
      await (window as any).Word.run(async (context: any) => {
        const body = context.document.body;
        for (const text of lastDeleted.texts) {
          if (!text.trim()) continue;
          const results = body.search(text, { matchCase: true, matchWholeWord: false });
          results.load("items");
          await context.sync();
          for (const range of results.items) {
            const cc = range.insertContentControl();
            cc.title = lastDeleted.name;
            cc.tag = lastDeleted.name;
            cc.placeholderText = `{{${lastDeleted.name}}}`;
            cc.appearance = "Tags";
            cc.color = lastDeleted.color;
          }
          await context.sync();
        }
      });
      setLastDeleted(null);
      await handleLoadControls();
    } catch {
      setManageError("Undo failed — the text may have been modified.");
      setLastDeleted(null);
    }
  }, [lastDeleted, handleLoadControls]);

  function updateEntry(index: number, newName: string) {
    setEntries(prev => prev.map((e, i) => i === index ? { ...e, newName } : e));
  }

  const handleFormatChange = useCallback(async (index: number, format: string | null) => {
    const entry = entries[index];
    if (!entry.id) return;
    setEntries(prev => prev.map((e, i) => i === index ? { ...e, format } : e));
    try {
      const headers: HeadersInit = { "Content-Type": "application/json" };
      if (tokenRef.current) headers["Authorization"] = `Bearer ${tokenRef.current}`;
      await fetch("/api/template-variables", {
        method: "PATCH",
        headers,
        body: JSON.stringify({ id: entry.id, format }),
      });
    } catch { /* non-blocking */ }
  }, [entries, tokenRef]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Fill mode ─────────────────────────────────────────────────────────────

  function getAutoFill(name: string): string | null {
    const n = normalize(name);
    if (["clientname", "clientfullname", "clientorg", "clientorganisation"].includes(n) || n.startsWith("clientname"))
      return selectedClient?.name ?? null;
    if (["clientnumber", "clientno", "clientcode"].includes(n))
      return selectedClient?.client_number ?? null;
    if (["mattername", "matterdescription", "matterdesc", "mattersubject", "matterdescription"].includes(n) || n.startsWith("mattername"))
      return selectedMatter?.description ?? null;
    if (["matternumber", "matterno", "mattercode"].includes(n))
      return selectedMatter?.matter_number ?? null;
    return null;
  }

  const handleLoadFill = useCallback(async () => {
    if (!officeReady) return;
    setFillStep("loading");
    setFillError(null);
    try {
      const names: string[] = await (window as any).Word.run(async (context: any) => {
        const controls = context.document.contentControls;
        controls.load("items");
        await context.sync();
        if (controls.items.length === 0) return [];
        for (const cc of controls.items) cc.load("tag,title");
        await context.sync();
        const seen = new Set<string>();
        const result: string[] = [];
        for (const cc of controls.items) {
          const n = cc.tag || cc.title || "";
          if (n && !seen.has(n)) { seen.add(n); result.push(n); }
        }
        return result.sort();
      });

      if (names.length === 0) {
        setFillError("No content controls found. Use Create to build a template first.");
        setFillStep("idle");
        return;
      }

      setFillVars(names.map(name => {
        const libMatch = library.find(l => normalize(l.name) === normalize(name));
        const autoVal = getAutoFill(name);
        return {
          name,
          type: libMatch?.type ?? "other",
          format: libMatch?.format ?? null,
          value: autoVal ?? "",
          isAutoFilled: !!autoVal,
          isManual: libMatch ? libMatch.is_manual === 1 : false,
        };
      }));
      setFillStep("form");
    } catch {
      setFillError("Could not read document. Make sure a Word document is open.");
      setFillStep("idle");
    }
  }, [officeReady, library, selectedClient, selectedMatter]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleFillDocument = useCallback(async () => {
    const toFill = fillVars.filter(v => v.value.trim());
    if (toFill.length === 0) return;
    setFillStep("filling");
    setFillError(null);
    let filled = 0;
    const errors: string[] = [];

    // Pre-pass: unlock ALL content controls in the document so that nested
    // controls (inner control inside a still-locked outer control) can be edited.
    try {
      await (window as any).Word.run(async (context: any) => {
        const allCCs = context.document.contentControls;
        allCCs.load("items");
        await context.sync();
        for (const cc of allCCs.items) {
          cc.cannotEdit = false;
          cc.cannotDelete = false;
        }
        await context.sync();
      });
    } catch { /* non-blocking */ }

    // Process each variable in its own Word.run to avoid position-shift conflicts.
    // Two-phase per variable: replace content → remove wrapper.
    for (const match of toFill) {
      try {
        await (window as any).Word.run(async (context: any) => {
          // Phase 1: replace content inside each control with the filled value
          const ccs1 = context.document.contentControls.getByTag(match.name);
          ccs1.load("items");
          await context.sync();
          if (ccs1.items.length === 0) return;
          const formatted = applyFormat(match.value, match.type, match.format);
          for (const cc of ccs1.items) {
            cc.getRange("Content").insertText(formatted, "Replace");
          }
          await context.sync();

          // Phase 2: remove control wrapper, keeping the filled text
          const ccs2 = context.document.contentControls.getByTag(match.name);
          ccs2.load("items");
          await context.sync();
          for (const cc of ccs2.items) {
            cc.delete(true); // true = keep content (our filled value)
          }
          await context.sync();
        });
        filled++;
      } catch (err) {
        errors.push(`${match.name}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    await auditLog("FillTemplate (Word)", toFill.map(v => v.name));
    setFilledCount(filled);
    if (errors.length > 0 && filled === 0) {
      setFillError(`Fill failed: ${errors[0]}`);
      setFillStep("form");
    } else {
      if (errors.length > 0) setFillError(`${filled} filled, ${errors.length} skipped.`);
      setFillStep("done");
    }
  }, [fillVars]); // eslint-disable-line react-hooks/exhaustive-deps

  function updateFillVar(index: number, value: string) {
    setFillVars(prev => prev.map((v, i) => i === index ? { ...v, value, isAutoFilled: false } : v));
  }

  const dirtyCount = entries.filter(e => e.newName.trim() && e.newName !== e.name).length;
  const enabledCount = variables.filter(v => v.enabled).length;

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-full overflow-hidden">

      {/* Mode selector */}
      <div className="flex border-b border-gray-200 bg-gray-50 flex-shrink-0">
        <button
          onClick={() => setMode("create")}
          className={`flex-1 py-1.5 text-xs font-medium transition-colors ${mode === "create" ? "bg-white text-blue-600 border-b-2 border-blue-600" : "text-gray-500 hover:text-gray-700"}`}
        >
          Create
        </button>
        <button
          onClick={() => { setMode("manage"); if (manageStep === "idle") handleLoadControls(); }}
          className={`flex-1 py-1.5 text-xs font-medium transition-colors ${mode === "manage" ? "bg-white text-blue-600 border-b-2 border-blue-600" : "text-gray-500 hover:text-gray-700"}`}
        >
          Manage
        </button>
        <button
          onClick={() => { setMode("fill"); if (fillStep === "idle") handleLoadFill(); }}
          className={`flex-1 py-1.5 text-xs font-medium transition-colors ${mode === "fill" ? "bg-white text-blue-600 border-b-2 border-blue-600" : "text-gray-500 hover:text-gray-700"}`}
        >
          Fill
        </button>
      </div>

      {/* ── CREATE MODE ─────────────────────────────────────────────────── */}
      {mode === "create" && (
        <>
          {step === "idle" && (
            <div className="flex-1 flex flex-col items-center justify-center px-4 py-6 text-center">
              <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center mb-3">
                <svg className="w-5 h-5 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414A1 1 0 0119 9.414V19a2 2 0 01-2 2z" />
                </svg>
              </div>
              <p className="text-sm font-semibold text-gray-800 mb-1">Document Template Wizard</p>
              <p className="text-xs text-gray-500 mb-4 leading-relaxed">
                Scans the open document for matter-specific data — names, dates, amounts, references — and converts them into reusable template fields.
              </p>

              {(selectedClient || selectedMatter) && (
                <div className="w-full mb-4 text-left bg-blue-50 border border-blue-200 rounded px-3 py-2 space-y-0.5">
                  {selectedClient && <p className="text-xs text-blue-800 truncate">{selectedClient.client_number} — {selectedClient.name}</p>}
                  {selectedMatter && <p className="text-xs text-blue-700 truncate">{selectedMatter.matter_number} — {selectedMatter.description}</p>}
                </div>
              )}

              {createError && (
                <div className="w-full mb-4 text-xs text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2 text-left">{createError}</div>
              )}
              <button
                onClick={handleScan}
                disabled={!officeReady || !selectedClient || !selectedMatter}
                className="w-full bg-blue-600 text-white py-2 rounded-lg text-sm font-semibold hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Scan Document
              </button>
              {(!selectedClient || !selectedMatter) && (
                <p className="text-xs text-amber-600 mt-2">Select a client and matter above to continue.</p>
              )}
              {!officeReady && selectedClient && selectedMatter && (
                <p className="text-xs text-gray-400 mt-2">Connecting to Word...</p>
              )}
            </div>
          )}

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

          {step === "review" && (
            <div className="flex-1 flex flex-col overflow-hidden">
              <div className="px-3 py-2 border-b border-gray-100 flex-shrink-0">
                <div className="flex items-center justify-between mb-1">
                  <p className="text-xs font-semibold text-gray-800">{variables.length} variables detected</p>
                  <button onClick={handleCreateReset} className="text-xs text-gray-400 hover:text-gray-600">Rescan</button>
                </div>
                <div className="flex items-center justify-between">
                  <p className="text-xs text-gray-500">
                    {variables.filter(v => v.isFromLibrary).length} matched · {variables.filter(v => v.isSuggested).length} suggested · {variables.filter(v => !v.isFromLibrary && !v.isSuggested).length} new
                  </p>
                  {variables.some(v => v.isSuggested) && (
                    <button
                      onClick={() => {
                        setVariables(prev => prev.map(v =>
                          v.isSuggested && v.suggestedMatch
                            ? { ...v, name: v.suggestedMatch.name, isFromLibrary: true, isManual: v.suggestedMatch.is_manual === 1, isSuggested: false, suggestedMatch: null }
                            : v
                        ));
                      }}
                      className="text-xs text-amber-700 hover:text-amber-900 font-medium whitespace-nowrap"
                    >
                      Accept all suggested
                    </button>
                  )}
                </div>
              </div>
              <div className="flex-1 overflow-y-auto px-3 py-2 space-y-2">
                {variables.map((v, i) => (
                  <div key={i} className={`border rounded-lg px-3 py-2 transition-colors ${v.enabled ? "bg-white border-gray-200" : "bg-gray-50 border-gray-100 opacity-60"}`}>
                    <div className="flex items-start gap-2">
                      <input type="checkbox" checked={v.enabled} onChange={e => updateVariable(i, { enabled: e.target.checked })} className="mt-0.5 flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 mb-1">
                          <input
                            type="text" value={v.name}
                            onChange={e => updateVariable(i, { name: e.target.value, isFromLibrary: false, isSuggested: false, suggestedMatch: null })}
                            disabled={!v.enabled}
                            className="flex-1 border border-gray-200 rounded px-2 py-0.5 text-xs font-mono text-gray-900 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:opacity-50 disabled:bg-gray-50"
                          />
                          {v.isFromLibrary
                            ? <span className="text-xs px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-700 flex-shrink-0 font-medium">Library</span>
                            : v.isSuggested
                              ? <span className="text-xs px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 flex-shrink-0 font-medium">Suggested</span>
                              : <span className="text-xs px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-500 flex-shrink-0">New</span>
                          }
                          <span className={`text-xs px-1.5 py-0.5 rounded-full flex-shrink-0 ${TYPE_COLOURS[v.type]}`}>{TYPE_LABELS[v.type]}</span>
                        </div>

                        {/* Suggested match: accept or dismiss */}
                        {v.isSuggested && v.suggestedMatch && v.enabled && (
                          <div className="flex items-center gap-2 mb-1 bg-amber-50 border border-amber-200 rounded px-2 py-1">
                            <span className="text-xs text-amber-800 flex-1">
                              Match: <span className="font-mono font-semibold">{v.suggestedMatch.name}</span>?
                            </span>
                            <button
                              onClick={() => updateVariable(i, {
                                name: v.suggestedMatch!.name,
                                isFromLibrary: true,
                                isManual: v.suggestedMatch!.is_manual === 1,
                                isSuggested: false,
                                suggestedMatch: null,
                                showLibraryPicker: false,
                              })}
                              className="text-xs text-green-700 hover:text-green-900 font-semibold"
                            >
                              Accept
                            </button>
                            <button
                              onClick={() => updateVariable(i, { isSuggested: false, suggestedMatch: null })}
                              className="text-xs text-gray-400 hover:text-gray-600"
                            >
                              Dismiss
                            </button>
                          </div>
                        )}

                        {/* Library picker — shown for New variables (no suggestion, or after dismissing one) */}
                        {library.length > 0 && !v.isFromLibrary && !v.isSuggested && v.enabled && (
                          <div className="mb-1">
                            {v.showLibraryPicker ? (
                              <div className="flex items-center gap-1">
                                <select
                                  autoFocus
                                  className="flex-1 border border-blue-300 rounded px-2 py-0.5 text-xs text-gray-900 focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white"
                                  defaultValue=""
                                  onChange={e => {
                                    const picked = library.find(l => l.name === e.target.value);
                                    if (picked) {
                                      updateVariable(i, {
                                        name: picked.name,
                                        isFromLibrary: true,
                                        isManual: picked.is_manual === 1,
                                        showLibraryPicker: false,
                                      });
                                    } else {
                                      updateVariable(i, { showLibraryPicker: false });
                                    }
                                  }}
                                >
                                  <option value="">— pick a library variable —</option>
                                  {library.map(l => (
                                    <option key={l.name} value={l.name}>{l.name}</option>
                                  ))}
                                </select>
                                <button onClick={() => updateVariable(i, { showLibraryPicker: false })} className="text-gray-400 hover:text-gray-600 text-xs">✕</button>
                              </div>
                            ) : (
                              <button
                                onClick={() => updateVariable(i, { showLibraryPicker: true })}
                                className="text-xs text-blue-600 hover:text-blue-800"
                              >
                                Map to existing library variable
                              </button>
                            )}
                          </div>
                        )}

                        <p className="text-xs text-gray-500 leading-snug mb-1">{v.description}</p>
                        <div className="flex flex-wrap gap-1 mb-1.5">
                          {v.occurrences.map((occ, j) => (
                            <span key={j} className="text-xs bg-gray-100 text-gray-600 rounded px-1.5 py-0.5 font-mono truncate max-w-full">{occ}</span>
                          ))}
                        </div>
                        <label className="flex items-center gap-1.5 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={v.isManual}
                            onChange={e => updateVariable(i, { isManual: e.target.checked })}
                            disabled={!v.enabled}
                            className="flex-shrink-0"
                          />
                          <span className="text-xs text-gray-500">Manual — always prompt when filling</span>
                        </label>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              <div className="px-3 py-2 border-t border-gray-100 flex-shrink-0">
                <button
                  onClick={handleApply} disabled={enabledCount === 0}
                  className="w-full bg-blue-600 text-white py-2 rounded-lg text-xs font-semibold hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Insert {enabledCount} Content Control{enabledCount !== 1 ? "s" : ""}
                </button>
              </div>
            </div>
          )}

          {step === "applying" && applyProgress && (
            <div className="flex-1 flex flex-col items-center justify-center px-4 py-6">
              <p className="text-xs font-semibold text-gray-800 mb-1">Applying template fields...</p>
              <p className="text-xs text-gray-500 mb-3 truncate max-w-full">{applyProgress.label}</p>
              <div className="w-full bg-gray-200 rounded-full h-1.5 mb-1">
                <div className="bg-blue-600 h-1.5 rounded-full transition-all" style={{ width: `${(applyProgress.current / applyProgress.total) * 100}%` }} />
              </div>
              <p className="text-xs text-gray-400">{applyProgress.current} / {applyProgress.total}</p>
            </div>
          )}

          {step === "done" && (
            <div className="flex-1 flex flex-col items-center justify-center px-4 py-6 text-center">
              <div className="w-10 h-10 rounded-full bg-green-100 flex items-center justify-center mb-3">
                <svg className="w-5 h-5 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <p className="text-sm font-semibold text-gray-800 mb-1">Template ready</p>
              <p className="text-xs text-gray-500 mb-4">
                {appliedCount} variable{appliedCount !== 1 ? "s" : ""} inserted as content controls.
                Save the document as a <strong>.dotx</strong> template to reuse it.
              </p>
              <button
                onClick={() => { handleCreateReset(); setMode("manage"); handleLoadControls(); }}
                className="w-full bg-blue-600 text-white py-2 rounded-lg text-xs font-semibold hover:bg-blue-700 mb-2"
              >
                Review Variables
              </button>
              <button onClick={handleCreateReset} className="w-full bg-gray-100 hover:bg-gray-200 text-gray-700 py-2 rounded-lg text-xs font-medium">
                Start Over
              </button>
            </div>
          )}
        </>
      )}

      {/* ── MANAGE MODE ─────────────────────────────────────────────────── */}
      {mode === "manage" && (
        <>
          {(manageStep === "idle" || manageStep === "loading") && (
            <div className="flex-1 flex flex-col items-center justify-center px-4 py-6 text-center">
              {manageStep === "loading" ? (
                <>
                  <div className="flex items-center gap-2 text-gray-400 text-xs mb-2">
                    <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce [animation-delay:-0.3s]" />
                    <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce [animation-delay:-0.15s]" />
                    <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" />
                  </div>
                  <p className="text-xs text-gray-500">Reading content controls...</p>
                </>
              ) : (
                <>
                  {manageError && <div className="w-full mb-4 text-xs text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2 text-left">{manageError}</div>}
                  <button onClick={handleLoadControls} disabled={!officeReady} className="w-full bg-blue-600 text-white py-2 rounded-lg text-xs font-semibold hover:bg-blue-700 disabled:opacity-50">
                    Load Variables
                  </button>
                </>
              )}
            </div>
          )}

          {(manageStep === "list" || manageStep === "saving") && (
            <div className="flex-1 flex flex-col overflow-hidden">
              <div className="px-3 py-2 border-b border-gray-100 flex items-center justify-between flex-shrink-0">
                <div>
                  <p className="text-xs font-semibold text-gray-800">{entries.length} variable{entries.length !== 1 ? "s" : ""} in document</p>
                  <p className="text-xs text-gray-500">Rename to merge. Delete removes the field, keeps text.</p>
                </div>
                <button onClick={handleLoadControls} className="text-xs text-gray-400 hover:text-gray-600" disabled={manageStep === "saving"}>Reload</button>
              </div>

              {manageError && (
                <div className="mx-3 mt-2 text-xs text-red-600 bg-red-50 border border-red-200 rounded px-2 py-1.5">{manageError}</div>
              )}

              {lastDeleted && (
                <div className="mx-3 mt-2 flex items-center gap-2 bg-amber-50 border border-amber-200 rounded px-2 py-1.5 flex-shrink-0">
                  <p className="flex-1 text-xs text-amber-800 truncate">Deleted <span className="font-mono font-semibold">{lastDeleted.name}</span></p>
                  <button onClick={handleUndo} className="text-xs font-semibold text-amber-700 hover:text-amber-900 whitespace-nowrap">Undo</button>
                  <button onClick={() => setLastDeleted(null)} className="text-amber-400 hover:text-amber-600 text-xs leading-none">×</button>
                </div>
              )}

              <div className="flex-1 overflow-y-auto px-3 py-2 space-y-1.5">
                {entries.map((entry, i) => (
                  <div key={entry.name} className="border border-gray-200 rounded-lg px-3 py-2 bg-white">
                    <div className="flex items-center gap-2">
                      <div className="flex-1 min-w-0">
                        <input
                          type="text"
                          value={entry.newName}
                          onChange={e => updateEntry(i, e.target.value)}
                          disabled={manageStep === "saving"}
                          className={`w-full border rounded px-2 py-0.5 text-xs font-mono text-gray-900 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:opacity-50 ${entry.newName !== entry.name ? "border-blue-400 bg-blue-50" : "border-gray-200"}`}
                        />
                        {FORMAT_OPTIONS[entry.type] && entry.id !== null && (
                          <div className="flex items-center gap-1.5 mt-1.5">
                            <span className={`text-xs px-1.5 py-0.5 rounded-full flex-shrink-0 ${TYPE_COLOURS[entry.type] ?? TYPE_COLOURS.other}`}>
                              {TYPE_LABELS[entry.type] ?? entry.type}
                            </span>
                            <select
                              value={entry.format ?? "as-entered"}
                              onChange={e => handleFormatChange(i, e.target.value === "as-entered" ? null : e.target.value)}
                              disabled={manageStep === "saving"}
                              className="flex-1 border border-gray-200 rounded px-1.5 py-0.5 text-xs text-gray-700 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:opacity-50"
                            >
                              {FORMAT_OPTIONS[entry.type].map(opt => (
                                <option key={opt.value} value={opt.value}>
                                  {opt.example ? `${opt.label} — ${opt.example}` : opt.label}
                                </option>
                              ))}
                            </select>
                          </div>
                        )}
                        <p className="text-xs text-gray-400 mt-0.5">{entry.count} occurrence{entry.count !== 1 ? "s" : ""}{entry.newName !== entry.name ? ` · will rename from "${entry.name}"` : ""}</p>
                      </div>
                      <button
                        onClick={() => handleDeleteGroup(entry.name)}
                        disabled={manageStep === "saving"}
                        className="text-gray-300 hover:text-red-500 transition-colors disabled:opacity-30 flex-shrink-0"
                        title={`Remove all "${entry.name}" controls`}
                      >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              {dirtyCount > 0 && (
                <div className="px-3 py-2 border-t border-gray-100 flex-shrink-0">
                  <button
                    onClick={handleSaveRenames}
                    disabled={manageStep === "saving"}
                    className="w-full bg-blue-600 text-white py-2 rounded-lg text-xs font-semibold hover:bg-blue-700 disabled:opacity-50"
                  >
                    {manageStep === "saving" ? "Saving..." : `Apply ${dirtyCount} Rename${dirtyCount !== 1 ? "s" : ""}`}
                  </button>
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* ── FILL MODE ───────────────────────────────────────────────────── */}
      {mode === "fill" && (
        <>
          {(fillStep === "idle" || fillStep === "loading") && (
            <div className="flex-1 flex flex-col items-center justify-center px-4 py-6 text-center">
              {fillStep === "loading" ? (
                <>
                  <div className="flex items-center gap-2 text-gray-400 text-xs mb-2">
                    <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce [animation-delay:-0.3s]" />
                    <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce [animation-delay:-0.15s]" />
                    <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" />
                  </div>
                  <p className="text-xs text-gray-500">Reading template fields...</p>
                </>
              ) : (
                <>
                  {fillError && <div className="w-full mb-4 text-xs text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2 text-left">{fillError}</div>}
                  <button
                    onClick={handleLoadFill}
                    disabled={!officeReady || !selectedClient || !selectedMatter}
                    className="w-full bg-blue-600 text-white py-2 rounded-lg text-xs font-semibold hover:bg-blue-700 disabled:opacity-50"
                  >
                    Load Template Fields
                  </button>
                  {(!selectedClient || !selectedMatter) && (
                    <p className="text-xs text-gray-400 mt-2">Select a client and matter first</p>
                  )}
                </>
              )}
            </div>
          )}

          {(fillStep === "form" || fillStep === "filling") && (
            <div className="flex-1 flex flex-col overflow-hidden">
              <div className="px-3 py-2 border-b border-gray-100 flex items-center justify-between flex-shrink-0">
                <div>
                  <p className="text-xs font-semibold text-gray-800">{fillVars.length} field{fillVars.length !== 1 ? "s" : ""} to fill</p>
                  <p className="text-xs text-gray-500">
                    {fillVars.filter(v => v.isAutoFilled).length} auto-filled · {fillVars.filter(v => !v.value.trim()).length} empty
                  </p>
                </div>
                <button onClick={handleLoadFill} className="text-xs text-gray-400 hover:text-gray-600" disabled={fillStep === "filling"}>Reload</button>
              </div>

              {fillError && (
                <div className="mx-3 mt-2 text-xs text-red-600 bg-red-50 border border-red-200 rounded px-2 py-1.5">{fillError}</div>
              )}

              <div className="flex-1 overflow-y-auto px-3 py-2 space-y-2">
                {fillVars.map((v, i) => (
                  <div key={v.name} className="border border-gray-200 rounded-lg px-3 py-2 bg-white">
                    <div className="flex items-center gap-1.5 mb-1.5">
                      <span className="text-xs font-mono font-semibold text-gray-800 flex-1 truncate">{v.name}</span>
                      <span className={`text-xs px-1.5 py-0.5 rounded-full flex-shrink-0 ${TYPE_COLOURS[v.type] ?? TYPE_COLOURS.other}`}>
                        {TYPE_LABELS[v.type] ?? "Other"}
                      </span>
                      {v.isAutoFilled && (
                        <span className="text-xs px-1.5 py-0.5 rounded-full bg-teal-100 text-teal-700 flex-shrink-0">Auto</span>
                      )}
                      {v.isManual && (
                        <span className="text-xs px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 flex-shrink-0">Manual</span>
                      )}
                    </div>
                    {(() => {
                      const err = getValidationError(v.value, v.type, v.format);
                      const borderCls = err
                        ? "border-red-400 focus:ring-red-400"
                        : "border-gray-200 focus:ring-blue-500";
                      return (
                        <>
                          {v.type === "address" ? (
                            <textarea
                              rows={2}
                              value={v.value}
                              onChange={e => updateFillVar(i, e.target.value)}
                              disabled={fillStep === "filling"}
                              placeholder={`Enter ${v.name}...`}
                              className={`w-full border rounded px-2 py-1 text-xs text-gray-900 focus:outline-none focus:ring-1 disabled:opacity-50 resize-none ${borderCls}`}
                            />
                          ) : (
                            <input
                              type="text"
                              value={v.value}
                              onChange={e => updateFillVar(i, e.target.value)}
                              disabled={fillStep === "filling"}
                              placeholder={`Enter ${v.name}...`}
                              className={`w-full border rounded px-2 py-1 text-xs text-gray-900 focus:outline-none focus:ring-1 disabled:opacity-50 ${borderCls}`}
                            />
                          )}
                          {err && (
                            <p className="text-xs text-red-500 mt-0.5">{err}</p>
                          )}
                          {!err && v.format && v.format !== "as-entered" && v.value.trim() && (() => {
                            const preview = applyFormat(v.value, v.type, v.format);
                            return preview !== v.value ? (
                              <p className="text-xs text-gray-400 mt-0.5">
                                Inserts as: <span className="text-gray-700 font-medium">{preview}</span>
                              </p>
                            ) : null;
                          })()}
                        </>
                      );
                    })()}
                  </div>
                ))}
              </div>

              <div className="px-3 py-2 border-t border-gray-100 flex-shrink-0">
                {(() => {
                  const errorCount = fillVars.filter(v => getValidationError(v.value, v.type, v.format)).length;
                  const filledCount = fillVars.filter(v => v.value.trim()).length;
                  const blocked = fillStep === "filling" || filledCount === 0 || errorCount > 0;
                  return (
                    <button
                      onClick={handleFillDocument}
                      disabled={blocked}
                      className="w-full bg-blue-600 text-white py-2 rounded-lg text-xs font-semibold hover:bg-blue-700 disabled:opacity-50"
                    >
                      {fillStep === "filling"
                        ? "Filling..."
                        : errorCount > 0
                          ? `Fix ${errorCount} error${errorCount !== 1 ? "s" : ""} to continue`
                          : `Fill ${filledCount} Field${filledCount !== 1 ? "s" : ""}`}
                    </button>
                  );
                })()}
              </div>
            </div>
          )}

          {fillStep === "done" && (
            <div className="flex-1 flex flex-col items-center justify-center px-4 py-6 text-center">
              <div className="w-10 h-10 rounded-full bg-green-100 flex items-center justify-center mb-3">
                <svg className="w-5 h-5 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <p className="text-sm font-semibold text-gray-800 mb-1">Document filled</p>
              <p className="text-xs text-gray-500 mb-4">
                {filledCount} field{filledCount !== 1 ? "s" : ""} filled. Content controls replaced with plain text — save as a new <strong>.docx</strong> to preserve the original template.
              </p>
              <button
                onClick={() => { setFillStep("idle"); setFillVars([]); setFilledCount(0); setFillError(null); }}
                className="w-full bg-gray-100 hover:bg-gray-200 text-gray-700 py-2 rounded-lg text-xs font-medium"
              >
                Fill Another
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
