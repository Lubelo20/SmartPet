"use client";

import { X } from "lucide-react";
import { TONE } from "@/components/ui/tone";
import type { Tone } from "@/lib/types";

type ToastNotificationProps = {
  tone?: Tone;
  title: string;
  message?: string;
  onClose: () => void;
};

export function ToastNotification({ tone = "success", title, message, onClose }: ToastNotificationProps) {
  const t = TONE[tone] || TONE.success;
  const Icon = t.Icon;
  // Critical events interrupt; everything else waits for a pause in speech.
  // Only discrete events reach here — never telemetry, which ticks every 400 ms
  // and would make a live region announce continuously.
  const critical = tone === "critical";
  return (
    <div
      role={critical ? "alert" : "status"}
      aria-live={critical ? "assertive" : "polite"}
      className={`pointer-events-auto flex items-start gap-3 w-full sm:w-96 bg-white border ${t.ring} rounded-2xl shadow-lg p-4`}
    >
      <span className={`shrink-0 mt-0.5 ${t.text}`}><Icon size={18} /></span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-slate-900">{title}</p>
        {message && <p className="text-sm text-slate-500 mt-0.5 break-words">{message}</p>}
      </div>
      <button
        onClick={onClose}
        aria-label={`Dismiss notification: ${title}`}
        className="p-1 rounded-lg text-slate-500 hover:text-slate-600 hover:bg-slate-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400"
      >
        <X size={14} />
      </button>
    </div>
  );
}
