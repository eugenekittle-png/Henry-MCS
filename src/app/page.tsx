import Link from "next/link";

export default function Home() {
  return (
    <div className="max-w-4xl mx-auto px-4 py-16">
      <div className="text-center mb-12">
        <h1 className="text-4xl font-bold text-gray-900 mb-3">
          Document Analysis Tools
        </h1>
        <p className="text-lg text-gray-600">
          AI-powered tools to summarize and catalog your documents
        </p>
      </div>

      <div className="grid md:grid-cols-3 gap-6">
        <Link
          href="/summary"
          className="group block bg-white rounded-2xl border border-gray-200 p-8 hover:shadow-lg hover:border-blue-300 transition-all"
        >
          <div className="w-12 h-12 bg-blue-100 rounded-xl flex items-center justify-center mb-4 group-hover:bg-blue-200 transition-colors">
            <svg className="w-6 h-6 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
          </div>
          <h2 className="text-xl font-semibold text-gray-900 mb-2">
            Document Summary
          </h2>
          <p className="text-gray-600">
            Upload one or more documents and get a comprehensive AI-generated
            summary that captures key information across all files.
          </p>
          <p className="text-sm text-gray-400 mt-4">
            Supports PDF, DOCX, XLSX, PPTX, TXT, MD, CSV
          </p>
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
          <h2 className="text-xl font-semibold text-gray-900 mb-2">
            Document Breakdown
          </h2>
          <p className="text-gray-600">
            Upload a zip file of documents and get an organized catalog with
            summaries, themes, and connections between files.
          </p>
          <p className="text-sm text-gray-400 mt-4">
            Upload a .zip containing supported document types
          </p>
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
          <h2 className="text-xl font-semibold text-gray-900 mb-2">
            Document Compare
          </h2>
          <p className="text-gray-600">
            Upload two documents and get a detailed AI-generated comparison
            highlighting similarities, differences, and key changes.
          </p>
          <p className="text-sm text-gray-400 mt-4">
            Supports PDF, DOC, DOCX
          </p>
        </Link>
      </div>
    </div>
  );
}
