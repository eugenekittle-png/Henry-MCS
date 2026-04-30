"use client";

import { useAuth } from "@/components/AuthContext";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import Image from "next/image";
import assistImg from "@/images/help/Assist.png";
import breakdownImg from "@/images/help/Breakdown.png";
import compareImg from "@/images/help/Compare.png";
import matrixImg from "@/images/help/Matrix.png";

function Section({ id, title, color, children }: { id: string; title: string; color: string; children: React.ReactNode }) {
  return (
    <section id={id} className="scroll-mt-20">
      <div className={`flex items-center gap-3 mb-4`}>
        <div className={`w-1 h-6 rounded-full ${color}`} />
        <h2 className="text-xl font-bold text-gray-900">{title}</h2>
      </div>
      {children}
    </section>
  );
}

function Step({ number, text }: { number: number; text: string }) {
  return (
    <div className="flex items-start gap-3">
      <span className="w-6 h-6 rounded-full bg-gray-100 text-gray-600 text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">
        {number}
      </span>
      <p className="text-sm text-gray-700">{text}</p>
    </div>
  );
}

function Tip({ text }: { text: string }) {
  return (
    <li className="flex items-start gap-2 text-sm text-gray-600">
      <svg className="w-4 h-4 text-green-500 mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
      </svg>
      {text}
    </li>
  );
}

function ScreenshotPlaceholder({ label }: { label: string }) {
  return (
    <div className="my-4 border-2 border-dashed border-gray-200 rounded-xl flex flex-col items-center justify-center py-10 text-gray-300 bg-gray-50">
      <svg className="w-8 h-8 mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
      </svg>
      <p className="text-xs">{label}</p>
    </div>
  );
}

function OverviewVideoLink() {
  const [available, setAvailable] = useState<boolean | null>(null);

  useEffect(() => {
    fetch("/api/video/overview", { method: "HEAD" })
      .then(r => setAvailable(r.ok))
      .catch(() => setAvailable(false));
  }, []);

  // Still checking
  if (available === null) return null;

  // Video not configured yet
  if (!available) {
    return (
      <div className="mt-6 flex items-center gap-3 px-4 py-3 bg-gray-50 border border-dashed border-gray-200 rounded-xl text-sm text-gray-400">
        <span className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center shrink-0">
          <svg className="w-3.5 h-3.5 text-gray-400 translate-x-px" fill="currentColor" viewBox="0 0 24 24">
            <path d="M8 5v14l11-7z" />
          </svg>
        </span>
        <span>Overview video — coming soon</span>
      </div>
    );
  }

  return (
    <a
      href="/api/video/overview"
      target="_blank"
      rel="noopener noreferrer"
      className="mt-6 flex items-center gap-3 px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm text-gray-700 hover:bg-gray-100 hover:border-gray-300 transition-colors group"
    >
      <span className="w-8 h-8 rounded-full bg-gray-900 flex items-center justify-center shrink-0 group-hover:bg-gray-700 transition-colors">
        <svg className="w-3.5 h-3.5 text-white translate-x-px" fill="currentColor" viewBox="0 0 24 24">
          <path d="M8 5v14l11-7z" />
        </svg>
      </span>
      <span>
        <span className="font-medium text-gray-900">Watch the Henry MCS overview</span>
        <span className="text-gray-400 ml-2 text-xs">Opens video</span>
      </span>
      <svg className="w-4 h-4 text-gray-400 ml-auto shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
      </svg>
    </a>
  );
}

const TOOL_SECTIONS = [
  { key: "assist",    href: "#assist",    label: "Assist",    color: "bg-indigo-100 text-indigo-700 hover:bg-indigo-200" },
  { key: "breakdown", href: "#breakdown", label: "Breakdown", color: "bg-green-100 text-green-700 hover:bg-green-200" },
  { key: "compare",   href: "#compare",   label: "Compare",   color: "bg-purple-100 text-purple-700 hover:bg-purple-200" },
  { key: "matrix",    href: "#matrix",    label: "Matrix",    color: "bg-orange-100 text-orange-700 hover:bg-orange-200" },
];

export default function HelpPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [showTop, setShowTop] = useState(false);

  const isAdmin = user?.role === "admin";
  const canSee = (key: string) => isAdmin || (user?.pages ?? []).includes(key);
  const visibleSections = TOOL_SECTIONS.filter(t => canSee(t.key));

  useEffect(() => {
    function onScroll() { setShowTop(window.scrollY > 300); }
    window.addEventListener("scroll", onScroll);
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    if (!loading && !user) router.push("/login");
  }, [user, loading, router]);

  useEffect(() => {
    if (!loading && user) {
      const hash = window.location.hash;
      if (hash) {
        setTimeout(() => {
          const el = document.querySelector(hash);
          if (el) el.scrollIntoView({ behavior: "smooth" });
        }, 100);
      }
    }
  }, [loading, user]);

  if (loading || !user) return null;

  return (
    <div className="max-w-3xl mx-auto px-4 py-10">
      {showTop && (
        <button
          onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
          className="fixed bottom-6 right-6 z-50 flex items-center gap-1.5 px-3 py-2 bg-gray-900 text-white text-xs font-medium rounded-full shadow-lg hover:bg-gray-700 transition-colors"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 15l7-7 7 7" />
          </svg>
          Top
        </button>
      )}
      {/* Header */}
      <div className="mb-10">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Help & Reference</h1>
        <p className="text-gray-500">
          Quick reference for each procedure in Henry MCS. Select a section or scroll to find what you need.
        </p>

        {/* Section nav */}
        {visibleSections.length > 0 && (
          <div className="flex flex-wrap gap-2 mt-5">
            {visibleSections.map(({ href, label, color }) => (
              <a
                key={href}
                href={href}
                className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${color}`}
              >
                {label}
              </a>
            ))}
          </div>
        )}

        {/* Overview video link */}
        <OverviewVideoLink />
      </div>

      {visibleSections.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <p className="text-lg mb-1">No tools assigned</p>
          <p className="text-sm">Contact your administrator to be added to a group.</p>
        </div>
      ) : (
      <div className="space-y-12">
        {/* ── Assist ─────────────────────────────────────────────── */}
        {canSee("assist") && <Section id="assist" title="Assist" color="bg-indigo-500">
          <p className="text-sm text-gray-600 mb-4">
            Conversational AI for document Q&amp;A and legal research. Upload your own files, pull in public filings from SEC EDGAR or case law from CourtListener, or ask questions without any documents at all.
          </p>

          <Image src={assistImg} alt="Assist screenshot" className="my-4 rounded-xl border border-gray-200 shadow-sm w-full h-auto" placeholder="blur" />

          <div className="space-y-2 mb-5">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Steps</p>
            <Step number={1} text="Select a client and matter (used for billing and audit tracking)." />
            <Step number={2} text="Optionally upload one or more documents — PDF, DOCX, XLSX, TXT, CSV and more are supported." />
            <Step number={3} text="Optionally add Research Sources — use Add from SEC EDGAR to pull in a public filing, or Add from CourtListener to search and include a court opinion." />
            <Step number={4} text="Type your question or request and press Send. Documents and research sources are sent automatically on the first message." />
            <Step number={5} text="Follow up with additional questions — the assistant retains full context throughout the conversation." />
            <Step number={6} text="When done, download the conversation as a PDF." />
          </div>

          <div className="mb-6">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Research Sources</p>
            <div className="grid sm:grid-cols-2 gap-3">
              <div className="bg-indigo-50 border border-indigo-100 rounded-xl p-4">
                <p className="text-sm font-semibold text-indigo-800 mb-1">SEC EDGAR</p>
                <p className="text-xs text-indigo-700 leading-relaxed">Search for a public company by name or ticker, select a filing type (10-K, 10-Q, 8-K, etc.), and add a specific filing. No account required.</p>
              </div>
              <div className="bg-indigo-50 border border-indigo-100 rounded-xl p-4">
                <p className="text-sm font-semibold text-indigo-800 mb-1">CourtListener</p>
                <p className="text-xs text-indigo-700 leading-relaxed">Search US case law by case name, citation (e.g. 384 U.S. 436), or legal topic. Filter by court and use &ldquo;Precedential only&rdquo; to narrow results. Powered by the Free Law Project.</p>
              </div>
            </div>
          </div>

          <ul className="space-y-2">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Tips</p>
            <Tip text="Documents and research sources are locked once the conversation starts — add everything before sending your first message." />
            <Tip text="You can combine uploaded files and research sources in the same session (e.g. a contract and a relevant court opinion)." />
            <Tip text="For CourtListener, check 'Precedential only' to filter to binding case law and reduce noise. Use 'Match case name only' when you know the exact case name." />
            <Tip text="If full opinion text is unavailable for a case, the assistant will note it and draw on its own knowledge of the case instead." />
            <Tip text="New Conversation keeps your client and matter selected — documents and research sources are cleared and can be changed." />
            <Tip text="The more specific your question, the more precise the response." />
          </ul>
        </Section>}

        {/* ── Breakdown ──────────────────────────────────────────── */}
        {canSee("breakdown") && <Section id="breakdown" title="Breakdown" color="bg-green-500">
          <p className="text-sm text-gray-600 mb-4">
            Upload a ZIP archive of documents and receive an organised catalog with individual summaries, identified themes, and connections across files.
          </p>

          <Image src={breakdownImg} alt="Breakdown screenshot" className="my-4 rounded-xl border border-gray-200 shadow-sm w-full h-auto" placeholder="blur" />

          <div className="space-y-2 mb-5">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Steps</p>
            <Step number={1} text="Select a client and matter." />
            <Step number={2} text="Upload a ZIP file containing your documents." />
            <Step number={3} text="Click Analyse - each file is processed individually and progress is shown in real time." />
            <Step number={4} text="Review the catalog, per-file summaries, and identified themes." />
            <Step number={5} text="Download the full results as a PDF." />
          </div>

          <ul className="space-y-2">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Tips</p>
            <Tip text="Works best with 5–50 documents in the ZIP." />
            <Tip text="Supported formats inside the ZIP: PDF, DOCX, XLSX, TXT, CSV." />
            <Tip text="Nested folders inside the ZIP are supported." />
          </ul>
        </Section>}

        {/* ── Compare ────────────────────────────────────────────── */}
        {canSee("compare") && <Section id="compare" title="Compare" color="bg-purple-500">
          <p className="text-sm text-gray-600 mb-4">
            Upload two documents and receive a detailed AI-generated comparison highlighting similarities, differences, and key changes between them.
          </p>

          <Image src={compareImg} alt="Compare screenshot" className="my-4 rounded-xl border border-gray-200 shadow-sm w-full h-auto" placeholder="blur" />

          <div className="space-y-2 mb-5">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Steps</p>
            <Step number={1} text="Select a client and matter." />
            <Step number={2} text="Upload Document 1 and Document 2." />
            <Step number={3} text="Click Compare and wait for the analysis to complete." />
            <Step number={4} text="Review the report - changes are grouped by type (additions, removals, modifications)." />
            <Step number={5} text="Download the comparison as a PDF." />
          </div>

          <ul className="space-y-2">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Tips</p>
            <Tip text="Best used for comparing versions of the same document - contracts, briefs, agreements." />
            <Tip text="Supports PDF, DOC, and DOCX formats." />
            <Tip text="The order of documents matters - Document 1 is treated as the original, Document 2 as the revised version." />
          </ul>
        </Section>}

        {/* ── Matrix ─────────────────────────────────────────────── */}
        {canSee("matrix") && <Section id="matrix" title="Matrix" color="bg-orange-500">
          <p className="text-sm text-gray-600 mb-4">
            Matrix is a structured extraction tool. Build a reusable template of named columns, then run it against one or more documents to pull specific information into a table. It can be used as an <strong>extraction tool</strong>, a <strong>document checklist</strong>, or a <strong>structured review framework</strong> - the same template adapts to each use case.
          </p>

          <div className="grid sm:grid-cols-3 gap-3 mb-6">
            {[
              { label: "Extraction", desc: "Pull the same fields from many documents into a single table - effective dates, parties, governing law, key terms." },
              { label: "Checklist", desc: "Verify each document contains required fields or provisions. Missing values are immediately visible in the results." },
              { label: "Structured Review", desc: "Standardise how a document type is reviewed across matters - every reviewer looks at the same columns, in the same order." },
            ].map(({ label, desc }) => (
              <div key={label} className="bg-orange-50 border border-orange-100 rounded-xl p-4">
                <p className="text-sm font-semibold text-orange-800 mb-1">{label}</p>
                <p className="text-xs text-orange-700 leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>

          <Image src={matrixImg} alt="Matrix screenshot" className="my-4 rounded-xl border border-gray-200 shadow-sm w-full h-auto" placeholder="blur" />

          <div className="space-y-6">
            {[
              {
                step: "Step 1 - Create a template",
                items: [
                  "Go to Matrix and click New Template.",
                  "Assign it to a client and matter - templates are per-user and per client/matter.",
                  "Give it a descriptive name (e.g. NDA Review, Lease Checklist, Employment Agreement).",
                ],
              },
              {
                step: "Step 2 - Add columns",
                items: [
                  "Add columns manually: give each a name and an optional extraction instruction.",
                  "Or upload a sample document and let the AI suggest columns based on its contents - review and edit before adding.",
                  "Drag columns to reorder them using the grip handle on the left.",
                  "Column names are limited to 100 characters; instructions to 500 characters.",
                ],
              },
              {
                step: "Step 3 - Run an extraction",
                items: [
                  "From the template list, click Extract on the template you want to use.",
                  "Upload one or more documents - multiple files are processed in parallel.",
                  "The AI extracts each column's value from every document.",
                  "A Consensus row is generated at the top, summarising values across all documents.",
                ],
              },
              {
                step: "Step 4 - Review and download",
                items: [
                  "Review results in the table - the Consensus row is highlighted in blue.",
                  "Download as CSV to continue analysis in Excel or another tool.",
                  "Download as PDF for a formatted report suitable for sharing.",
                ],
              },
            ].map(({ step, items }) => (
              <div key={step}>
                <p className="text-sm font-semibold text-gray-800 mb-2">{step}</p>
                <div className="space-y-1.5 pl-1">
                  {items.map((item, i) => (
                    <div key={i} className="flex items-start gap-2 text-sm text-gray-600">
                      <span className="text-gray-400 mt-0.5">•</span>
                      {item}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>

          <ul className="space-y-2 mt-6">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Tips</p>
            <Tip text="Templates are private - they are only visible to the user who created them." />
            <Tip text="Copy a template to reuse it on a different client or matter without rebuilding columns." />
            <Tip text="Extraction instructions on columns guide the AI - the more specific, the better the result." />
            <Tip text="The Consensus row is AI-generated and synthesises across all uploaded documents - useful when values differ between files." />
            <Tip text="Supports up to 50 columns per template." />
          </ul>
        </Section>}
      </div>
      )}
    </div>
  );
}
