import { CONFIG } from "@/lib/config";
import type { Telemetry } from "@/lib/types";

export const WORKFLOW_STEPS = [
  { key: "detected", label: "Pet detected", detail: "HC-SR04 proximity trigger" },
  { key: "identified", label: "Pet identified", detail: "CNN classification" },
  { key: "portion", label: "Portion retrieved", detail: "Profile lookup" },
  { key: "dispensing", label: "Food dispensing", detail: "SG90 servo open" },
  { key: "checking", label: "Weight checked", detail: "HX711 + load cell" },
  { key: "reached", label: "Target reached", detail: "Servo closed" },
] as const;

export const initialTelemetry = (now: number): Telemetry => ({
  device: {
    id: CONFIG.deviceId, online: true, ip: "192.168.0.114", ssid: "LubeloTech-2.4G",
    rssi: -58, firmware: "v1.4.2", mqtt: "connected",
    lastHeartbeat: now, uptimeS: 183642, freeHeapKb: 178,
  },
  hopper: { grams: 742, capacity: CONFIG.hopperCapacityG },
  bowl: { grams: 0, targetG: 0 },
  distanceCm: 64,
  servo: "READY",
  camera: { online: true, lastFrameAt: now, fps: 12 },
  detection: { state: "idle", petId: null, confidence: 0, since: now },
  cycle: { active: false, step: -1, petId: null, targetG: 0, trigger: null, startedAt: null, message: "Waiting for a pet" },
  demo: false,
  history: { weight: [], distance: [] },
});

type Listener = (state: Telemetry) => void;
type Patch = Partial<Telemetry> | ((state: Telemetry) => Partial<Telemetry>);

export class TelemetryStore {
  private state: Telemetry;
  private listeners = new Set<Listener>();

  constructor(initial: Telemetry) { this.state = initial; }

  get(): Telemetry { return this.state; }

  set(patch: Patch): void {
    const next = typeof patch === "function" ? patch(this.state) : patch;
    this.state = { ...this.state, ...next };
    this.listeners.forEach((l) => l(this.state));
  }

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => { this.listeners.delete(fn); };
  }
}
