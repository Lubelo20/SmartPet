"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bell, Menu, SlidersHorizontal, Users } from "lucide-react";
import { DeviceStatusPill } from "@/components/feeder/DeviceStatusPill";
import { Badge } from "@/components/ui/Badge";
import { NAV } from "@/lib/nav";

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
  return (
    <header className="sticky top-0 z-20 bg-white/90 border-b border-slate-200 backdrop-blur">
      <div className="flex items-center gap-3 px-4 sm:px-6 h-16">
        <button onClick={onOpenNav} className="lg:hidden p-2 -ml-2 rounded-lg text-slate-600 hover:bg-slate-100"><Menu size={20} /></button>
        <div className="min-w-0 flex-1">
          <h1 className="text-base sm:text-lg font-bold tracking-tight text-slate-900 truncate">{nav.title}</h1>
          <p className="hidden sm:block text-sm text-slate-500 truncate">{nav.subtitle}</p>
        </div>
        {demo && <Badge tone="warning" dot className="hidden sm:inline-flex">Demo mode</Badge>}
        <div className="hidden md:block"><DeviceStatusPill online={online} lastHeartbeat={lastHeartbeat} /></div>
        <button onClick={onToggleDemo}
          className={`p-2 rounded-lg transition-colors ${showDemo ? "bg-amber-50 text-amber-600" : "text-slate-500 hover:bg-slate-100"}`} title="Demo controls">
          <SlidersHorizontal size={18} />
        </button>
        <Link href="/alerts" aria-label="Alerts" className="relative p-2 rounded-lg text-slate-500 hover:bg-slate-100">
          <Bell size={18} />
          {unread > 0 && <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-amber-500" />}
        </Link>
        <Link href="/household" aria-label="Household" title="Household"
          className="p-2 rounded-lg text-slate-500 hover:bg-slate-100">
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
