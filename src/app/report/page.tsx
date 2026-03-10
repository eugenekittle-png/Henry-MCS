"use client";

import { useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

const TITLE = "Legal Research Platform Comparison Report";

const CONTENT = `# Legal Research Platform Comparison Report
**For a US-Based Law Firm — March 2026**

---

## 1. Coverage

| | Westlaw | LexisNexis | Bloomberg Law | Fastcase | Casetext |
|---|---|---|---|---|---|
| US federal & state case law | Comprehensive | Comprehensive | Comprehensive | Comprehensive | Comprehensive |
| Statutes & regulations | Yes | Yes | Yes | Yes | Yes |
| Secondary sources & treatises | Extensive (incl. Wright & Miller) | Extensive | Good | Via Full Court Press | Limited |
| News & business intelligence | Limited | Strong | Very strong | No | No |
| Court dockets | Yes | Yes | Federal & state | Via Docket Alarm | Limited |
| Historical depth | Deep | Deep | Deep | Good | Good |
| Update frequency | Real-time | Real-time | Real-time | Regular | Regular |

---

## 2. Search & Usability

| | Westlaw | LexisNexis | Bloomberg Law | Fastcase | Casetext |
|---|---|---|---|---|---|
| Search default | Natural language | Natural language | Boolean-first | Natural language | Natural language |
| Citator | KeyCite (highly regarded) | Shepard's (highly regarded) | BCite | Basic | Yes |
| Learning curve | Low | Low | Medium-High | Low | Low |
| Case timeline/visualisation | Limited | Limited | Yes | Yes (built-in) | Limited |
| Annotation & workflow tools | Yes | Yes | Yes | Yes | Yes |
| Mobile access | Yes | Yes | Yes | Yes | Yes |

---

## 3. Pricing

| | Westlaw | LexisNexis | Bloomberg Law | Fastcase | Casetext |
|---|---|---|---|---|---|
| Model | Package-based, negotiated | Package-based, negotiated | Flat rate by firm size | Per user/month | Per user/month |
| Indicative cost | Premium (negotiate with rep) | Premium (negotiate with rep) | ~$475/mo solo, scales up; 2-year minimum | From ~$65/user/mo | From ~$39/user/mo |
| Contract flexibility | Negotiable | Negotiable | Less flexible (2-yr min) | More flexible | More flexible |
| Pricing transparency | Low — rep-dependent | Low — rep-dependent | Higher | High | High |

> **Note:** Both Westlaw and LexisNexis list online prices but sales reps routinely discount significantly — always negotiate before signing.

---

## 4. Integration & API

| | Westlaw | LexisNexis | Bloomberg Law | Fastcase | Casetext |
|---|---|---|---|---|---|
| API available | Yes | Yes | Yes | Yes (via vLex) | Limited |
| NetDocuments integration | Yes | Yes (native) | Not confirmed | Limited | Limited |
| iManage integration | Yes | Yes | Yes | Limited | Limited |
| Custom tool development | Yes | Yes | Yes | Yes | Limited |

> **Note:** LexisNexis has confirmed native NetDocuments integration, enabling documents to be pulled directly into its AI environment. Westlaw also offers API access. Both are strong candidates for deeper integration with Henry MCS.

---

## 5. AI Capabilities

| | Westlaw (CoCounsel) | LexisNexis (Lexis+ AI) | Bloomberg Law AI | Fastcase (vLex AI) | Casetext |
|---|---|---|---|---|---|
| AI research assistant | Deep Research (agentic) | Planner/Orchestrator Agents | BL Answers + AI Assistant | Vincent AI | CoCounsel / CARA |
| Document drafting | Motions, memos, complaints | Yes | Limited | Limited | Yes |
| Document analysis | Up to 300 pages | Yes | Viewing-context only | Yes | Yes |
| Citation validation in AI | Yes via KeyCite | Yes via Shepard's | Yes | Limited | Yes |
| Included in subscription | Yes (Aug 2025+) | Yes | Yes | Yes | Yes |
| Voice AI | No | Yes (launched Mar 2025) | No | No | No |

> **Note:** Westlaw and Casetext share the CoCounsel brand — Thomson Reuters acquired Casetext in 2023 and its AI is now deeply embedded in Westlaw.

---

## 6. US-Based Support

| | Westlaw | LexisNexis | Bloomberg Law | Fastcase | Casetext |
|---|---|---|---|---|---|
| US-based support | Yes | Yes | Yes | Yes | Yes (via TR) |
| Dedicated account manager | Yes (larger contracts) | Yes (larger contracts) | Yes | Smaller firms may not | Limited |
| Training & onboarding | Extensive | Extensive | Good | Good | Good |
| Support hours | 24/7 | 24/7 | Business hours+ | Business hours | Business hours |

---

## Summary Recommendation

| Firm need | Best fit |
|---|---|
| Most comprehensive research + trusted citator | Westlaw or LexisNexis |
| Best AI features included at no extra cost | Westlaw CoCounsel (most advanced agentic AI as of 2026) |
| Best value for small-to-mid firm | Fastcase or Casetext |
| Best for business/news intelligence alongside law | Bloomberg Law |
| Best NetDocuments integration | LexisNexis (confirmed native) |
| Most pricing transparency | Bloomberg Law or Fastcase |

For a mid-size US firm already using NetDocuments, **LexisNexis** or **Westlaw** are the strongest all-round options — both offer deep coverage, strong AI, US-based support, and API/NetDocuments integration that could complement Henry MCS directly.

---

*Sources: Above the Law / MyCase; Charleston School of Law LibGuides; A.I. Solutions Inc.; Lawyerist; ZiefBrief (Feb 2026); Penn State Law; LexisNexis; API Integration Tech; Equal Voice for Families (2026).*
`;

export default function ReportPage() {
  const [downloading, setDownloading] = useState(false);

  async function handleDownload() {
    setDownloading(true);
    try {
      const res = await fetch("/api/export-pdf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ markdown: CONTENT, title: TITLE }),
      });
      if (!res.ok) throw new Error("Export failed");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "legal-research-platform-comparison.pdf";
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      alert("Failed to generate PDF. Please try again.");
    } finally {
      setDownloading(false);
    }
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Toolbar */}
      <div className="sticky top-0 z-10 bg-white border-b border-gray-200 px-6 py-3 flex items-center justify-between">
        <div>
          <h1 className="text-sm font-semibold text-gray-900">{TITLE}</h1>
          <p className="text-xs text-gray-500">March 2026</p>
        </div>
        <button
          onClick={handleDownload}
          disabled={downloading}
          className="flex items-center gap-2 bg-gray-900 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-800 disabled:opacity-50 transition-colors"
        >
          {downloading ? (
            <>
              <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
              Generating...
            </>
          ) : (
            <>
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3M3 17V7a2 2 0 012-2h6l2 2h6a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
              </svg>
              Download PDF
            </>
          )}
        </button>
      </div>

      {/* Report content */}
      <div className="max-w-5xl mx-auto px-6 py-8">
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8">
          <div className="prose prose-sm max-w-none
            prose-headings:text-gray-900
            prose-h1:text-2xl prose-h1:font-bold prose-h1:mb-2
            prose-h2:text-lg prose-h2:font-semibold prose-h2:mt-8 prose-h2:mb-3
            prose-p:text-gray-700 prose-p:leading-relaxed
            prose-strong:text-gray-900
            prose-blockquote:border-l-4 prose-blockquote:border-gray-300 prose-blockquote:text-gray-600 prose-blockquote:pl-4 prose-blockquote:italic
            prose-table:text-xs prose-table:w-full
            prose-th:bg-gray-900 prose-th:text-white prose-th:px-3 prose-th:py-2 prose-th:text-left prose-th:font-medium
            prose-td:px-3 prose-td:py-2 prose-td:border-b prose-td:border-gray-100 prose-td:text-gray-700
            prose-hr:border-gray-200
          ">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{CONTENT}</ReactMarkdown>
          </div>
        </div>
      </div>
    </div>
  );
}
