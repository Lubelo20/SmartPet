// services/__tests__/simulation.test.ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SimulationEngine } from "@/services/simulation";
import { TelemetryStore, initialTelemetry } from "@/services/telemetry";
import type { EngineEvent, Pet } from "@/lib/types";

function harness() {
  const store = new TelemetryStore(initialTelemetry(Date.now()));
  const engine = new SimulationEngine(store);
  const events: EngineEvent[] = [];
  engine.on((e) => events.push(e));
  engine.start();
  return { store, engine, events };
}

function demoPet(overrides: Partial<Pet> = {}): Pet {
  return {
    id: "PET009",
    name: "Demo Dog",
    species: "Dog",
    breed: "Mixed",
    weightKg: 10,
    portionG: 20,
    mealsPerDay: 2,
    status: "Active",
    colour: "amber",
    enrolledAt: "2026-01-01",
    ...overrides,
  };
}

describe("SimulationEngine", () => {
  beforeEach(() => vi.useFakeTimers().setSystemTime(new Date(2026, 7, 20, 12, 0, 0)));
  afterEach(() => vi.useRealTimers());

  it("enters the detected state when a cycle starts", () => {
    const { store, engine, events } = harness();
    expect(engine.startCycle("PET001", 150, "Manual")).toBe(true);
    const s = store.get();
    expect(s.cycle.active).toBe(true);
    expect(s.cycle.step).toBe(0);
    expect(s.detection.state).toBe("detected");
    expect(s.bowl.targetG).toBe(150);
    expect(events[0]).toEqual({ kind: "cycle:start", petId: "PET001", targetG: 150, trigger: "Manual" });
    engine.stop();
  });

  it("refuses to start a second cycle or to start while offline", () => {
    const { engine } = harness();
    engine.startCycle("PET001", 150);
    expect(engine.startCycle("PET002", 120)).toBe(false);
    engine.stopCycle();
    engine.scenario("offline");
    expect(engine.startCycle("PET002", 120)).toBe(false);
    engine.stop();
  });

  it("advances through identification and dispensing to completion", () => {
    const { store, engine, events } = harness();
    engine.startCycle("PET001", 150, "Manual");

    vi.advanceTimersByTime(2_000);
    expect(store.get().cycle.step).toBe(1);
    expect(store.get().detection.state).toBe("identifying");

    vi.advanceTimersByTime(2_000);
    expect(store.get().detection.state).toBe("identified");
    expect(store.get().detection.petId).toBe("PET001");

    vi.advanceTimersByTime(30_000);
    const complete = events.find((e) => e.kind === "cycle:complete");
    expect(complete).toBeDefined();
    if (complete?.kind !== "cycle:complete") throw new Error("unreachable");
    expect(complete.record.petId).toBe("PET001");
    expect(complete.record.targetG).toBe(150);
    expect(complete.record.actualG).toBeGreaterThan(140);
    expect(complete.record.trigger).toBe("Manual");
    expect(store.get().cycle.active).toBe(false);
    engine.stop();
  });

  it("draws dispensed food out of the hopper", () => {
    const { store, engine } = harness();
    const before = store.get().hopper.grams;
    engine.startCycle("PET003", 60, "Manual");
    vi.advanceTimersByTime(30_000);
    expect(store.get().hopper.grams).toBeLessThan(before);
    engine.stop();
  });

  it("stops a running cycle and reports the reason", () => {
    const { store, engine, events } = harness();
    engine.startCycle("PET001", 150);
    engine.stopCycle("Stopped from the dashboard");
    expect(store.get().cycle.active).toBe(false);
    expect(store.get().servo).toBe("READY");
    expect(events.some((e) => e.kind === "cycle:stopped")).toBe(true);
    engine.stop();
  });

  it("refuses to dispense when identification confidence is below the threshold", () => {
    // The settings page promises "below this, the feeder will not dispense".
    // The simulated classifier produces 93 + rnd()*6.4, so it tops out at 99.4;
    // 100 is above anything it can produce and therefore always refuses.
    const { store, engine, events } = harness();
    engine.setConfidenceThreshold(100);
    engine.startCycle("PET001", 150, "Manual");

    // Long enough to pass the identify step, short enough that the idle loop
    // has not yet reset detection back to idle.
    vi.advanceTimersByTime(4_000);
    expect(store.get().cycle.active).toBe(false);
    expect(store.get().detection.state).toBe("unknown");

    // Events persist, so they are what proves no food ever moved.
    vi.advanceTimersByTime(30_000);
    expect(events.some((e) => e.kind === "detection:unknown")).toBe(true);
    expect(events.some((e) => e.kind === "cycle:complete")).toBe(false);
    expect(events.some((e) => e.kind === "detection:identified")).toBe(false);
    engine.stop();
  });

  it("dispenses normally when confidence clears the threshold", () => {
    const { engine, events } = harness();
    engine.setConfidenceThreshold(75);
    engine.startCycle("PET001", 150, "Manual");
    vi.advanceTimersByTime(30_000);
    expect(events.some((e) => e.kind === "detection:identified")).toBe(true);
    expect(events.some((e) => e.kind === "cycle:complete")).toBe(true);
    engine.stop();
  });

  it("applies device and food scenarios", () => {
    const { store, engine, events } = harness();
    engine.scenario("offline");
    expect(store.get().device.online).toBe(false);
    expect(store.get().camera.online).toBe(false);
    engine.scenario("online");
    expect(store.get().device.online).toBe(true);
    engine.scenario("low-food");
    expect(store.get().hopper.grams).toBe(112);  // 800 * 0.2 * 0.7, below the low-food threshold
    engine.scenario("refill");
    expect(store.get().hopper.grams).toBe(800);
    expect(events.map((e) => e.kind)).toEqual([
      "device:offline", "device:online", "food:low", "food:refilled",
    ]);
    engine.stop();
  });

  it("records rolling sensor history capped at 40 points", () => {
    const { store, engine } = harness();
    vi.advanceTimersByTime(400 * 60);
    expect(store.get().history.weight).toHaveLength(40);
    expect(store.get().history.distance).toHaveLength(40);
    engine.stop();
  });

  it("brackets the 1600/1800/1200 ms phase boundaries exactly", () => {
    const { store, engine } = harness();
    engine.startCycle("PET001", 150, "Manual");

    // step 0 -> 1 boundary at 1600 ms
    vi.advanceTimersByTime(1_600);
    expect(store.get().cycle.step).toBe(0);
    vi.advanceTimersByTime(400);
    expect(store.get().cycle.step).toBe(1);

    // step 1 -> 2 boundary at +1800 ms
    vi.advanceTimersByTime(1_600);
    expect(store.get().cycle.step).toBe(1);
    vi.advanceTimersByTime(400);
    expect(store.get().cycle.step).toBe(2);

    // step 2 -> 3 boundary at +1200 ms. Bracket tight to the boundary itself
    // (t2 + 1200 and t2 + 1600, one tick either side of the nominal 1200 ms):
    // a too-short duration (e.g. 1000 ms) would already have flipped by
    // t2 + 1200, failing the first assertion; the nominal 1200 ms cannot flip
    // until the first tick after t2 + 1200 — i.e. by t2 + 1600 — per the
    // engine's strict `now > phaseEnd` check.
    vi.advanceTimersByTime(1_200);
    expect(store.get().cycle.step).toBe(2);
    vi.advanceTimersByTime(400);
    expect(store.get().cycle.step).toBe(3);
    expect(store.get().servo).toBe("DISPENSING");

    engine.stop();
  });

  it("pins the tick rate at 400 ms via history growth", () => {
    const { store, engine } = harness();
    vi.advanceTimersByTime(2_000);
    expect(store.get().history.weight).toHaveLength(5);
    expect(store.get().history.distance).toHaveLength(5);
    engine.stop();
  });

  it("looks up the pet name via setPets for the identification message", () => {
    const { store, engine } = harness();
    engine.setPets([demoPet({ id: "PET001", name: "Bella" })]);
    engine.startCycle("PET001", 150, "Manual");
    vi.advanceTimersByTime(2_000);
    expect(store.get().cycle.step).toBe(1);
    expect(store.get().cycle.message).toContain("Bella");
    engine.stop();
  });

  it("demo autoplay with no pets set does not throw or start a cycle", () => {
    const { store, engine } = harness();
    const heartbeatBefore = store.get().device.lastHeartbeat;
    engine.setDemo(true);
    expect(() => vi.advanceTimersByTime(7_000)).not.toThrow();
    expect(store.get().cycle.active).toBe(false);
    expect(store.get().device.lastHeartbeat).toBeGreaterThan(heartbeatBefore);
    expect(store.get().history.weight.length).toBeGreaterThan(0);
    engine.stop();
  });

  it("demo autoplay starts a cycle once pets are set", () => {
    const { store, engine } = harness();
    engine.setPets([demoPet()]);
    engine.setDemo(true);
    vi.advanceTimersByTime(6_800);
    const s = store.get();
    expect(s.cycle.active).toBe(true);
    expect(s.cycle.petId).toBe("PET009");
    expect(s.cycle.trigger).toBe("Scheduled");
    engine.stop();
  });

  it("parks autoNext for 16 s after a demo cycle completes, then releases it", () => {
    const { store, engine, events } = harness();
    engine.setPets([demoPet()]);
    engine.setDemo(true);
    for (let i = 0; i < 100 && !events.some((e) => e.kind === "cycle:complete"); i++) {
      vi.advanceTimersByTime(400);
    }
    expect(events.filter((e) => e.kind === "cycle:complete")).toHaveLength(1);
    expect(store.get().cycle.active).toBe(false);
    const startsAtCompletion = events.filter((e) => e.kind === "cycle:start").length;

    // Demo stays ON. Still inside the 16 s park window: no new cycle starts.
    vi.advanceTimersByTime(10_000);
    expect(store.get().cycle.active).toBe(false);
    expect(events.filter((e) => e.kind === "cycle:start")).toHaveLength(startsAtCompletion);

    // Past the 16 s mark from completion: autoNext releases and a new cycle starts.
    vi.advanceTimersByTime(10_000);
    expect(events.filter((e) => e.kind === "cycle:start")).toHaveLength(startsAtCompletion + 1);
    expect(store.get().cycle.active).toBe(true);
    engine.stop();
  });
});
