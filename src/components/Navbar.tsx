"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/components/AuthContext";

const ALL_TOOLS = [
  { key: "assist",    label: "Assist",     href: "/assist" },
  { key: "breakdown", label: "Breakdown",  href: "/breakdown" },
  { key: "compare",   label: "Compare",    href: "/compare" },
  { key: "matrix",    label: "Matrix",     href: "/matrix" },
];

const MAX_PINS = 6;

export default function Navbar() {
  const pathname = usePathname();
  const { user, logout } = useAuth();
  const [adminOpen, setAdminOpen] = useState(false);
  const [toolsOpen, setToolsOpen] = useState(false);
  const [reportingOpen, setReportingOpen] = useState(false);
  const [userOpen, setUserOpen] = useState(false);
  const [pins, setPins] = useState<string[]>(["assist"]);
  const adminRef = useRef<HTMLDivElement>(null);
  const toolsRef = useRef<HTMLDivElement>(null);
  const reportingRef = useRef<HTMLDivElement>(null);
  const userRef = useRef<HTMLDivElement>(null);

  // Determine which tools this user can access
  const isAdmin = user?.role === "admin";
  const visibleTools = ALL_TOOLS.filter(t => isAdmin || (user?.pages ?? []).includes(t.key));
  const canAudit = isAdmin || (user?.pages ?? []).includes("audit");
  const canUsage = isAdmin || (user?.pages ?? []).includes("usage");

  useEffect(() => {
    async function loadPins() {
      try {
        const res = await fetch("/api/user/nav-pins");
        if (res.ok) {
          const data = await res.json();
          setPins(data.pins);
        }
      } catch {
        // keep default
      }
    }
    if (user) loadPins();
  }, [user]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (adminRef.current && !adminRef.current.contains(e.target as Node)) {
        setAdminOpen(false);
      }
      if (toolsRef.current && !toolsRef.current.contains(e.target as Node)) {
        setToolsOpen(false);
      }
      if (reportingRef.current && !reportingRef.current.contains(e.target as Node)) {
        setReportingOpen(false);
      }
      if (userRef.current && !userRef.current.contains(e.target as Node)) {
        setUserOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  async function togglePin(key: string) {
    const isPinned = pins.includes(key);
    const newPins = isPinned
      ? pins.filter((p) => p !== key)
      : pins.length >= MAX_PINS
      ? pins
      : [...pins, key];
    if (newPins === pins) return;
    setPins(newPins);
    try {
      await fetch("/api/user/nav-pins", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pins: newPins }),
      });
    } catch {
      // silent
    }
  }

  if (!user || pathname.startsWith("/word-addin")) return null;

  const linkClass = (path: string) =>
    `px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
      pathname === path || (path !== "/" && pathname.startsWith(path))
        ? "bg-white text-gray-900 shadow-sm"
        : "text-gray-300 hover:text-white hover:bg-white/10"
    }`;

  const isAdminPage = ["/clients", "/matters", "/users", "/audit", "/usage", "/playbooks", "/groups"].includes(pathname);
  const isReportingPage = ["/audit", "/usage"].some(p => pathname.startsWith(p));

  const dropdownLinkClass = (path: string) =>
    `block px-4 py-2 text-sm transition-colors ${
      pathname === path
        ? "bg-blue-50 text-blue-700 font-medium"
        : "text-gray-700 hover:bg-gray-100"
    }`;

  // Highlight "Tools" button if on a tool page that isn't already shown as a pinned link
  const pinnedPaths = visibleTools.filter((t) => pins.includes(t.key)).map((t) => t.href);
  const isOnUnpinnedTool =
    visibleTools.some((t) => pathname.startsWith(t.href)) &&
    !pinnedPaths.some((p) => pathname.startsWith(p));

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
          {/* Pinned tool links */}
          {visibleTools.filter((t) => pins.includes(t.key)).map((tool) => (
            <Link key={tool.key} href={tool.href} className={linkClass(tool.href)}>
              {tool.label}
            </Link>
          ))}

          {/* Tools dropdown */}
          <div className="relative" ref={toolsRef}>
            <button
              onClick={() => setToolsOpen(!toolsOpen)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-1 ${
                isOnUnpinnedTool
                  ? "bg-white text-gray-900 shadow-sm"
                  : "text-gray-300 hover:text-white hover:bg-white/10"
              }`}
            >
              Procedures
              <svg
                className={`w-3.5 h-3.5 transition-transform ${toolsOpen ? "rotate-180" : ""}`}
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>

            {toolsOpen && (
              <div className="absolute left-0 mt-1 w-56 bg-white rounded-lg shadow-lg border border-gray-200 py-1 z-50">
                <p className="px-4 py-1.5 text-xs font-semibold text-gray-400 uppercase tracking-wide">
                  {pins.length} / {MAX_PINS} pinned to navbar
                </p>
                <div className="border-t border-gray-100 mb-1" />
                {visibleTools.map((tool) => {
                  const isPinned = pins.includes(tool.key);
                  const canPin = !isPinned && pins.length < MAX_PINS;
                  const isActive = pathname.startsWith(tool.href);
                  return (
                    <div
                      key={tool.key}
                      className={`flex items-center ${isActive ? "bg-blue-50" : "hover:bg-gray-50"}`}
                    >
                      <Link
                        href={tool.href}
                        className={`flex-1 px-4 py-2 text-sm ${
                          isActive ? "text-blue-700 font-medium" : "text-gray-700"
                        }`}
                        onClick={() => setToolsOpen(false)}
                      >
                        {tool.label}
                      </Link>
                      <button
                        onClick={() => togglePin(tool.key)}
                        disabled={!isPinned && pins.length >= MAX_PINS}
                        title={
                          isPinned
                            ? "Unpin from navbar"
                            : canPin
                            ? "Pin to navbar"
                            : `Max ${MAX_PINS} tools pinned`
                        }
                        className={`mr-3 p-1 rounded transition-colors ${
                          isPinned
                            ? "text-blue-500 hover:text-blue-700"
                            : canPin
                            ? "text-gray-300 hover:text-gray-500"
                            : "text-gray-200 cursor-not-allowed"
                        }`}
                      >
                        {isPinned ? (
                          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                            <path d="M5 3a2 2 0 00-2 2v16l7-3 7 3V5a2 2 0 00-2-2H5z" />
                          </svg>
                        ) : (
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M5 3a2 2 0 00-2 2v16l7-3 7 3V5a2 2 0 00-2-2H5z" />
                          </svg>
                        )}
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Reporting dropdown — for non-admins who have audit/usage access */}
          {!isAdmin && (canAudit || canUsage) && (
            <>
              <span className="w-px bg-gray-700 mx-1" />
              <div className="relative" ref={reportingRef}>
                <button
                  onClick={() => setReportingOpen(!reportingOpen)}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-1 ${
                    isReportingPage
                      ? "bg-white text-gray-900 shadow-sm"
                      : "text-gray-300 hover:text-white hover:bg-white/10"
                  }`}
                >
                  Reporting
                  <svg
                    className={`w-3.5 h-3.5 transition-transform ${reportingOpen ? "rotate-180" : ""}`}
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
                {reportingOpen && (
                  <div className="absolute right-0 mt-1 w-44 bg-white rounded-lg shadow-lg border border-gray-200 py-1 z-50">
                    {canAudit && (
                      <Link href="/audit" className={dropdownLinkClass("/audit")} onClick={() => setReportingOpen(false)}>
                        Audit Log
                      </Link>
                    )}
                    {canUsage && (
                      <Link href="/usage" className={dropdownLinkClass("/usage")} onClick={() => setReportingOpen(false)}>
                        Usage & Cost
                      </Link>
                    )}
                  </div>
                )}
              </div>
            </>
          )}

          {/* Admin dropdown */}
          {isAdmin && (
            <>
              <span className="w-px bg-gray-700 mx-1" />
              <div className="relative" ref={adminRef}>
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
                    <Link href="/users" className={dropdownLinkClass("/users")} onClick={() => setAdminOpen(false)}>
                      Users
                    </Link>
                    <Link href="/groups" className={dropdownLinkClass("/groups")} onClick={() => setAdminOpen(false)}>
                      Groups
                    </Link>
                    <Link href="/clients" className={dropdownLinkClass("/clients")} onClick={() => setAdminOpen(false)}>
                      Clients
                    </Link>
                    <Link href="/matters" className={dropdownLinkClass("/matters")} onClick={() => setAdminOpen(false)}>
                      Matters
                    </Link>
                    <Link href="/playbooks" className={dropdownLinkClass("/playbooks")} onClick={() => setAdminOpen(false)}>
                      Playbooks
                    </Link>
                    <div className="border-t border-gray-100 my-1" />
                    <Link href="/audit" className={dropdownLinkClass("/audit")} onClick={() => setAdminOpen(false)}>
                      Audit Log
                    </Link>
                    <Link href="/usage" className={dropdownLinkClass("/usage")} onClick={() => setAdminOpen(false)}>
                      Usage & Cost
                    </Link>
                  </div>
                )}
              </div>
            </>
          )}

          <span className="w-px bg-gray-700 mx-1" />

          {/* User dropdown */}
          <div className="relative" ref={userRef}>
            <button
              onClick={() => setUserOpen(!userOpen)}
              className="w-8 h-8 rounded-full bg-indigo-500 flex items-center justify-center text-white text-xs font-semibold hover:bg-indigo-400 transition-colors"
              title={user.email}
            >
              {user.email[0]?.toUpperCase() ?? "U"}
            </button>

            {userOpen && (
              <div className="absolute right-0 mt-1 w-52 bg-white rounded-lg shadow-lg border border-gray-200 py-1 z-50">
                <div className="px-4 py-2 border-b border-gray-100">
                  <p className="text-xs text-gray-400">Signed in as</p>
                  <p className="text-sm font-semibold text-gray-800 truncate">{user.email}</p>
                  <p className="text-xs text-gray-400 font-mono mt-0.5">{user.username}</p>
                </div>
                <div className="px-4 pt-2 pb-1">
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Settings</p>
                </div>
                <Link
                  href="/account/profile"
                  className={`flex items-center gap-3 px-4 py-2 text-sm transition-colors ${
                    pathname === "/account/profile" ? "bg-blue-50 text-blue-700 font-medium" : "text-gray-700 hover:bg-gray-50"
                  }`}
                  onClick={() => setUserOpen(false)}
                >
                  <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                  </svg>
                  Profile
                </Link>
                <Link
                  href="/account/security"
                  className={`flex items-center gap-3 px-4 py-2 text-sm transition-colors ${
                    pathname.startsWith("/account/security") ? "bg-blue-50 text-blue-700 font-medium" : "text-gray-700 hover:bg-gray-50"
                  }`}
                  onClick={() => setUserOpen(false)}
                >
                  <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                  </svg>
                  Security
                </Link>
                <div className="border-t border-gray-100 my-1" />
                <Link
                  href="/my-usage"
                  className={`flex items-center gap-3 px-4 py-2 text-sm transition-colors ${
                    pathname === "/my-usage" ? "bg-blue-50 text-blue-700 font-medium" : "text-gray-700 hover:bg-gray-50"
                  }`}
                  onClick={() => setUserOpen(false)}
                >
                  <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                  </svg>
                  My Usage
                </Link>
                <Link
                  href="/suggestions"
                  className={`flex items-center gap-3 px-4 py-2 text-sm transition-colors ${
                    pathname.startsWith("/suggestions") ? "bg-blue-50 text-blue-700 font-medium" : "text-gray-700 hover:bg-gray-50"
                  }`}
                  onClick={() => setUserOpen(false)}
                >
                  <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                  </svg>
                  Feedback Forum
                </Link>
                <Link
                  href="/help"
                  className={`flex items-center gap-3 px-4 py-2 text-sm transition-colors ${
                    pathname.startsWith("/help") ? "bg-blue-50 text-blue-700 font-medium" : "text-gray-700 hover:bg-gray-50"
                  }`}
                  onClick={() => setUserOpen(false)}
                >
                  <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  Help
                </Link>
                <div className="border-t border-gray-100 my-1" />
                <button
                  onClick={() => { setUserOpen(false); logout(); }}
                  className="w-full flex items-center gap-3 px-4 py-2 text-sm text-red-600 hover:bg-red-50 transition-colors"
                >
                  <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                  </svg>
                  Logout
                </button>
                {process.env.NEXT_PUBLIC_APP_VERSION && (
                  <div className="px-4 py-2 border-t border-gray-100">
                    <p className="text-xs text-gray-300">v{process.env.NEXT_PUBLIC_APP_VERSION}</p>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </nav>
  );
}
