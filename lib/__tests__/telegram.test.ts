import { describe, expect, it } from "vitest";
import { alertToTelegramKey, formatAlertMessage, shouldSendAlert } from "@/lib/telegram";
import type { Alert, NotificationSettings } from "@/lib/types";

const on: NotificationSettings = { lowFood: true, offline: true, feedingError: true, unknownPet: true };

const alert = (over: Partial<Alert> = {}): Alert => ({
  id: "AL1", severity: "warning", type: "Low food", title: "Hopper below 20%",
  message: "Refill before the next cycle.", source: "HX711",
  timestamp: new Date(2026, 7, 25, 14, 30).getTime(), read: false, ...over,
});

describe("alertToTelegramKey", () => {
  it("maps each alert type onto the toggle that governs it", () => {
    expect(alertToTelegramKey(alert({ type: "Low food" }))).toBe("lowFood");
    expect(alertToTelegramKey(alert({ type: "Device offline" }))).toBe("offline");
    expect(alertToTelegramKey(alert({ type: "Unknown pet" }))).toBe("unknownPet");
    expect(alertToTelegramKey(alert({ type: "Feeding error" }))).toBe("feedingError");
    expect(alertToTelegramKey(alert({ type: "Sensor error" }))).toBe("feedingError");
    expect(alertToTelegramKey(alert({ type: "Feeding skipped" }))).toBe("feedingError");
  });

  it("returns null for a type no toggle governs", () => {
    // An unrecognised alert must not be silently swallowed by a missing mapping.
    expect(alertToTelegramKey(alert({ type: "Something new" }))).toBeNull();
  });
});

describe("shouldSendAlert", () => {
  it("sends when the governing toggle is on", () => {
    expect(shouldSendAlert(alert({ type: "Low food" }), on)).toBe(true);
  });

  it("does not send when the governing toggle is off", () => {
    expect(shouldSendAlert(alert({ type: "Low food" }), { ...on, lowFood: false })).toBe(false);
  });

  it("sends an ungoverned alert rather than dropping it", () => {
    // Erring toward telling the owner: a missed message about their animal is
    // worse than one they did not strictly ask for.
    expect(shouldSendAlert(alert({ type: "Something new" }), { ...on, lowFood: false })).toBe(true);
  });

  it("treats a missing toggle as on", () => {
    const partial = { lowFood: false } as unknown as NotificationSettings;
    expect(shouldSendAlert(alert({ type: "Device offline" }), partial)).toBe(true);
  });
});

describe("formatAlertMessage", () => {
  it("leads with severity, then the title and detail", () => {
    const text = formatAlertMessage(alert(), null);
    expect(text).toContain("Hopper below 20%");
    expect(text).toContain("Refill before the next cycle.");
  });

  it("names the pet when one is known", () => {
    const text = formatAlertMessage(alert({ type: "Feeding error" }), "Max");
    expect(text).toContain("Max");
  });

  it("marks a critical alert differently from a warning", () => {
    const crit = formatAlertMessage(alert({ severity: "critical" }), null);
    const warn = formatAlertMessage(alert({ severity: "warning" }), null);
    expect(crit).not.toBe(warn);
  });

  it("includes the time so a delayed message is not misread as current", () => {
    expect(formatAlertMessage(alert(), null)).toMatch(/\d{2}:\d{2}/);
  });

  it("escapes characters that would break Telegram markdown", () => {
    const text = formatAlertMessage(alert({ title: "Weight *odd* [check]" }), null);
    expect(text).not.toContain("*odd*");
  });
});
