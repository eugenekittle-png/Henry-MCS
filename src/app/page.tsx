"use client";

import Link from "next/link";
import Image from "next/image";
import { useAuth } from "@/components/AuthContext";
import courthouseImg from "@/images/courthouse__justice_aesthetic_stone_courthouse_columns.jpeg";
import attorneys1Img from "@/images/trust__credibility_two_professional_attorneys_in (1).jpeg";
import attorneys2Img from "@/images/trust__credibility_two_professional_attorneys_in (2).jpeg";

const faqs = [
  {
    q: "What is Henry MCS?",
    a: "Henry MCS is an AI-powered document analysis platform built for law firm workflows. It helps attorneys and staff quickly summarize, compare, catalog, and interrogate legal documents using state-of-the-art language models.",
  },
  {
    q: "What document types are supported?",
    a: "The platform supports PDF, DOCX, DOC, XLSX, PPTX, TXT, CSV, MD, and ZIP archives. Most tools accept multiple files at once, and the Breakdown tool can process an entire ZIP of documents in one pass.",
  },
  {
    q: "How is my data kept secure?",
    a: "All documents are processed in-memory and are never stored permanently on our servers. Access is protected by per-user authentication, and an admin audit log tracks all activity across the platform.",
  },
  {
    q: "Who manages user accounts?",
    a: "Firm administrators control user access, roles, and permissions through the Admin panel. Contact your firm administrator to request an account or a password reset.",
  },
  {
    q: "What AI model powers the tools?",
    a: "Henry MCS uses Claude by Anthropic — one of the most capable and safety-focused large language models available — to deliver accurate, nuanced analysis of legal documents.",
  },
  {
    q: "Can I use Henry MCS without uploading documents?",
    a: "Yes. The Assist tool works as a general-purpose AI assistant and does not require any document upload. Simply type your question and get an instant, research-quality answer.",
  },
];

function LandingPage() {
  return (
    <div className="min-h-screen bg-white">
      {/* Hero */}
      <section className="relative h-[540px] flex items-center justify-center overflow-hidden">
        <Image
          src={courthouseImg}
          alt="Courthouse"
          fill
          className="object-cover object-center"
          priority
        />
        <div className="absolute inset-0 bg-gray-900/65" />
        <div className="relative z-10 text-center px-4 max-w-3xl mx-auto">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/images/henry-mcs.png"
            alt="Henry MCS"
            className="h-16 w-auto mx-auto mb-6"
          />
          <h1 className="text-4xl sm:text-5xl font-bold text-white mb-4 leading-tight">
            AI-Powered Document Analysis<br className="hidden sm:block" /> for Law Firms
          </h1>
          <p className="text-lg text-gray-200 mb-8 max-w-xl mx-auto">
            Summarize, compare, catalog, and interrogate your legal documents in seconds — powered by Claude.
          </p>
          <Link
            href="/login"
            className="inline-block bg-white text-gray-900 font-semibold px-8 py-3 rounded-xl hover:bg-gray-100 transition-colors shadow-lg"
          >
            Sign In to Get Started
          </Link>
        </div>
      </section>

      {/* Tools overview */}
      <section className="max-w-5xl mx-auto px-4 py-20">
        <div className="text-center mb-12">
          <h2 className="text-3xl font-bold text-gray-900 mb-3">Everything your team needs</h2>
          <p className="text-gray-500 max-w-xl mx-auto">
            Four specialised tools covering the most common document workflows at a modern law firm.
          </p>
        </div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {[
            {
              color: "indigo",
              title: "Assist",
              desc: "Conversational AI for document Q&A and general research — no upload required.",
              icon: "M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z",
            },
            {
              color: "blue",
              title: "Summary",
              desc: "Upload one or many files and receive a comprehensive AI-generated summary.",
              icon: "M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z",
            },
            {
              color: "green",
              title: "Breakdown",
              desc: "Drop in a ZIP archive and get an organised catalog with themes and connections.",
              icon: "M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10",
            },
            {
              color: "purple",
              title: "Compare",
              desc: "Side-by-side AI comparison of two documents with a detailed changes report.",
              icon: "M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2",
            },
          ].map(({ color, title, desc, icon }) => (
            <div
              key={title}
              className={`bg-white rounded-2xl border border-gray-100 p-6 shadow-sm hover:shadow-md transition-shadow`}
            >
              <div
                className={`w-11 h-11 bg-${color}-100 rounded-xl flex items-center justify-center mb-4`}
              >
                <svg
                  className={`w-5 h-5 text-${color}-600`}
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={icon} />
                </svg>
              </div>
              <h3 className="font-semibold text-gray-900 mb-1">{title}</h3>
              <p className="text-sm text-gray-500">{desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* About / Trust section */}
      <section className="bg-gray-50 border-y border-gray-100">
        <div className="max-w-5xl mx-auto px-4 py-20 grid md:grid-cols-2 gap-12 items-center">
          <div>
            <h2 className="text-3xl font-bold text-gray-900 mb-4">Built for legal professionals</h2>
            <p className="text-gray-600 mb-4">
              Henry MCS was designed from the ground up with law firm workflows in mind. Every tool
              prioritises accuracy, confidentiality, and speed so your team can focus on what matters —
              serving clients.
            </p>
            <ul className="space-y-2 text-gray-600 text-sm">
              {[
                "Documents processed in-memory — never stored permanently",
                "Per-user accounts with role-based access control",
                "Full audit trail for all activity",
                "Supports the most common legal document formats",
              ].map((point) => (
                <li key={point} className="flex items-start gap-2">
                  <svg className="w-4 h-4 text-green-500 mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  {point}
                </li>
              ))}
            </ul>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Image
              src={attorneys1Img}
              alt="Legal professionals"
              className="rounded-2xl object-cover w-full h-52"
              placeholder="blur"
            />
            <Image
              src={attorneys2Img}
              alt="Legal professionals"
              className="rounded-2xl object-cover w-full h-52"
              placeholder="blur"
            />
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="max-w-3xl mx-auto px-4 py-20">
        <div className="text-center mb-12">
          <h2 className="text-3xl font-bold text-gray-900 mb-3">Frequently asked questions</h2>
          <p className="text-gray-500">Have a question that isn&apos;t answered here? Reach out to your firm administrator.</p>
        </div>
        <div className="space-y-4">
          {faqs.map(({ q, a }) => (
            <details
              key={q}
              className="group bg-white border border-gray-200 rounded-xl px-6 py-4 cursor-pointer open:shadow-sm transition-shadow"
            >
              <summary className="flex items-center justify-between list-none font-medium text-gray-900 select-none">
                {q}
                <svg
                  className="w-4 h-4 text-gray-400 shrink-0 ml-4 transition-transform group-open:rotate-180"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </summary>
              <p className="mt-3 text-gray-500 text-sm leading-relaxed">{a}</p>
            </details>
          ))}
        </div>
      </section>

      {/* CTA footer */}
      <section className="bg-gray-900">
        <div className="max-w-3xl mx-auto px-4 py-16 text-center">
          <h2 className="text-3xl font-bold text-white mb-3">Ready to get started?</h2>
          <p className="text-gray-400 mb-8">Sign in to access all tools — your administrator can provide credentials.</p>
          <Link
            href="/login"
            className="inline-block bg-white text-gray-900 font-semibold px-8 py-3 rounded-xl hover:bg-gray-100 transition-colors"
          >
            Sign In
          </Link>
        </div>
      </section>
    </div>
  );
}

function Dashboard() {
  return (
    <div className="max-w-4xl mx-auto px-4 py-16">
      <div className="text-center mb-12">
        <h1 className="text-4xl font-bold text-gray-900 mb-3">Document Analysis Tools</h1>
        <p className="text-lg text-gray-600">AI-powered tools to summarize and catalog your documents</p>
      </div>

      <div className="grid md:grid-cols-3 gap-6">
        <Link
          href="/assist"
          className="group block bg-white rounded-2xl border border-gray-200 p-8 hover:shadow-lg hover:border-indigo-300 transition-all"
        >
          <div className="w-12 h-12 bg-indigo-100 rounded-xl flex items-center justify-center mb-4 group-hover:bg-indigo-200 transition-colors">
            <svg className="w-6 h-6 text-indigo-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
            </svg>
          </div>
          <h2 className="text-xl font-semibold text-gray-900 mb-2">Assist</h2>
          <p className="text-gray-600">
            Ask questions, analyze documents, and explore any topic with a conversational AI assistant built for law firm workflows.
          </p>
          <p className="text-sm text-gray-400 mt-4">Documents optional — supports PDF, DOCX, XLSX, TXT and more</p>
        </Link>

        <Link
          href="/summary"
          className="group block bg-white rounded-2xl border border-gray-200 p-8 hover:shadow-lg hover:border-blue-300 transition-all"
        >
          <div className="w-12 h-12 bg-blue-100 rounded-xl flex items-center justify-center mb-4 group-hover:bg-blue-200 transition-colors">
            <svg className="w-6 h-6 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
          </div>
          <h2 className="text-xl font-semibold text-gray-900 mb-2">Summary</h2>
          <p className="text-gray-600">
            Upload one or more documents and get a comprehensive AI-generated summary that captures key information across all files.
          </p>
          <p className="text-sm text-gray-400 mt-4">Supports PDF, DOCX, XLSX, PPTX, TXT, MD, CSV</p>
        </Link>

        <Link
          href="/breakdown"
          className="group block bg-white rounded-2xl border border-gray-200 p-8 hover:shadow-lg hover:border-green-300 transition-all"
        >
          <div className="w-12 h-12 bg-green-100 rounded-xl flex items-center justify-center mb-4 group-hover:bg-green-200 transition-colors">
            <svg className="w-6 h-6 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
            </svg>
          </div>
          <h2 className="text-xl font-semibold text-gray-900 mb-2">Breakdown</h2>
          <p className="text-gray-600">
            Upload a zip file of documents and get an organized catalog with summaries, themes, and connections between files.
          </p>
          <p className="text-sm text-gray-400 mt-4">Supports ZIP</p>
        </Link>

        <Link
          href="/compare"
          className="group block bg-white rounded-2xl border border-gray-200 p-8 hover:shadow-lg hover:border-purple-300 transition-all"
        >
          <div className="w-12 h-12 bg-purple-100 rounded-xl flex items-center justify-center mb-4 group-hover:bg-purple-200 transition-colors">
            <svg className="w-6 h-6 text-purple-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
            </svg>
          </div>
          <h2 className="text-xl font-semibold text-gray-900 mb-2">Compare</h2>
          <p className="text-gray-600">
            Upload two documents and get a detailed AI-generated comparison highlighting similarities, differences, and key changes.
          </p>
          <p className="text-sm text-gray-400 mt-4">Supports PDF, DOC, DOCX</p>
        </Link>
      </div>
    </div>
  );
}

export default function Home() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="w-8 h-8 border-2 border-gray-200 border-t-gray-600 rounded-full animate-spin" />
      </div>
    );
  }

  return user ? <Dashboard /> : <LandingPage />;
}
