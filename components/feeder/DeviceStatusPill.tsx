"use client";

import { timeAgo } from "@/lib/utils";

type DeviceStatusPillProps = { online: boolean; lastHeartbeat: number };

export function DeviceStatusPill({ online, lastHeartbeat }: DeviceStatusPillProps) {
  return (
    <div className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 ${online ? "border-emerald-200 bg-emerald-50" : "border-rose-200 bg-rose-50"}`}>
      <span className="relative flex w-2 h-2">
        {online && <span className="absolute inline-flex w-full h-full rounded-full bg-emerald-400 opacity-75 animate-ping" />}
        <span className={`relative inline-flex w-2 h-2 rounded-full ${online ? "bg-emerald-500" : "bg-rose-500"}`} />
      </span>
      <span className={`text-xs font-semibold ${online ? "text-emerald-700" : "text-rose-700"}`}>
        {online ? "Device online" : "Device offline"}
      </span>
      <span className="hidden sm:inline text-xs text-slate-400 border-l border-slate-200 pl-2" suppressHydrationWarning>{timeAgo(lastHeartbeat)}</span>
    </div>
  );
}
