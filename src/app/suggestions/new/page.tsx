"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/AuthContext";

export default function NewSuggestionPage() {
  const { user } = useAuth();
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [isAnonymous, setIsAnonymous] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  if (!user) return null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!title.trim()) { setError("Title is required."); return; }
    if (!description.trim()) { setError("Description is required."); return; }

    setSubmitting(true);
    try {
      const res = await fetch("/api/suggestions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, description, isAnonymous }),
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Failed to submit.");
        return;
      }
      router.push("/suggestions");
    } catch {
      setError("Failed to submit.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="max-w-xl mx-auto px-4 py-8">
      <button
        onClick={() => router.push("/suggestions")}
        className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 mb-6 transition-colors"
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
        </svg>
        Back to Feedback Forum
      </button>

      <h1 className="text-2xl font-bold text-gray-900 mb-6">Submit a Suggestion</h1>

      {error && (
        <div className="mb-4 px-4 py-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-5">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Title</label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Brief summary of your suggestion"
            maxLength={120}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-400"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Describe your suggestion in detail..."
            rows={5}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-400 resize-none"
          />
        </div>

        <div className="flex items-start gap-3 p-3 bg-gray-50 rounded-lg border border-gray-200">
          <input
            id="anonymous"
            type="checkbox"
            checked={isAnonymous}
            onChange={(e) => setIsAnonymous(e.target.checked)}
            className="mt-0.5 h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
          />
          <div>
            <label htmlFor="anonymous" className="text-sm font-medium text-gray-700 cursor-pointer">
              Submit anonymously
            </label>
            <p className="text-xs text-gray-500 mt-0.5">
              Your name will not be shown on the Feedback Forum
            </p>
          </div>
        </div>

        <div className="flex gap-3 pt-1">
          <button
            type="submit"
            disabled={submitting}
            className="px-5 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >
            {submitting ? "Submitting..." : "Submit"}
          </button>
          <button
            type="button"
            onClick={() => router.push("/suggestions")}
            className="px-5 py-2 text-sm text-gray-600 hover:text-gray-900 transition-colors"
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}
