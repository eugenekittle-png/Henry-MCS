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

  if (!user) return null;

  const linkClass = (path: string) =>
    `px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
      pathname === path
        ? "bg-white text-gray-900 shadow-sm"
        : "text-gray-300 hover:text-white hover:bg-white/10"
    }`;

  const isAdminPage = ["/clients", "/matters", "/users"].includes(pathname);

  const dropdownLinkClass = (path: string) =>
    `block px-4 py-2 text-sm transition-colors ${
      pathname === path
        ? "bg-blue-50 text-blue-700 font-medium"
        : "text-gray-700 hover:bg-gray-100"
    }`;

  return (
    <nav className="bg-gray-900 border-b border-gray-800">
      <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between">
        <Link href="/" className="text-white font-bold text-lg">
          Henry MCS
        </Link>
        <div className="flex items-center gap-2">
          <Link href="/summary" className={linkClass("/summary")}>
            Summary
          </Link>
          <Link href="/breakdown" className={linkClass("/breakdown")}>
            Breakdown
          </Link>
          <Link href="/compare" className={linkClass("/compare")}>
            Compare
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
                  </div>
                )}
              </div>
            </>
          )}
          <span className="w-px bg-gray-700 mx-1" />
          <span className="text-gray-400 text-xs px-2">{user.username}</span>
          <button
            onClick={logout}
            className="px-3 py-2 rounded-lg text-sm font-medium text-gray-300 hover:text-white hover:bg-white/10 transition-colors"
          >
            Logout
          </button>
        </div>
      </div>
    </nav>
  );
}
