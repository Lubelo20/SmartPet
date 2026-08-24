import { describe, expect, it, vi } from "vitest";
import { TelemetryStore, initialTelemetry } from "@/services/telemetry";

describe("initialTelemetry", () => {
  it("stamps every time field from the injected now", () => {
    const t = initialTelemetry(1_000);
    expect(t.device.lastHeartbeat).toBe(1_000);
    expect(t.camera.lastFrameAt).toBe(1_000);
    expect(t.detection.since).toBe(1_000);
    expect(t.device.online).toBe(true);
    expect(t.cycle.active).toBe(false);
    expect(t.hopper.capacity).toBe(800);
  });
});

describe("TelemetryStore", () => {
  it("merges object patches shallowly", () => {
    const store = new TelemetryStore(initialTelemetry(0));
    store.set({ distanceCm: 12 });
    expect(store.get().distanceCm).toBe(12);
    expect(store.get().servo).toBe("READY");
  });

  it("accepts a function patch derived from current state", () => {
    const store = new TelemetryStore(initialTelemetry(0));
    store.set((s) => ({ distanceCm: s.distanceCm + 1 }));
    expect(store.get().distanceCm).toBe(65);
  });

  it("notifies subscribers and stops after unsubscribe", () => {
    const store = new TelemetryStore(initialTelemetry(0));
    const listener = vi.fn();
    const off = store.subscribe(listener);
    store.set({ distanceCm: 3 });
    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener.mock.calls[0][0].distanceCm).toBe(3);
    off();
    store.set({ distanceCm: 4 });
    expect(listener).toHaveBeenCalledTimes(1);
  });
});
