"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bell, Menu, Moon, SlidersHorizontal, Sun, Users } from "lucide-react";
import { DeviceStatusPill } from "@/components/feeder/DeviceStatusPill";
import { Badge } from "@/components/ui/Badge";
import { NAV } from "@/lib/nav";
import { useTheme } from "@/hooks/useTheme";

type HeaderProps = {
  unread: number;
  demo: boolean;
  showDemo: boolean;
  online: boolean;
  lastHeartbeat: number;
  onOpenNav: () => void;
  onToggleDemo: () => void;
};

export function Header({ unread, demo, showDemo, online, lastHeartbeat, onOpenNav, onToggleDemo }: HeaderProps) {
  const pathname = usePathname();
  const nav = NAV.find((n) => n.href === pathname) || NAV[0];
  const { resolved, setTheme } = useTheme();
  return (
    <header className="sticky top-0 z-20 bg-surface/90 border-b border-line backdrop-blur">
      <div className="flex items-center gap-3 px-4 sm:px-6 h-16">
        <button onClick={onOpenNav} aria-label="Open navigation"
          className="lg:hidden p-2 -ml-2 rounded-lg text-ink-2 hover:bg-surface-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400">
          <Menu size={20} />
        </button>
        <div className="min-w-0 flex-1">
          <h1 className="text-base sm:text-lg font-bold tracking-tight text-ink truncate">{nav.title}</h1>
          <p className="hidden sm:block text-sm text-muted truncate">{nav.subtitle}</p>
        </div>
        {demo && <Badge tone="warning" dot className="hidden sm:inline-flex">Demo mode</Badge>}
        <div className="hidden md:block"><DeviceStatusPill online={online} lastHeartbeat={lastHeartbeat} /></div>
        <button onClick={onToggleDemo} title="Demo controls"
          aria-label="Demo controls" aria-expanded={showDemo}
          className={`p-2 rounded-lg transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 ${showDemo ? "bg-amber-50 text-amber-600" : "text-muted hover:bg-surface-2"}`}>
          <SlidersHorizontal size={18} />
        </button>
        <Link href="/alerts" aria-label={unread > 0 ? `Alerts, ${unread} unread` : "Alerts"} className="relative p-2 rounded-lg text-muted hover:bg-surface-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400">
          <Bell size={18} />
          {unread > 0 && <span aria-hidden="true" className="absolute top-1 right-1 w-2 h-2 rounded-full bg-amber-500" />}
        </Link>
        <button
          onClick={() => setTheme(resolved === "dark" ? "light" : "dark")}
          aria-label={resolved === "dark" ? "Switch to light theme" : "Switch to dark theme"}
          title={resolved === "dark" ? "Light theme" : "Dark theme"}
          className="p-2 rounded-lg text-muted hover:bg-surface-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400"
        >
          {resolved === "dark" ? <Sun size={18} /> : <Moon size={18} />}
        </button>
        <Link href="/household" aria-label="Household" title="Household"
          className="p-2 rounded-lg text-muted hover:bg-surface-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400">
          <Users size={18} />
        </Link>

      </div>
      <div className="md:hidden px-4 pb-3 flex items-center gap-2">
        <DeviceStatusPill online={online} lastHeartbeat={lastHeartbeat} />
        {demo && <Badge tone="warning" dot>Demo</Badge>}
      </div>
    </header>
  );
}
