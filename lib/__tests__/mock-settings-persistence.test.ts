import { beforeEach, describe, expect, it, vi } from "vitest";
import { createMockAdapter } from "@/services/adapters/mock";

/**
 * Mock mode has no backend, so a reload rebuilds the adapter and every setting
 * reverted to its default — the same "the save button lies" bug that Firestore
 * persistence fixed for the real adapter. localStorage closes it for mock mode
 * without inventing a backend.
 */

function fakeStorage() {
  const map = new Map<string, string>();
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => { map.set(k, v); },
    removeItem: (k: string) => { map.delete(k); },
    get size() { return map.size; },
  };
}

describe("mock adapter settings persistence", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it("survives a rebuild of the adapter when storage is available", async () => {
    const store = fakeStorage();
    vi.stubGlobal("window", { localStorage: store });
    vi.stubGlobal("localStorage", store);

    const first = createMockAdapter();
    const before = await first.settings.get();
    await first.settings.save({ ...before, deviceName: "Hallway feeder", maxDaily: 999 });

    // A page reload builds a completely fresh adapter.
    const second = createMockAdapter();
    const after = await second.settings.get();
    expect(after.deviceName).toBe("Hallway feeder");
    expect(after.maxDaily).toBe(999);
  });

  it("persists notification toggles too", async () => {
    const store = fakeStorage();
    vi.stubGlobal("window", { localStorage: store });
    vi.stubGlobal("localStorage", store);

    const first = createMockAdapter();
    const before = await first.settings.get();
    await first.settings.save({
      ...before, notifications: { ...before.notifications, lowFood: false },
    });

    const after = await createMockAdapter().settings.get();
    expect(after.notifications.lowFood).toBe(false);
    expect(after.notifications.offline).toBe(true);
  });

  it("falls back to in-memory when there is no window (SSR and tests)", async () => {
    vi.stubGlobal("window", undefined);
    const svc = createMockAdapter();
    const before = await svc.settings.get();
    await svc.settings.save({ ...before, deviceName: "In memory" });
    expect((await svc.settings.get()).deviceName).toBe("In memory");
    // A fresh adapter has no way to know, and that is correct here.
    expect((await createMockAdapter().settings.get()).deviceName).toBe("Kitchen feeder");
  });

  it("ignores corrupt stored JSON rather than throwing on load", async () => {
    const store = fakeStorage();
    store.setItem("feeder.settings", "{not json");
    vi.stubGlobal("window", { localStorage: store });
    vi.stubGlobal("localStorage", store);

    const cfg = await createMockAdapter().settings.get();
    expect(cfg.deviceName).toBe("Kitchen feeder");
  });
});
