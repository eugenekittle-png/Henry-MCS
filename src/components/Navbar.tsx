"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/components/AuthContext";

export default function Navbar() {
  const pathname = usePathname();
  const { user, logout } = useAuth();
  const [adminOpen, setAdminOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setAdminOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  if (!user || pathname.startsWith("/word-addin")) return null;

  const linkClass = (path: string) =>
    `px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
      pathname === path || (path !== "/" && pathname.startsWith(path))
        ? "bg-white text-gray-900 shadow-sm"
        : "text-gray-300 hover:text-white hover:bg-white/10"
    }`;

  const isAdminPage = ["/clients", "/matters", "/users", "/audit", "/usage", "/playbooks"].includes(pathname);

  const dropdownLinkClass = (path: string) =>
    `block px-4 py-2 text-sm transition-colors ${
      pathname === path
        ? "bg-blue-50 text-blue-700 font-medium"
        : "text-gray-700 hover:bg-gray-100"
    }`;

  return (
    <nav className="bg-gray-900 border-b border-gray-800">
      <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/images/henry-mcs.png"
            alt="Henry MCS"
            style={{ height: "36px", width: "auto" }}
          />
          <span className="text-white font-bold text-lg">Henry MCS</span>
        </Link>
        <div className="flex items-center gap-2">
          <Link href="/assist" className={linkClass("/assist")}>
            Assist
          </Link>
          <Link href="/breakdown" className={linkClass("/breakdown")}>
            Breakdown
          </Link>
          <Link href="/compare" className={linkClass("/compare")}>
            Compare
          </Link>
          <Link href="/matrix" className={linkClass("/matrix")}>
            Matrix
          </Link>
{user.role === "admin" && (
            <>
              <span className="w-px bg-gray-700 mx-1" />
              <div className="relative" ref={dropdownRef}>
                <button
                  onClick={() => setAdminOpen(!adminOpen)}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-1 ${
                    isAdminPage
                      ? "bg-white text-gray-900 shadow-sm"
                      : "text-gray-300 hover:text-white hover:bg-white/10"
                  }`}
                >
                  Admin
                  <svg
                    className={`w-3.5 h-3.5 transition-transform ${adminOpen ? "rotate-180" : ""}`}
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
                {adminOpen && (
                  <div className="absolute right-0 mt-1 w-44 bg-white rounded-lg shadow-lg border border-gray-200 py-1 z-50">
                    <Link
                      href="/users"
                      className={dropdownLinkClass("/users")}
                      onClick={() => setAdminOpen(false)}
                    >
                      Users
                    </Link>
                    <Link
                      href="/clients"
                      className={dropdownLinkClass("/clients")}
                      onClick={() => setAdminOpen(false)}
                    >
                      Clients
                    </Link>
                    <Link
                      href="/matters"
                      className={dropdownLinkClass("/matters")}
                      onClick={() => setAdminOpen(false)}
                    >
                      Matters
                    </Link>
                    <Link
                      href="/playbooks"
                      className={dropdownLinkClass("/playbooks")}
                      onClick={() => setAdminOpen(false)}
                    >
                      Playbooks
                    </Link>
                    <div className="border-t border-gray-100 my-1" />
                    <Link
                      href="/audit"
                      className={dropdownLinkClass("/audit")}
                      onClick={() => setAdminOpen(false)}
                    >
                      Audit Log
                    </Link>
                    <Link
                      href="/usage"
                      className={dropdownLinkClass("/usage")}
                      onClick={() => setAdminOpen(false)}
                    >
                      Usage & Cost
                    </Link>
                  </div>
                )}
              </div>
            </>
          )}
          <span className="w-px bg-gray-700 mx-1" />
          <Link
            href="/my-usage"
            className="flex items-center gap-2 px-2 py-1 rounded-lg hover:bg-white/10 transition-colors group"
            title="My Usage"
          >
            <div className="w-7 h-7 rounded-full bg-indigo-500 flex items-center justify-center text-white text-xs font-semibold shrink-0">
              {user.username[0]?.toUpperCase() ?? "U"}
            </div>
            <span className="text-gray-300 group-hover:text-white text-sm font-medium">{user.username}</span>
          </Link>
          <Link
            href="/suggestions"
            title="Feedback Forum"
            className={`p-1.5 rounded-lg transition-colors ${
              pathname.startsWith("/suggestions")
                ? "text-white bg-white/20"
                : "text-gray-400 hover:text-white hover:bg-white/10"
            }`}
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M10.343 3.94c.09-.542.56-.94 1.11-.94h1.093c.55 0 1.02.398 1.11.94l.149.894c.07.424.384.764.78.93.398.164.855.142 1.205-.108l.737-.527a1.125 1.125 0 011.45.12l.773.774c.39.389.44 1.002.12 1.45l-.527.737c-.25.35-.272.806-.107 1.204.165.397.505.71.93.78l.893.15c.543.09.94.56.94 1.109v1.094c0 .55-.397 1.02-.94 1.11l-.893.149c-.425.07-.765.383-.93.78-.165.398-.143.854.107 1.204l.527.738c.32.447.269 1.06-.12 1.45l-.774.773a1.125 1.125 0 01-1.449.12l-.738-.527c-.35-.25-.806-.272-1.203-.107-.397.165-.71.505-.781.929l-.149.894c-.09.542-.56.94-1.11.94h-1.094c-.55 0-1.019-.398-1.11-.94l-.148-.894c-.071-.424-.384-.764-.781-.93-.398-.164-.854-.142-1.204.108l-.738.527c-.447.32-1.06.269-1.45-.12l-.773-.774a1.125 1.125 0 01-.12-1.45l.527-.737c.25-.35.273-.806.108-1.204-.165-.397-.505-.71-.93-.78l-.894-.15c-.542-.09-.94-.56-.94-1.109v-1.094c0-.55.398-1.02.94-1.11l.894-.149c.424-.07.765-.383.93-.78.165-.398.143-.854-.107-1.204l-.527-.738a1.125 1.125 0 01.12-1.45l.773-.773a1.125 1.125 0 011.45-.12l.737.527c.35.25.807.272 1.204.107.397-.165.71-.505.78-.929l.15-.894z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </Link>
          <button
            onClick={logout}
            className="px-3 py-1.5 rounded-lg text-sm font-medium text-gray-300 border border-gray-700 hover:border-gray-500 hover:text-white hover:bg-white/10 transition-colors"
          >
            Logout
          </button>
        </div>
      </div>
    </nav>
  );
}
