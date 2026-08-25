"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LogOut, PawPrint, Settings, X } from "lucide-react";
import { CONFIG } from "@/lib/config";
import { NAV } from "@/lib/nav";
import { useAuth } from "@/lib/firebase/auth-provider";

type SidebarProps = { unread: number; onClose?: () => void };

/** "Ndumiso Mngomezulu" → "NM"; falls back to the email's first letter. */
function initials(name: string | null, email: string | null): string {
  const source = name?.trim();
  if (source) {
    const parts = source.split(/\s+/).slice(0, 2);
    return parts.map((w) => w[0]?.toUpperCase() ?? "").join("") || "?";
  }
  return email?.[0]?.toUpperCase() ?? "?";
}

export function Sidebar({ unread, onClose }: SidebarProps) {
  const pathname = usePathname();
  const { user, signOutNow } = useAuth();
  // Mock mode runs a fixed fake session, so signing out of it would do nothing.
  const canSignOut = CONFIG.dataSource !== "mock";
  return (
    <div className="flex flex-col h-full bg-surface border-r border-line">
      <div className="flex items-center gap-3 px-5 h-16 border-b border-line-soft">
        <span className="w-9 h-9 rounded-xl bg-inverse text-inverse-ink flex items-center justify-center"><PawPrint size={18} /></span>
        <div className="min-w-0">
          <p className="text-sm font-bold text-ink leading-tight truncate">Smart Pet Feeder</p>
          <p className="text-xs text-muted font-mono truncate">{CONFIG.deviceId}</p>
        </div>
        {onClose && (
          <button onClick={onClose} aria-label="Close navigation"
            className="ml-auto p-1.5 rounded-lg text-muted hover:bg-surface-2 lg:hidden focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400">
            <X size={18} />
          </button>
        )}
      </div>

      <nav className="flex-1 overflow-y-auto p-3 space-y-1">
        {NAV.map((n) => {
          const active = pathname === n.href;
          return (
            <Link key={n.key} href={n.href} onClick={onClose}
              // Tells a screen reader which page it is on; the dark background
              // alone conveys that only to people who can see it.
              aria-current={active ? "page" : undefined}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400
                ${active ? "bg-inverse text-inverse-ink" : "text-ink-2 hover:bg-surface-2 hover:text-ink"}`}>
              <n.icon size={18} strokeWidth={2} aria-hidden="true" />
              <span className="flex-1 text-left">{n.label}</span>
              {n.key === "alerts" && unread > 0 && (
                <span className={`px-1.5 py-0.5 rounded-md text-xs font-bold ${active ? "bg-surface text-ink" : "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-200"}`}>
                  <span className="sr-only">, </span>{unread}<span className="sr-only"> unread</span>
                </span>
              )}
            </Link>
          );
        })}
      </nav>

      <div className="p-3 border-t border-line-soft">
        <div className="flex items-center gap-3 px-2 py-2 rounded-xl">
          <span className="w-9 h-9 rounded-xl bg-surface-2 text-ink-2 flex items-center justify-center font-bold text-sm">
            {initials(user?.displayName ?? null, user?.email ?? null)}
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-ink truncate">
              {user?.displayName || user?.email || "Signed in"}
            </p>
            <p className="text-xs text-muted truncate">
              {user?.displayName && user?.email ? user.email : "Feeder owner"}
            </p>
          </div>
        </div>
        <div className="mt-1 space-y-1">
          <Link href="/settings" onClick={onClose} className="w-full flex items-center gap-3 px-3 py-2 rounded-xl text-sm font-medium text-ink-2 hover:bg-surface-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400">
            <Settings size={16} /> Settings
          </Link>
          {canSignOut && (
            <button onClick={() => void signOutNow()}
              className="w-full flex items-center gap-3 px-3 py-2 rounded-xl text-sm font-medium text-ink-2 hover:bg-surface-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400">
              <LogOut size={16} /> Log out
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
