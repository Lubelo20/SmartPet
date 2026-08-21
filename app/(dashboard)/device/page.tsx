"use client";

import { Fragment } from "react";
import {
  Activity, ChevronRight, Cpu, LayoutDashboard, Power, RefreshCw, Scale, Server, Signal, Wifi, WifiOff,
} from "lucide-react";
import { DeviceStatusPill } from "@/components/feeder/DeviceStatusPill";
import { StatusCard } from "@/components/feeder/StatusCard";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { ErrorState } from "@/components/ui/ErrorState";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { SectionHead } from "@/components/ui/SectionHead";
import { useFeederData } from "@/hooks/useFeederData";
import { clamp, fmtDate, fmtUptime, timeAgo } from "@/lib/utils";

const DATA_PATH = [
  { icon: Cpu, t: "ESP32", s: "Sensors + servo" },
  { icon: Wifi, t: "Wi-Fi / MQTT", s: "Publishes telemetry" },
  { icon: Server, t: "Firebase", s: "Stores + fans out" },
  { icon: LayoutDashboard, t: "Dashboard", s: "Renders live state" },
];

export default function DevicePage() {
  const { telemetry: t, sendCommand, loadError, reload } = useFeederData();

  if (loadError) return <Card><ErrorState message={loadError} onRetry={reload} /></Card>;

  const d = t.device;
  const rows: [string, string][] = [
    ["Firmware", d.firmware], ["IP address", d.ip], ["Wi-Fi network", d.ssid],
    ["Signal", `${d.rssi} dBm`], ["MQTT broker", d.mqtt], ["Free heap", `${d.freeHeapKb} kB`],
    ["Uptime", fmtUptime(d.uptimeS)], ["Last heartbeat", timeAgo(d.lastHeartbeat)],
  ];

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
      <Card className="p-6 lg:col-span-1">
        <div className="flex items-center gap-4">
          <span className="w-14 h-14 rounded-2xl bg-slate-900 text-white flex items-center justify-center"><Cpu size={24} /></span>
          <div>
            <p className="text-sm font-bold text-slate-900">ESP32 DevKit v1</p>
            <p className="text-xs font-mono text-slate-400">{d.id}</p>
          </div>
        </div>
        <div className="mt-5"><DeviceStatusPill online={d.online} lastHeartbeat={d.lastHeartbeat} /></div>
        <dl className="mt-6 space-y-3">
          {rows.map(([k, v]) => (
            <div key={k} className="flex items-center justify-between text-sm border-b border-slate-50 pb-2">
              <dt className="text-slate-500">{k}</dt><dd className="font-medium font-mono text-slate-900">{v}</dd>
            </div>
          ))}
        </dl>
      </Card>

      <div className="lg:col-span-2 space-y-5">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
          <StatusCard label="Connection" icon={d.online ? Wifi : WifiOff} tone={d.online ? "success" : "critical"}
            value={d.online ? "ONLINE" : "OFFLINE"} caption={`Heartbeat ${timeAgo(d.lastHeartbeat)}`} />
          <StatusCard label="Signal strength" icon={Signal} tone={d.rssi > -60 ? "success" : "warning"}
            value={d.rssi} unit="dBm" caption={d.rssi > -60 ? "Strong" : "Usable"}>
            <ProgressBar value={clamp(((d.rssi + 90) / 45) * 100, 0, 100)} tone={d.rssi > -60 ? "emerald" : "amber"} />
          </StatusCard>
          <StatusCard label="Uptime" icon={Activity} tone="info" value={fmtUptime(d.uptimeS).split(" ")[0]}
            caption={<span suppressHydrationWarning>{`Running since ${fmtDate(Date.now() - d.uptimeS * 1000)}`}</span>} />
        </div>

        <Card className="p-5">
          <SectionHead title="Device actions" subtitle="Outgoing commands on petfeeder/{deviceId}/command" />
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Button variant="ghost" icon={RefreshCw} onClick={() => void sendCommand("device.config", { action: "ping" }, "Ping sent", "The feeder acknowledged the request.")}>Ping device</Button>
            <Button variant="ghost" icon={Scale} onClick={() => void sendCommand("device.config", { action: "tare" }, "Load cell tared", "Bowl weight was reset to zero.")}>Tare load cell</Button>
            <Button variant="ghost" icon={Power} onClick={() => void sendCommand("device.config", { action: "restart" }, "Restart queued", "The ESP32 will reboot on the next heartbeat.")}>Restart ESP32</Button>
          </div>
        </Card>

        <Card className="p-5">
          <SectionHead title="Data path" subtitle="How readings reach this dashboard" />
          <div className="flex flex-col sm:flex-row items-stretch gap-3">
            {DATA_PATH.map((n, i) => (
              <Fragment key={n.t}>
                <div className="flex-1 rounded-xl border border-slate-200 p-4 text-center">
                  <span className="inline-flex w-10 h-10 rounded-xl bg-slate-100 text-slate-700 items-center justify-center mb-2"><n.icon size={18} /></span>
                  <p className="text-sm font-semibold text-slate-900">{n.t}</p>
                  <p className="text-xs text-slate-400">{n.s}</p>
                </div>
                {i < 3 && <div className="hidden sm:flex items-center text-slate-300"><ChevronRight size={18} /></div>}
              </Fragment>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}
