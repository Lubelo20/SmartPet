import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createCommandBus } from "@/services/commands";
import { SimulationEngine } from "@/services/simulation";
import { TelemetryStore, initialTelemetry } from "@/services/telemetry";

function harness() {
  const store = new TelemetryStore(initialTelemetry(Date.now()));
  const engine = new SimulationEngine(store);
  return { store, engine, bus: createCommandBus(store, engine) };
}

describe("commandBus", () => {
  beforeEach(() => vi.useFakeTimers().setSystemTime(new Date(2026, 7, 20, 12, 0, 0)));
  afterEach(() => vi.useRealTimers());

  it("starts a feeding cycle", async () => {
    const { store, bus } = harness();
    const sent = bus.send("feeding.start", { petId: "PET001", portionG: 150, trigger: "Manual" });
    await vi.advanceTimersByTimeAsync(400);
    await expect(sent).resolves.toEqual({ accepted: true });
    expect(store.get().cycle.active).toBe(true);
  });

  it("rejects when the device is offline", async () => {
    const { engine, bus } = harness();
    engine.scenario("offline");
    const spy = vi.spyOn(engine, "stopCycle");
    const sent = bus.send("feeding.stop");
    const assertion = expect(sent).rejects.toThrow("Unable to reach the feeder");
    await vi.advanceTimersByTimeAsync(400);
    await assertion;
    expect(spy).not.toHaveBeenCalled();
  });

  it("rejects a second concurrent feeding", async () => {
    const { engine, bus } = harness();
    engine.startCycle("PET001", 150);
    const sent = bus.send("feeding.start", { petId: "PET002", portionG: 120 });
    const assertion = expect(sent).rejects.toThrow("already running");
    await vi.advanceTimersByTimeAsync(400);
    await assertion;
  });

  it("accepts configuration commands without touching the engine", async () => {
    const { store, bus } = harness();
    const sent = bus.send("device.config", { action: "tare" });
    await vi.advanceTimersByTimeAsync(400);
    await expect(sent).resolves.toEqual({ accepted: true });
    expect(store.get().cycle.active).toBe(false);
  });
});
