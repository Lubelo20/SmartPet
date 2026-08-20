export type PetColour = "amber" | "sky" | "emerald" | "violet" | "rose";

export type Pet = {
  id: string; name: string; species: "Dog" | "Cat"; breed: string;
  weightKg: number; portionG: number; mealsPerDay: number;
  status: "Active" | "Paused"; colour: PetColour; note?: string; enrolledAt: string;
};
export type NewPet = Omit<Pet, "id" | "enrolledAt"> & { id?: string };

export type FeedingRecord = {
  id: string; timestamp: number; petId: string; targetG: number; actualG: number;
  status: "Completed" | "Under-dispensed" | "Low confidence";
  confidence: number; trigger: "Manual" | "Scheduled"; durationS: number;
};

export type Schedule = {
  id: string; petId: string; time: string; portionG: number;
  enabled: boolean; days: "Daily" | "Weekdays" | "Weekends";
};
export type NewSchedule = Omit<Schedule, "id">;

export type AlertSeverity = "critical" | "warning" | "info";
export type Alert = {
  id: string; severity: AlertSeverity; type: string; title: string;
  message: string; source: string; timestamp: number; read: boolean;
};

export type DetectionState = "idle" | "detected" | "identifying" | "identified" | "unknown";

export type DeviceStatus = {
  id: string; online: boolean; ip: string; ssid: string; rssi: number;
  firmware: string; mqtt: string; lastHeartbeat: number; uptimeS: number; freeHeapKb: number;
};

export type Telemetry = {
  device: DeviceStatus;
  hopper: { grams: number; capacity: number };
  bowl: { grams: number; targetG: number };
  distanceCm: number;
  servo: "READY" | "DISPENSING";
  camera: { online: boolean; lastFrameAt: number; fps: number };
  detection: { state: DetectionState; petId: string | null; confidence: number; since: number };
  cycle: {
    active: boolean; step: number; petId: string | null; targetG: number;
    trigger: string | null; startedAt: number | null; message: string;
  };
  demo: boolean;
  history: { weight: { t: number; v: number }[]; distance: { t: number; v: number }[] };
};

export type EngineEvent =
  | { kind: "demo"; on: boolean }
  | { kind: "cycle:start"; petId: string; targetG: number; trigger: string }
  | { kind: "cycle:stopped"; reason: string; petId: string | null; dispensedG: number; targetG: number }
  | { kind: "cycle:complete"; record: FeedingRecord; short: boolean }
  | { kind: "detection:identified"; petId: string; confidence: number }
  | { kind: "detection:unknown" }
  | { kind: "device:offline" }
  | { kind: "device:online" }
  | { kind: "food:low"; grams: number }
  | { kind: "food:refilled" }
  | { kind: "sensor:error" };

export type Settings = {
  deviceName: string; timezone: string; unit: string;
  defaultPortion: number; maxDaily: number; confidenceThreshold: number;
  notifications: { lowFood: boolean; offline: boolean; feedingError: boolean; unknownPet: boolean };
};

export type Tone = "success" | "warning" | "critical" | "info" | "neutral";
export type ToastInput = { tone?: Tone; title: string; message?: string; duration?: number };
