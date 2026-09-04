import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { decideFeeding, type DecisionInput } from "@/lib/decision";
import type { FeedingRecord, Pet, Settings } from "@/lib/types";
import { SimulationEngine } from "@/services/simulation";
import { TelemetryStore, initialTelemetry } from "@/services/telemetry";

/**
 * The cooldown must reflect food that actually landed, not a command that was
 * accepted. A cycle that is stopped — by the user, by Settings → Restart
 * device, or by the device dropping off — writes no FeedingRecord, so it must
 * not lock the pet out of its next meal.
 *
 * `FeederDataProvider` is a React component and this repo has no render
 * harness, so the wiring itself is asserted by reading the source (the style
 * `lib/__tests__/auth-provider.test.ts` uses). The behaviour underneath it —
 * "a stopped cycle produces no record, and no record means no cooldown" — is
 * exercised for real against `SimulationEngine` and `decideFeeding`.
 */

const PET_ID = "PET009";

const pet = (over: Partial<Pet> = {}): Pet => ({
  id: PET_ID, name: "Max", species: "Dog", breed: "Labrador",
  weightKg: 30, portionG: 100, mealsPerDay: 3, status: "Active",
  colour: "amber", enrolledAt: "2026-01-01", ...over,
});

const settings = (over: Partial<Settings> = {}): Settings => ({
  deviceName: "Feeder", timezone: "Africa/Johannesburg", unit: "g",
  defaultPortion: 100, maxDaily: 600, confidenceThreshold: 0, feedCooldownS: 300,
  notifications: { lowFood: true, offline: true, feedingError: true, unknownPet: true },
  ...over,
});

/** The decision the provider's `dispense` would make, given a feeding history. */
function manualVerdict(now: number, history: FeedingRecord[]) {
  const input: DecisionInput = {
    now,
    trigger: "Manual",
    prediction: null,
    pet: pet(),
    settings: settings(),
    telemetry: {
      device: {
        id: "ESP32-PETFEEDER-001", online: true, ip: "10.0.0.5", ssid: "wifi",
        rssi: -60, firmware: "1.0.0", mqtt: "ok", lastHeartbeat: now,
        uptimeS: 100, freeHeapKb: 120,
      },
      hopper: { grams: 400, capacity: 800 },
    },
    schedules: [],
    todaysFeedings: history,
    // Empty on purpose: the provider now only writes this ref from
    // `cycle:complete`, and a stopped cycle never emits one.
    lastFeedAt: {},
    requestedG: 100,
  };
  return decideFeeding(input);
}

/**
 * Runs a cycle on the real engine and returns the feeding history the provider
 * would hold afterwards — that is, one row per `cycle:complete` and nothing
 * for any other event.
 */
function runCycle(stopAfterMs: number | null): FeedingRecord[] {
  const store = new TelemetryStore(initialTelemetry(Date.now()));
  const engine = new SimulationEngine(store);
  const history: FeedingRecord[] = [];
  engine.on((e) => { if (e.kind === "cycle:complete") history.unshift(e.record); });
  engine.setPets([pet()]);
  engine.start();

  expect(engine.startCycle(PET_ID, 100, "Manual")).toBe(true);
  if (stopAfterMs === null) {
    vi.advanceTimersByTime(40_000);
  } else {
    vi.advanceTimersByTime(stopAfterMs);
    engine.stopCycle("Stopped by user");
    vi.advanceTimersByTime(40_000);
  }
  engine.stop();
  return history;
}

describe("feeding cooldown follows food, not accepted commands", () => {
  beforeEach(() => vi.useFakeTimers().setSystemTime(new Date(2026, 8, 4, 7, 0, 0)));
  afterEach(() => vi.useRealTimers());

  it("writes no feeding record when a cycle is stopped mid-pour", () => {
    expect(runCycle(3_000)).toEqual([]);
  });

  it("leaves no cooldown behind after a stopped cycle", () => {
    const history = runCycle(3_000);
    const verdict = manualVerdict(Date.now(), history);
    expect(verdict.decision).toBe("APPROVED");
  });

  it("still applies the cooldown after a cycle that completed", () => {
    // The control: the same helper, the same clock, one completed cycle. If
    // this passed too, the test above would be proving nothing.
    const history = runCycle(null);
    expect(history).toHaveLength(1);
    const verdict = manualVerdict(Date.now(), history);
    expect(verdict).toEqual({ decision: "REJECTED", reason: "COOLDOWN_ACTIVE", petId: PET_ID });
  });
});

describe("FeederDataProvider cooldown bookkeeping (source)", () => {
  const source = readFileSync("hooks/useFeederData.tsx", "utf8");

  it("does not record the cooldown when the feeding command is accepted", () => {
    const dispense = source.slice(source.indexOf("const dispense = useCallback"));
    const body = dispense.slice(0, dispense.indexOf("const stopCycle"));
    expect(body).toContain('commandBus.send("feeding.start"');
    expect(body).not.toContain("lastFeedAtRef.current =");
  });

  it("records the cooldown from the completed feeding record", () => {
    const branch = source.slice(source.indexOf('case "cycle:complete"'));
    const body = branch.slice(0, branch.indexOf('case "cycle:stopped"'));
    expect(body).toContain("lastFeedAtRef.current = { ...lastFeedAtRef.current, [evt.record.petId]: evt.record.timestamp }");
  });

  it("records nothing from a stopped cycle", () => {
    const branch = source.slice(source.indexOf('case "cycle:stopped"'));
    const body = branch.slice(0, branch.indexOf('case "detection:unknown"'));
    expect(body).not.toContain("lastFeedAtRef");
  });
});
