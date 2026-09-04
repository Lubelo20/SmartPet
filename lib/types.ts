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
  /** True while the device is simulated. Real telemetry writes false. */
  simulated: boolean;
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
  | { kind: "sensor:error" }
  | { kind: "schedule:skipped"; scheduleId: string; petId: string; time: string; reason: "daily-limit" };

/** Describes the feeder itself — shared by every member of the household. */
export type DeviceSettings = {
  deviceName: string; timezone: string; unit: string;
  defaultPortion: number; maxDaily: number; confidenceThreshold: number;
  /**
   * Seconds a pet must wait between feeds. Stops a pet that stays at the bowl
   * being fed repeatedly. 0 disables the check — a blank field must never lock
   * the feeder out, the same rule `checkDailyLimit` follows for its limit.
   */
  feedCooldownS: number;
};

/** Personal to one member: which events are allowed to interrupt them. */
export type NotificationSettings = {
  lowFood: boolean; offline: boolean; feedingError: boolean; unknownPet: boolean;
};

/**
 * The composed view every component uses. It is stored as two documents —
 * `settings/device` on the household and `members/{uid}` per person — and the
 * adapters do the splitting, because storage shape is theirs to know.
 */
export type Settings = DeviceSettings & { notifications: NotificationSettings };

export type Tone = "success" | "warning" | "critical" | "info" | "neutral";
export type ToastInput = { tone?: Tone; title: string; message?: string; duration?: number };

export type Household = {
  id: string;
  name: string;
  memberUids: string[];
  deviceId: string;
  createdAt: number;
};

export type Invite = {
  email: string;
  hid: string;
  invitedBy: string;
  createdAt: number;
};

/**
 * One member of a household, as the Household page shows them. Identity lives
 * on `members/{uid}` beside that person's notification preferences: the
 * household document carries uids only, and a list of raw uids tells nobody
 * anything. Each user writes their own record — the rules allow no one else to.
 */
export type HouseholdMember = {
  uid: string;
  email: string | null;
  displayName: string | null;
};

export type SessionStatus = "resolving" | "signed-out" | "no-household" | "ready";

export type DetectionStatus = "RECOGNIZED" | "UNKNOWN" | "ERROR";

export type RejectionReason =
  | "UNKNOWN_PET" | "LOW_AI_CONFIDENCE" | "FEEDING_DISABLED"
  | "DAILY_LIMIT_REACHED" | "OUTSIDE_SCHEDULE" | "INSUFFICIENT_FOOD"
  | "DEVICE_OFFLINE" | "AI_SERVICE_OFFLINE" | "AI_DISABLED"
  | "COOLDOWN_ACTIVE" | "UNSAFE_AMOUNT";

/** What asked for this feed. AI checks apply only to "AI". */
export type FeedTrigger = "Manual" | "Scheduled" | "AI";

/** A model's answer. `confidence` is 0..1 — see the decision engine for the one place it meets the 0..100 threshold. */
export type Prediction = {
  petId: string | null;
  confidence: number;
  status: DetectionStatus;
  modelVersion: string | null;
};
