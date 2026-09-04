import { describe, expect, it } from "vitest";
import { rejectionMessage } from "@/lib/decision-messages";
import type { RejectionReason } from "@/lib/types";

const ALL: RejectionReason[] = [
  "UNKNOWN_PET", "LOW_AI_CONFIDENCE", "FEEDING_DISABLED", "DAILY_LIMIT_REACHED",
  "OUTSIDE_SCHEDULE", "INSUFFICIENT_FOOD", "DEVICE_OFFLINE", "AI_SERVICE_OFFLINE",
  "AI_DISABLED", "COOLDOWN_ACTIVE", "UNSAFE_AMOUNT",
];

describe("rejectionMessage", () => {
  it.each(ALL)("gives %s a title and a message a pet owner can act on", (reason) => {
    const m = rejectionMessage(reason, { petName: "Max" });
    expect(m.title.length).toBeGreaterThan(0);
    expect(m.message.length).toBeGreaterThan(0);
    // No enum constants leaking into the UI.
    expect(m.message).not.toContain("_");
  });

  it("names the pet where the reason is about that pet", () => {
    expect(rejectionMessage("FEEDING_DISABLED", { petName: "Max" }).message).toContain("Max");
  });
});
