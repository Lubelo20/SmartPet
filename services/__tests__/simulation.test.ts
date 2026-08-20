// services/__tests__/simulation.test.ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SimulationEngine } from "@/services/simulation";
import { TelemetryStore, initialTelemetry } from "@/services/telemetry";
import type { EngineEvent } from "@/lib/types";

function harness() {
  const store = new TelemetryStore(initialTelemetry(Date.now()));
  const engine = new SimulationEngine(store);
  const events: EngineEvent[] = [];
  engine.on((e) => events.push(e));
  engine.start();
  return { store, engine, events };
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

  it("applies device and food scenarios", () => {
    const { store, engine, events } = harness();
    engine.scenario("offline");
    expect(store.get().device.online).toBe(false);
    expect(store.get().camera.online).toBe(false);
    engine.scenario("online");
    expect(store.get().device.online).toBe(true);
    engine.scenario("low-food");
    expect(store.get().hopper.grams).toBe(210);
    engine.scenario("refill");
    expect(store.get().hopper.grams).toBe(1500);
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
});
