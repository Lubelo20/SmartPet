import { describe, expect, it } from "vitest";
import { decideFeeding, type DecisionInput } from "@/lib/decision";
import type { FeedingRecord, Pet, Prediction, Schedule, Settings } from "@/lib/types";

// A Friday at 07:00 local, matching the Task 1 fixtures.
const NOW = new Date(2026, 8, 4, 7, 0, 0, 0).getTime();

const pet = (over: Partial<Pet> = {}): Pet => ({
  id: "p1", name: "Max", species: "Dog", breed: "Labrador",
  weightKg: 30, portionG: 100, mealsPerDay: 3, status: "Active",
  colour: "amber", enrolledAt: "2026-01-01", ...over,
});

const settings = (over: Partial<Settings> = {}): Settings => ({
  deviceName: "Feeder", timezone: "Africa/Johannesburg", unit: "g",
  defaultPortion: 100, maxDaily: 600, confidenceThreshold: 75, feedCooldownS: 300,
  notifications: { lowFood: true, offline: true, feedingError: true, unknownPet: true },
  ...over,
});

const prediction = (over: Partial<Prediction> = {}): Prediction => ({
  petId: "p1", confidence: 0.96, status: "RECOGNIZED", modelVersion: "v1.2", ...over,
});

const schedule = (over: Partial<Schedule> = {}): Schedule => ({
  id: "s1", petId: "p1", time: "07:00", portionG: 100,
  enabled: true, days: "Daily", ...over,
});

const feeding = (over: Partial<FeedingRecord> = {}): FeedingRecord => ({
  id: "f1", timestamp: NOW, petId: "p1", targetG: 100, actualG: 100,
  status: "Completed", confidence: 95, trigger: "Manual", durationS: 4,
  simulated: true, ...over,
});

const input = (over: Partial<DecisionInput> = {}): DecisionInput => ({
  now: NOW,
  trigger: "AI",
  prediction: prediction(),
  pet: pet(),
  settings: settings(),
  telemetry: {
    device: {
      id: "ESP32-PETFEEDER-001", online: true, ip: "10.0.0.5", ssid: "wifi",
      rssi: -60, firmware: "1.0.0", mqtt: "ok", lastHeartbeat: NOW,
      uptimeS: 100, freeHeapKb: 120,
    },
    hopper: { grams: 400, capacity: 800 },
  },
  schedules: [schedule()],
  todaysFeedings: [],
  lastFeedAt: {},
  requestedG: 100,
  ...over,
});

describe("decideFeeding — approval", () => {
  it("approves a recognised pet that passes every check", () => {
    expect(decideFeeding(input())).toEqual({
      decision: "APPROVED", petId: "p1", amountG: 100,
    });
  });

  it("approves a manual feed with no prediction at all", () => {
    const d = decideFeeding(input({ trigger: "Manual", prediction: null }));
    expect(d.decision).toBe("APPROVED");
  });

  it("approves a manual feed outside every schedule window", () => {
    const d = decideFeeding(input({
      trigger: "Manual", prediction: null,
      now: new Date(2026, 8, 4, 23, 0, 0, 0).getTime(),
    }));
    expect(d.decision).toBe("APPROVED");
  });

  it("approves a scheduled feed with no prediction at all", () => {
    const d = decideFeeding(input({ trigger: "Scheduled", prediction: null }));
    expect(d.decision).toBe("APPROVED");
  });

  it("approves a scheduled feed outside every schedule window", () => {
    const d = decideFeeding(input({
      trigger: "Scheduled", prediction: null,
      now: new Date(2026, 8, 4, 23, 0, 0, 0).getTime(),
    }));
    expect(d.decision).toBe("APPROVED");
  });
});

describe("decideFeeding — rejection", () => {
  it("refuses to feed when the AI service is unreachable", () => {
    const d = decideFeeding(input({ prediction: null }));
    expect(d).toEqual({ decision: "REJECTED", reason: "AI_SERVICE_OFFLINE", petId: null });
  });

  it("refuses an unknown animal", () => {
    const d = decideFeeding(input({ prediction: prediction({ status: "UNKNOWN", petId: null, confidence: 0.42 }) }));
    expect(d).toEqual({ decision: "REJECTED", reason: "UNKNOWN_PET", petId: null });
  });

  it("refuses a recognised pet below the confidence threshold", () => {
    const d = decideFeeding(input({ prediction: prediction({ confidence: 0.62 }) }));
    expect(d).toEqual({ decision: "REJECTED", reason: "LOW_AI_CONFIDENCE", petId: "p1" });
  });

  it("accepts confidence exactly at the threshold", () => {
    const d = decideFeeding(input({ prediction: prediction({ confidence: 0.75 }) }));
    expect(d.decision).toBe("APPROVED");
  });

  it("refuses when the recognised class has no pet document", () => {
    const d = decideFeeding(input({ pet: null }));
    expect(d).toEqual({ decision: "REJECTED", reason: "UNKNOWN_PET", petId: "p1" });
  });

  it("refuses a paused pet", () => {
    const d = decideFeeding(input({ pet: pet({ status: "Paused" }) }));
    expect(d).toEqual({ decision: "REJECTED", reason: "FEEDING_DISABLED", petId: "p1" });
  });

  it("refuses an amount above twice the pet's portion", () => {
    const d = decideFeeding(input({ requestedG: 201 }));
    expect(d).toEqual({ decision: "REJECTED", reason: "UNSAFE_AMOUNT", petId: "p1" });
  });

  it("refuses the brief's 5000 g attack", () => {
    const d = decideFeeding(input({ requestedG: 5000 }));
    expect(d.decision).toBe("REJECTED");
    expect(d).toMatchObject({ reason: "UNSAFE_AMOUNT" });
  });

  it("refuses a non-positive amount", () => {
    expect(decideFeeding(input({ requestedG: 0 }))).toMatchObject({ reason: "UNSAFE_AMOUNT" });
  });

  it("caps the safe amount at 200 g even for a very large portion", () => {
    const d = decideFeeding(input({ pet: pet({ portionG: 400 }), requestedG: 250 }));
    expect(d).toMatchObject({ reason: "UNSAFE_AMOUNT" });
  });

  it("refuses inside the cooldown", () => {
    const d = decideFeeding(input({ lastFeedAt: { p1: NOW - 60_000 } }));
    expect(d).toEqual({ decision: "REJECTED", reason: "COOLDOWN_ACTIVE", petId: "p1" });
  });

  it("allows a feed exactly at the cooldown boundary", () => {
    const d = decideFeeding(input({ lastFeedAt: { p1: NOW - 300_000 } }));
    expect(d.decision).toBe("APPROVED");
  });

  it("treats a zero cooldown as disabled", () => {
    const d = decideFeeding(input({
      settings: settings({ feedCooldownS: 0 }), lastFeedAt: { p1: NOW - 1000 },
    }));
    expect(d.decision).toBe("APPROVED");
  });

  it("refuses once the daily limit would be breached", () => {
    // Timestamped well before NOW so this exercises the daily-limit check, not
    // the cooldown check that now also reads `todaysFeedings`.
    const d = decideFeeding(input({
      todaysFeedings: [feeding({ actualG: 550, timestamp: NOW - 3_600_000 })], requestedG: 100,
    }));
    expect(d).toEqual({ decision: "REJECTED", reason: "DAILY_LIMIT_REACHED", petId: "p1" });
  });

  it("refuses a NaN requested amount", () => {
    const d = decideFeeding(input({ requestedG: NaN }));
    expect(d).toEqual({ decision: "REJECTED", reason: "UNSAFE_AMOUNT", petId: "p1" });
  });

  it("refuses a NaN requested amount even when the daily limit is not configured", () => {
    const d = decideFeeding(input({
      requestedG: NaN, settings: settings({ maxDaily: 0 }),
    }));
    expect(d).toEqual({ decision: "REJECTED", reason: "UNSAFE_AMOUNT", petId: "p1" });
  });

  it("refuses inside the cooldown when only todaysFeedings records the last feed", () => {
    const d = decideFeeding(input({
      todaysFeedings: [feeding({ timestamp: NOW - 60_000 })], lastFeedAt: {},
    }));
    expect(d).toEqual({ decision: "REJECTED", reason: "COOLDOWN_ACTIVE", petId: "p1" });
  });

  it("refuses when the recognised pet document does not match the prediction", () => {
    const d = decideFeeding(input({
      pet: pet({ id: "p1" }), prediction: prediction({ petId: "p2" }),
    }));
    expect(d).toEqual({ decision: "REJECTED", reason: "UNKNOWN_PET", petId: "p2" });
  });

  it("refuses an AI feed outside every schedule window", () => {
    const d = decideFeeding(input({ now: new Date(2026, 8, 4, 23, 0, 0, 0).getTime() }));
    expect(d).toEqual({ decision: "REJECTED", reason: "OUTSIDE_SCHEDULE", petId: "p1" });
  });

  it("refuses when the hopper holds less than the request", () => {
    const d = decideFeeding(input({
      telemetry: { ...input().telemetry, hopper: { grams: 40, capacity: 800 } },
    }));
    expect(d).toEqual({ decision: "REJECTED", reason: "INSUFFICIENT_FOOD", petId: "p1" });
  });

  it("refuses when the device is offline", () => {
    const t = input().telemetry;
    const d = decideFeeding(input({
      telemetry: { ...t, device: { ...t.device, online: false } },
    }));
    expect(d).toEqual({ decision: "REJECTED", reason: "DEVICE_OFFLINE", petId: "p1" });
  });
});

describe("decideFeeding — order of checks", () => {
  it("reports the AI failure, not the empty hopper, when both are true", () => {
    const t = input().telemetry;
    const d = decideFeeding(input({
      prediction: null, telemetry: { ...t, hopper: { grams: 0, capacity: 800 } },
    }));
    expect(d).toMatchObject({ reason: "AI_SERVICE_OFFLINE" });
  });

  it("reports the unsafe amount, not the daily limit, when both are true", () => {
    const d = decideFeeding(input({
      requestedG: 5000, todaysFeedings: [feeding({ actualG: 590 })],
    }));
    expect(d).toMatchObject({ reason: "UNSAFE_AMOUNT" });
  });
});
