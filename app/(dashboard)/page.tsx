"use client";

import { useMemo } from "react";
import Link from "next/link";
import { ChevronRight, Clock, Gauge, Play, Radio, Utensils, Wifi, WifiOff } from "lucide-react";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Tooltip, XAxis, YAxis } from "recharts";
import type { TooltipValueType } from "recharts";
import { CameraPreview } from "@/components/feeder/CameraPreview";
import { ChartFrame } from "@/components/feeder/ChartFrame";
import { FeedingWorkflow } from "@/components/feeder/FeedingWorkflow";
import { PetAvatar } from "@/components/feeder/PetAvatar";
import { PetDetectionPanel } from "@/components/feeder/PetDetectionPanel";
import { StatusCard } from "@/components/feeder/StatusCard";
import { WeightMonitor } from "@/components/feeder/WeightMonitor";
import { Card } from "@/components/ui/Card";
import { ErrorState } from "@/components/ui/ErrorState";
import { LoadingState } from "@/components/ui/LoadingState";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { SectionHead } from "@/components/ui/SectionHead";
import { TONE } from "@/components/ui/tone";
import { useAnalytics } from "@/hooks/useAnalytics";
import { useFeederData } from "@/hooks/useFeederData";
import { PET_HEX } from "@/lib/analytics";
import { dayKey, timeAgo } from "@/lib/utils";

// Matches Button's ghost/sm output exactly (`components/ui/Button.tsx`) so a
// `next/link` can stand in for what was `onClick={() => onNavigate(...)}` in
// the source without nesting a `<button>` inside the `<a>`'s own semantics.
const navLinkClass =
  "inline-flex items-center gap-2 font-semibold rounded-xl transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-amber-400 justify-center text-xs px-3 py-2 bg-white text-slate-700 border border-slate-200 hover:bg-slate-50";

const chartAxis = { stroke: "#94a3b8", fontSize: 12, tickLine: false, axisLine: false };
const tooltipStyle = {
  contentStyle: { borderRadius: 12, border: "1px solid #e2e8f0", boxShadow: "0 8px 24px rgba(15,23,42,0.08)", fontSize: 12 },
  labelStyle: { color: "#0f172a", fontWeight: 600 },
};

export default function DashboardPage() {
  const { telemetry: t, pets, feedings, schedules, alerts, loading, loadError, reload, requestFeed } = useFeederData();

  const pet = pets.find((p) => p.id === (t.detection.petId || t.cycle.petId));
  const hopperPct = (t.hopper.grams / t.hopper.capacity) * 100;
  const today = feedings.filter((f) => dayKey(f.timestamp) === dayKey(Date.now()));
  const plannedToday = schedules.filter((s) => s.enabled).length;
  const next = useMemo(() => {
    const now = new Date();
    const mins = now.getHours() * 60 + now.getMinutes();
    const upcoming = schedules.filter((s) => s.enabled)
      .map((s) => ({ ...s, mins: Number(s.time.slice(0, 2)) * 60 + Number(s.time.slice(3)) }))
      .sort((a, b) => a.mins - b.mins);
    return upcoming.find((s) => s.mins > mins) || upcoming[0] || null;
  }, [schedules]);
  const nextPet = next ? pets.find((p) => p.id === next.petId) : null;
  const unread = alerts.filter((a) => !a.read);
  const analytics = useAnalytics(feedings, pets);

  if (loadError) return <Card><ErrorState message={loadError} onRetry={reload} /></Card>;
  if (loading) return <Card><LoadingState label="Loading feeder data" rows={4} /></Card>;

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-5">
        <StatusCard
          label="Device status" icon={t.device.online ? Wifi : WifiOff}
          tone={t.device.online ? "success" : "critical"}
          value={t.device.online ? "ONLINE" : "OFFLINE"}
          caption={`Last update ${timeAgo(t.device.lastHeartbeat)}`}
        >
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
            <span className="font-mono">{t.device.id}</span>
            <span>{t.device.ssid} · {t.device.rssi} dBm</span>
          </div>
        </StatusCard>

        <StatusCard
          label="Food available" icon={Gauge}
          tone={hopperPct < 20 ? "critical" : hopperPct < 40 ? "warning" : "success"}
          value={Math.round(t.hopper.grams)} unit="g"
          caption={`${Math.round(hopperPct)}% of a ${t.hopper.capacity} g hopper`}
        >
          <ProgressBar value={hopperPct} tone={hopperPct < 20 ? "rose" : hopperPct < 40 ? "amber" : "emerald"} />
        </StatusCard>

        <StatusCard
          label="Today's feeding" icon={Utensils} tone="info"
          value={`${today.length} / ${plannedToday}`} unit="meals"
          caption={`${today.reduce((s, f) => s + f.actualG, 0)} g dispensed today`}
        >
          <div className="flex gap-1">
            {Array.from({ length: plannedToday }).map((_, i) => (
              <span key={i} className={`h-1.5 flex-1 rounded-full ${i < today.length ? "bg-sky-500" : "bg-slate-200"}`} />
            ))}
          </div>
        </StatusCard>

        <StatusCard
          label="Next feeding" icon={Clock} tone="warning"
          value={next ? next.time : "—"}
          caption={nextPet ? `${nextPet.name} · ${next!.portionG} g portion` : "No schedule enabled"}
        >
          <Link href="/feeding" className={`${navLinkClass} w-full`}>
            <ChevronRight size={16} strokeWidth={2} />
            Open feeding controls
          </Link>
        </StatusCard>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
        <div className="xl:col-span-2 space-y-5">
          <Card className="p-5">
            <SectionHead title="Live camera" subtitle="ESP32-CAM frame with the classifier overlay"
              right={<Link href="/live" className={navLinkClass}><Radio size={16} strokeWidth={2} />Full view</Link>} />
            <CameraPreview detection={t.detection} pet={pet} online={t.device.online && t.camera.online} />
          </Card>
          <WeightMonitor bowl={t.bowl} servo={t.servo} cycle={t.cycle} />
        </div>

        <div className="space-y-5">
          <PetDetectionPanel detection={t.detection} pet={pet} />
          <Card className="p-5">
            <SectionHead title="Quick feed" subtitle="Send a manual dispense command" />
            <div className="space-y-2">
              {pets.map((p) => (
                <button key={p.id} onClick={() => requestFeed(p)}
                  className="w-full flex items-center gap-3 rounded-xl border border-slate-200 px-3 py-2.5 text-left hover:border-amber-300 hover:bg-amber-50 transition-colors">
                  <PetAvatar pet={p} size={36} />
                  <span className="flex-1 min-w-0">
                    <span className="block text-sm font-semibold text-slate-900">{p.name}</span>
                    <span className="block text-xs text-slate-500">{p.portionG} g portion</span>
                  </span>
                  <Play size={16} className="text-slate-500" />
                </button>
              ))}
            </div>
          </Card>
          <Card className="p-5">
            <SectionHead title="Recent alerts" subtitle={`${unread.length} unread`}
              right={<Link href="/alerts" className={navLinkClass}>All</Link>} />
            <div className="space-y-3">
              {alerts.slice(0, 3).map((a) => {
                const tone = TONE[a.severity];
                return (
                  <div key={a.id} className="flex items-start gap-3">
                    <span className={`mt-1.5 w-2 h-2 rounded-full shrink-0 ${tone.dot}`} />
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-slate-900 truncate">{a.title}</p>
                      <p className="text-xs text-slate-500">{timeAgo(a.timestamp)}</p>
                    </div>
                  </div>
                );
              })}
              {alerts.length === 0 && <p className="text-sm text-slate-500">Nothing to report.</p>}
            </div>
          </Card>
        </div>
      </div>

      <FeedingWorkflow cycle={t.cycle} />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <ChartFrame title="Food consumed per day" subtitle="Last 14 days, all pets combined">
          <AreaChart data={analytics.daily} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
            <defs>
              <linearGradient id="spfArea" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#f59e0b" stopOpacity={0.28} />
                <stop offset="100%" stopColor="#f59e0b" stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
            <XAxis dataKey="label" {...chartAxis} />
            <YAxis {...chartAxis} width={52} unit=" g" />
            <Tooltip {...tooltipStyle} formatter={(v: TooltipValueType | undefined) => [`${Number(v)} g`, "Consumed"]} />
            <Area type="monotone" dataKey="grams" stroke="#f59e0b" strokeWidth={2.5} fill="url(#spfArea)" />
          </AreaChart>
        </ChartFrame>
        <ChartFrame title="Consumption by pet" subtitle="Total grams over the recorded period">
          <BarChart data={analytics.perPet} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
            <XAxis dataKey="name" {...chartAxis} />
            <YAxis {...chartAxis} width={52} unit=" g" />
            <Tooltip {...tooltipStyle} formatter={(v: TooltipValueType | undefined) => [`${Number(v)} g`, "Consumed"]} cursor={{ fill: "#f8fafc" }} />
            <Bar dataKey="grams" radius={[8, 8, 0, 0]} maxBarSize={64}>
              {analytics.perPet.map((p) => <Cell key={p.name} fill={PET_HEX[p.colour] || "#0f172a"} />)}
            </Bar>
          </BarChart>
        </ChartFrame>
      </div>
    </div>
  );
}
