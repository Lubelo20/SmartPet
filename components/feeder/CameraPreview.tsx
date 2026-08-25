"use client";

import type { Pet, Telemetry } from "@/lib/types";

type CameraPreviewProps = {
  detection: Telemetry["detection"];
  pet: Pet | undefined;
  online: boolean;
  compact?: boolean;
};

export function CameraPreview({ detection, pet, online, compact = false }: CameraPreviewProps) {
  const active = detection.state !== "idle";
  const known = detection.state === "identified";
  const boxTone = detection.state === "unknown" ? "#f43f5e" : known ? "#10b981" : "#f59e0b";
  const label = known ? `${pet ? pet.name.toUpperCase() : "PET"} — ${detection.confidence.toFixed(1)}%`
    : detection.state === "unknown" ? `UNKNOWN — ${detection.confidence.toFixed(1)}%`
    : detection.state === "identifying" ? "CLASSIFYING…" : "MOTION";

  return (
    <div className="relative w-full overflow-hidden rounded-2xl bg-slate-900" style={{ aspectRatio: "16 / 9" }}>
      <svg viewBox="0 0 640 360" className="w-full h-full block">
        <defs>
          <linearGradient id="spfWall" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#111c2e" /><stop offset="100%" stopColor="#0b1220" />
          </linearGradient>
          <linearGradient id="spfFloor" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#1b2740" /><stop offset="100%" stopColor="#0d1526" />
          </linearGradient>
        </defs>
        <rect width="640" height="360" fill="url(#spfWall)" />
        <rect y="228" width="640" height="132" fill="url(#spfFloor)" />
        <line x1="0" y1="228" x2="640" y2="228" stroke="#233149" strokeWidth="2" />
        {[90, 200, 430, 545].map((x) => <line key={x} x1={x} y1="60" x2={x} y2="228" stroke="#1a2740" strokeWidth="2" />)}

        {/* feeder chassis */}
        <g opacity="0.95">
          <rect x="452" y="118" width="126" height="110" rx="8" fill="#16233a" stroke="#2b3c58" strokeWidth="2" />
          <rect x="470" y="70" width="90" height="52" rx="6" fill="#1d2b45" stroke="#334564" strokeWidth="2" />
          <rect x="497" y="122" width="36" height="26" rx="4" fill="#0f1a2c" />
          <circle cx="466" cy="212" r="4" fill={online ? "#10b981" : "#f43f5e"} />
        </g>

        {/* bowl */}
        <ellipse cx="392" cy="284" rx="62" ry="17" fill="#26374f" />
        <ellipse cx="392" cy="280" rx="50" ry="12" fill="#16223a" />

        {/* pet silhouette */}
        <g style={{ opacity: active ? 1 : 0, transition: "opacity 700ms ease" }}>
          <ellipse cx="212" cy="252" rx="76" ry="42" fill="#0f172a" />
          <ellipse cx="212" cy="248" rx="74" ry="40" fill="#334155" />
          <circle cx="292" cy="212" r="34" fill="#334155" />
          <path d="M272 184 q-14 -30 6 -30 q12 4 14 24 z" fill="#334155" />
          <path d="M310 182 q14 -28 20 -8 q2 14 -8 26 z" fill="#334155" />
          <ellipse cx="318" cy="222" rx="16" ry="12" fill="#3f4d63" />
          <circle cx="330" cy="219" r="5" fill="#0f172a" />
          <rect x="176" y="272" width="16" height="34" rx="7" fill="#334155" />
          <rect x="238" y="272" width="16" height="34" rx="7" fill="#334155" />
          <path d="M140 236 q-32 -22 -22 -44 q16 6 30 30 z" fill="#334155" />
        </g>

        {/* detection box */}
        <g style={{ opacity: active ? 1 : 0, transition: "opacity 400ms ease" }}>
          <rect x="118" y="164" width="234" height="152" rx="6" fill="none" stroke={boxTone} strokeWidth="3"
            strokeDasharray={detection.state === "identifying" ? "10 8" : "0"} />
          <rect x="118" y="136" width={label.length * 9.2 + 20} height="26" rx="4" fill={boxTone} />
          <text x="128" y="154" fill="#0b1220" fontSize="15" fontWeight="700" fontFamily="ui-monospace, monospace">{label}</text>
        </g>

        {/* scan lines */}
        {Array.from({ length: 24 }).map((_, i) => (
          <line key={i} x1="0" y1={i * 15} x2="640" y2={i * 15} stroke="#ffffff" strokeWidth="1" opacity="0.02" />
        ))}
      </svg>

      {/* overlay chrome */}
      <div className="absolute top-3 left-3 flex items-center gap-2">
        <span className="inline-flex items-center gap-1.5 rounded-md bg-slate-900/70 px-2 py-1 text-xs font-semibold text-white">
          <span className={`w-1.5 h-1.5 rounded-full ${online ? "bg-rose-500 animate-pulse" : "bg-slate-500"}`} />
          {online ? "LIVE" : "NO SIGNAL"}
        </span>
        <span className="rounded-md bg-slate-900/70 px-2 py-1 text-xs font-mono text-slate-300">CAM-01 · 640×480</span>
      </div>
      <div className="absolute top-3 right-3 rounded-md bg-slate-900/70 px-2 py-1 text-xs font-mono text-slate-300" suppressHydrationWarning>
        {new Date().toLocaleTimeString()}
      </div>
      {!compact && (
        <div className="absolute bottom-3 left-3 right-3 flex items-center justify-between gap-3">
          <span className="rounded-lg bg-slate-900/70 px-3 py-1.5 text-xs font-medium text-slate-200">
            {online ? (active ? "Inference running on frame" : "Waiting for motion") : "Camera unreachable"}
          </span>
          <span className="hidden sm:block rounded-lg bg-slate-900/70 px-3 py-1.5 text-xs font-mono text-slate-300">
            ESP32-CAM stream slot
          </span>
        </div>
      )}
      {!online && <div className="absolute inset-0 bg-slate-900/60 flex items-center justify-center text-sm font-semibold text-slate-300">Camera offline</div>}
    </div>
  );
}
