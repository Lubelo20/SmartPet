"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LogOut, PawPrint, Settings, X } from "lucide-react";
import { CONFIG } from "@/lib/config";
import { NAV } from "@/lib/nav";

type SidebarProps = { unread: number; onClose?: () => void };

export function Sidebar({ unread, onClose }: SidebarProps) {
  const pathname = usePathname();
  return (
    <div className="flex flex-col h-full bg-white border-r border-slate-200">
      <div className="flex items-center gap-3 px-5 h-16 border-b border-slate-100">
        <span className="w-9 h-9 rounded-xl bg-slate-900 text-white flex items-center justify-center"><PawPrint size={18} /></span>
        <div className="min-w-0">
          <p className="text-sm font-bold text-slate-900 leading-tight truncate">Smart Pet Feeder</p>
          <p className="text-xs text-slate-400 font-mono truncate">{CONFIG.deviceId}</p>
        </div>
        {onClose && <button onClick={onClose} className="ml-auto p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 lg:hidden"><X size={18} /></button>}
      </div>

      <nav className="flex-1 overflow-y-auto p-3 space-y-1">
        {NAV.map((n) => {
          const active = pathname === n.href;
          return (
            <Link key={n.key} href={n.href} onClick={onClose}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors
                ${active ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"}`}>
              <n.icon size={18} strokeWidth={2} />
              <span className="flex-1 text-left">{n.label}</span>
              {n.key === "alerts" && unread > 0 && (
                <span className={`px-1.5 py-0.5 rounded-md text-xs font-bold ${active ? "bg-white text-slate-900" : "bg-amber-100 text-amber-700"}`}>{unread}</span>
              )}
            </Link>
          );
        })}
      </nav>

      <div className="p-3 border-t border-slate-100">
        <div className="flex items-center gap-3 px-2 py-2 rounded-xl">
          <span className="w-9 h-9 rounded-xl bg-slate-100 text-slate-600 flex items-center justify-center font-bold text-sm">NM</span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-slate-900 truncate">Ndumiso Mngomezulu</p>
            <p className="text-xs text-slate-400 truncate">Feeder owner</p>
          </div>
        </div>
        <div className="mt-1 space-y-1">
          <Link href="/settings" onClick={onClose} className="w-full flex items-center gap-3 px-3 py-2 rounded-xl text-sm font-medium text-slate-600 hover:bg-slate-100">
            <Settings size={16} /> Settings
          </Link>
          <button className="w-full flex items-center gap-3 px-3 py-2 rounded-xl text-sm font-medium text-slate-600 hover:bg-slate-100">
            <LogOut size={16} /> Log out
          </button>
        </div>
      </div>
    </div>
  );
}
