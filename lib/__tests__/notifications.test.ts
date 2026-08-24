import { describe, expect, it } from "vitest";
import { DEFAULT_NOTIFICATIONS, shouldToast } from "@/lib/notifications";
import type { NotificationSettings } from "@/lib/types";

const all = (on: boolean): NotificationSettings => ({
  lowFood: on, offline: on, feedingError: on, unknownPet: on,
});

describe("shouldToast", () => {
  it("allows everything when every toggle is on", () => {
    for (const kind of ["food:low", "device:offline", "device:online",
                        "sensor:error", "detection:unknown", "cycle:start"] as const) {
      expect(shouldToast(kind, all(true))).toBe(true);
    }
  });

  it("maps food:low to the lowFood toggle", () => {
    expect(shouldToast("food:low", { ...all(true), lowFood: false })).toBe(false);
    expect(shouldToast("food:low", { ...all(false), lowFood: true })).toBe(true);
  });

  it("maps both connectivity events to the offline toggle", () => {
    const muted = { ...all(true), offline: false };
    expect(shouldToast("device:offline", muted)).toBe(false);
    expect(shouldToast("device:online", muted)).toBe(false);
  });

  it("maps sensor errors and short cycles to feedingError", () => {
    const muted = { ...all(true), feedingError: false };
    expect(shouldToast("sensor:error", muted)).toBe(false);
    expect(shouldToast("cycle:short", muted)).toBe(false);
  });

  it("maps detection:unknown to unknownPet", () => {
    expect(shouldToast("detection:unknown", { ...all(true), unknownPet: false })).toBe(false);
  });

  it("leaves ungated events alone even with everything muted", () => {
    // Muting is about noise, not about hiding what the user just asked for:
    // starting a feed and its success are direct responses to an action.
    expect(shouldToast("cycle:start", all(false))).toBe(true);
    expect(shouldToast("cycle:complete", all(false))).toBe(true);
    expect(shouldToast("cycle:stopped", all(false))).toBe(true);
    expect(shouldToast("food:refilled", all(false))).toBe(true);
  });

  it("defaults every toggle on", () => {
    expect(DEFAULT_NOTIFICATIONS).toEqual(all(true));
  });

  it("treats a missing toggle as on rather than silently muting", () => {
    // A document written before a toggle existed must not mute that event.
    const partial = { lowFood: false } as unknown as NotificationSettings;
    expect(shouldToast("device:offline", partial)).toBe(true);
    expect(shouldToast("food:low", partial)).toBe(false);
  });
});
