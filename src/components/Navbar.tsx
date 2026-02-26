"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export default function Navbar() {
  const pathname = usePathname();

  const linkClass = (path: string) =>
    `px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
      pathname === path
        ? "bg-white text-gray-900 shadow-sm"
        : "text-gray-300 hover:text-white hover:bg-white/10"
    }`;

  return (
    <nav className="bg-gray-900 border-b border-gray-800">
      <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between">
        <Link href="/" className="text-white font-bold text-lg">
          Henry MCS
        </Link>
        <div className="flex gap-2">
          <Link href="/summary" className={linkClass("/summary")}>
            Document Summary
          </Link>
          <Link href="/breakdown" className={linkClass("/breakdown")}>
            Document Breakdown
          </Link>
        </div>
      </div>
    </nav>
  );
}
