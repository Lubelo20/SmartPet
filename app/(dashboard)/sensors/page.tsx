"use client";

import { Camera, Ruler, RotateCw, Scale } from "lucide-react";
import { Area, AreaChart, CartesianGrid, Tooltip, XAxis, YAxis } from "recharts";
import type { TooltipValueType } from "recharts";
import { ChartFrame } from "@/components/feeder/ChartFrame";
import { SensorCard } from "@/components/feeder/SensorCard";
import { Card } from "@/components/ui/Card";
import { ErrorState } from "@/components/ui/ErrorState";
import { useFeederData } from "@/hooks/useFeederData";
import { fmtTime, timeAgo } from "@/lib/utils";

const chartAxis = { stroke: "#94a3b8", fontSize: 12, tickLine: false, axisLine: false };
const tooltipStyle = {
  contentStyle: { borderRadius: 12, border: "1px solid #e2e8f0", boxShadow: "0 8px 24px rgba(15,23,42,0.08)", fontSize: 12 },
  labelStyle: { color: "#0f172a", fontWeight: 600 },
};

export default function SensorsPage() {
  const { telemetry: t, pets, loadError, reload } = useFeederData();

  if (loadError) return <Card><ErrorState message={loadError} onRetry={reload} /></Card>;

  const pet = pets.find((p) => p.id === (t.detection.petId || t.cycle.petId));
  const detected = t.distanceCm < 35;

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
      <SensorCard icon={Ruler} name="Ultrasonic proximity" part="HC-SR04"
        status={t.device.online ? "Reporting" : "No data"} tone={t.device.online ? "success" : "critical"}
        primary={t.distanceCm} unit="cm" spark={t.history.distance} sparkTone="#0ea5e9"
        rows={[
          { label: "Detection", value: detected ? "Pet at bowl" : "Clear" },
          { label: "Trigger threshold", value: "35 cm" },
          { label: "Last reading", value: timeAgo(t.device.lastHeartbeat) },
        ]} />
      <SensorCard icon={Scale} name="Load cell + amplifier" part="HX711 · 5 kg cell"
        status={t.servo === "DISPENSING" ? "Measuring" : "Stable"} tone={t.servo === "DISPENSING" ? "warning" : "success"}
        primary={t.bowl.grams.toFixed(1)} unit="g" spark={t.history.weight}
        rows={[
          { label: "Target weight", value: t.bowl.targetG ? `${t.bowl.targetG} g` : "—" },
          { label: "Tare offset", value: "-8442" },
          { label: "Calibration factor", value: "419.6" },
        ]} />
      <SensorCard icon={Camera} name="Camera module" part="OV2640 · ESP32-CAM"
        status={t.camera.online && t.device.online ? "Streaming" : "Offline"} tone={t.camera.online && t.device.online ? "success" : "critical"}
        primary={t.detection.confidence ? `${t.detection.confidence.toFixed(1)}%` : "—"} unit="confidence"
        rows={[
          { label: "Classification", value: t.detection.state === "identified" && pet ? pet.name : t.detection.state === "unknown" ? "Unknown" : "Idle" },
          { label: "Frame rate", value: `${t.camera.fps} fps` },
          { label: "Last frame", value: timeAgo(t.camera.lastFrameAt) },
        ]} />
      <SensorCard icon={RotateCw} name="Dispensing servo" part="SG90 · GPIO 13"
        status={t.servo} tone={t.servo === "DISPENSING" ? "warning" : "success"}
        primary={t.servo === "DISPENSING" ? "OPEN" : "CLOSED"}
        rows={[
          { label: "Angle", value: t.servo === "DISPENSING" ? "95°" : "0°" },
          { label: "Cycle state", value: t.cycle.active ? "Active" : "Idle" },
          { label: "Last activation", value: t.cycle.startedAt ? timeAgo(t.cycle.startedAt) : "—" },
        ]} />
      <div className="sm:col-span-2">
        <ChartFrame title="Bowl weight — live trace" subtitle="Rolling window from the HX711 stream" height={220}>
          <AreaChart data={t.history.weight} margin={{ top: 8, right: 8, left: -26, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
            <XAxis dataKey="t" tickFormatter={fmtTime} {...chartAxis} minTickGap={40} />
            <YAxis {...chartAxis} width={46} unit=" g" />
            <Tooltip {...tooltipStyle} labelFormatter={(v) => fmtTime(Number(v))} formatter={(v: TooltipValueType | undefined) => [`${Number(v).toFixed(1)} g`, "Weight"]} />
            <Area type="monotone" dataKey="v" stroke="#f59e0b" strokeWidth={2} fill="#f59e0b" fillOpacity={0.1} isAnimationActive={false} dot={false} />
          </AreaChart>
        </ChartFrame>
      </div>
    </div>
  );
}
