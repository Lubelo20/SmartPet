"use client";

import { timeAgo } from "@/lib/utils";

type DeviceStatusPillProps = { online: boolean; lastHeartbeat: number };

export function DeviceStatusPill({ online, lastHeartbeat }: DeviceStatusPillProps) {
  return (
    <div className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 ${online ? "border-emerald-200 bg-emerald-50 dark:border-emerald-900 dark:bg-emerald-950" : "border-rose-200 bg-rose-50 dark:border-rose-900 dark:bg-rose-950"}`}>
      <span className="relative flex w-2 h-2">
        {online && <span className="absolute inline-flex w-full h-full rounded-full bg-emerald-400 opacity-75 animate-ping" />}
        <span className={`relative inline-flex w-2 h-2 rounded-full ${online ? "bg-emerald-500" : "bg-rose-500"}`} />
      </span>
      <span className={`text-xs font-semibold ${online ? "text-emerald-700 dark:text-emerald-200" : "text-rose-700 dark:text-rose-200"}`}>
        {online ? "Device online" : "Device offline"}
      </span>
      <span className="hidden sm:inline text-xs text-muted border-l border-line pl-2">{timeAgo(lastHeartbeat)}</span>
    </div>
  );
}
