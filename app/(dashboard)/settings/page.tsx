"use client";

import { useEffect, useState } from "react";
import { Check } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { ErrorState } from "@/components/ui/ErrorState";
import { Field } from "@/components/ui/Field";
import { Input } from "@/components/ui/Input";
import { SectionHead } from "@/components/ui/SectionHead";
import { Select } from "@/components/ui/Select";
import { useFeederData } from "@/hooks/useFeederData";
import { CONFIG } from "@/lib/config";
import type { Settings } from "@/lib/types";

type NotificationKey = keyof Settings["notifications"];

const NOTIFICATIONS: [NotificationKey, string][] = [
  ["lowFood", "Low food level"], ["offline", "Device offline"],
  ["feedingError", "Feeding errors"], ["unknownPet", "Unknown pet detected"],
];

export default function SettingsPage() {
  const { telemetry: t, settings, saveSettings, loadError, reload } = useFeederData();
  const [form, setForm] = useState<Settings>(settings);
  useEffect(() => setForm(settings), [settings]);

  if (loadError) return <Card><ErrorState message={loadError} onRetry={reload} /></Card>;

  const set = <K extends keyof Settings>(k: K, v: Settings[K]) => setForm((f) => ({ ...f, [k]: v }));
  const toggle = (k: NotificationKey) =>
    setForm((f) => ({ ...f, notifications: { ...f.notifications, [k]: !f.notifications[k] } }));

  const deviceRows: [string, string][] = [
    ["Device ID", t.device.id], ["Wi-Fi", `${t.device.ssid} (${t.device.rssi} dBm)`], ["MQTT", t.device.mqtt],
    ["Firmware", t.device.firmware], ["Data source", CONFIG.dataSource], ["Transport", CONFIG.transport],
  ];

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
      <Card className="p-5">
        <SectionHead title="General" subtitle="How the feeder is labelled in this dashboard" />
        <div className="space-y-4">
          <Field label="Device name"><Input value={form.deviceName} onChange={(e) => set("deviceName", e.target.value)} /></Field>
          <Field label="Time zone" hint="Shown on records. Schedules run on this browser's local time until the feeder owns a clock.">
            <Select value={form.timezone} onChange={(e) => set("timezone", e.target.value)}>
              <option>Africa/Johannesburg (SAST)</option><option>UTC</option><option>Africa/Nairobi (EAT)</option>
            </Select>
          </Field>
          <Field label="Measurement unit">
            <Select value={form.unit} onChange={(e) => set("unit", e.target.value)}><option>Grams (g)</option></Select>
          </Field>
        </div>
      </Card>

      <Card className="p-5">
        <SectionHead title="Feeding" subtitle="Defaults applied when no profile value exists" />
        <div className="space-y-4">
          <Field label="Default portion (g)"><Input type="number" value={form.defaultPortion} onChange={(e) => set("defaultPortion", Number(e.target.value))} /></Field>
          <Field label="Maximum daily portion per pet (g)" hint="The device refuses commands beyond this total">
            <Input type="number" value={form.maxDaily} onChange={(e) => set("maxDaily", Number(e.target.value))} />
          </Field>
          <Field label="Confidence threshold (%)" hint="Below this, the feeder will not dispense">
            <Input type="number" value={form.confidenceThreshold} onChange={(e) => set("confidenceThreshold", Number(e.target.value))} />
          </Field>
        </div>
      </Card>

      <Card className="p-5">
        <SectionHead title="Device" subtitle="Read from the last heartbeat" />
        <dl className="space-y-3">
          {deviceRows.map(([k, v]) => (
            <div key={k} className="flex items-center justify-between text-sm border-b border-slate-50 pb-2">
              <dt className="text-muted">{k}</dt><dd className="font-medium font-mono text-ink">{v}</dd>
            </div>
          ))}
        </dl>
      </Card>

      <Card className="p-5">
        <SectionHead title="Notifications" subtitle="Choose what raises an alert" />
        <div className="space-y-2">
          {NOTIFICATIONS.map(([k, label]) => (
            <button
              key={k}
              onClick={() => toggle(k)}
              // role=switch + aria-checked is what makes this announce as
              // "on"/"off" rather than as an unlabelled button whose state is
              // conveyed only by colour.
              role="switch"
              aria-checked={form.notifications[k]}
              className="w-full flex items-center justify-between rounded-xl border border-line px-4 py-3 hover:bg-surface-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400"
            >
              <span className="text-sm font-medium text-ink">{label}</span>
              <span aria-hidden="true" className={`relative w-10 h-6 rounded-full transition-colors ${form.notifications[k] ? "bg-emerald-500" : "bg-line"}`}>
                <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-surface shadow transition-all ${form.notifications[k] ? "left-4" : "left-0.5"}`} />
              </span>
            </button>
          ))}
        </div>
      </Card>

      <div className="lg:col-span-2 flex justify-end">
        <Button icon={Check} onClick={() => saveSettings(form)}>Save settings</Button>
      </div>
    </div>
  );
}
