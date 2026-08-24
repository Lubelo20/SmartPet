import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { initializeTestEnvironment, type RulesTestEnvironment } from "@firebase/rules-unit-testing";
import { doc, setDoc, type Firestore } from "firebase/firestore";
import { createFirebaseAdapter } from "@/services/adapters/firebase";
import type { Alert } from "@/lib/types";

/**
 * hooks/useFeederData.tsx performs four optimistic background writes. Against
 * the mock adapter they cannot fail; against Firestore they can, and an
 * unhandled rejection would leave the UI showing a record the server never
 * accepted. These cases pin the half of that behaviour that is testable without
 * a browser: a denied write rejects, and it rejects as a mapped FeederError
 * with kind "denied" rather than a raw FirebaseError.
 */

let testEnv: RulesTestEnvironment;
const HID = "denied-house";

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: "demo-feeder",
    firestore: { rules: readFileSync("firestore.rules", "utf8") },
  });
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), "households", HID), {
      name: "Someone else's", memberUids: ["owner"], deviceId: "d", createdAt: 0,
    });
  });
});

afterAll(async () => { await testEnv.cleanup(); });

const alert: Alert = {
  id: "AL1", severity: "warning", type: "Low food", title: "Hopper below 25%",
  message: "Refill before the next cycle.", source: "HX711", timestamp: 0, read: false,
};

/** An adapter bound to a household the user is not a member of. */
const intruderAdapter = () =>
  createFirebaseAdapter(
    testEnv.authenticatedContext("intruder", { email: "intruder@example.com" })
      .firestore() as unknown as Firestore,
    HID,
    "intruder",
  );

describe("denied writes reject as mapped FeederErrors", () => {
  it("alerts.append rejects with kind denied", async () => {
    await expect(intruderAdapter().alerts.append(alert))
      .rejects.toMatchObject({ kind: "denied", name: "FeederError" });
  });

  it("feedings.append rejects with kind denied", async () => {
    const row = {
      id: "FD1", timestamp: 0, petId: "PET001", targetG: 150, actualG: 150,
      status: "Completed" as const, confidence: 96, trigger: "Manual" as const,
      durationS: 8, simulated: true,
    };
    await expect(intruderAdapter().feedings.append(row))
      .rejects.toMatchObject({ kind: "denied" });
  });

  it("alerts.markRead rejects with kind denied", async () => {
    await expect(intruderAdapter().alerts.markRead("AL1"))
      .rejects.toMatchObject({ kind: "denied" });
  });

  it("alerts.markAllRead rejects rather than resolving falsely", async () => {
    await expect(intruderAdapter().alerts.markAllRead()).rejects.toBeTruthy();
  });

  it("the message is a sentence, not a firebase code", async () => {
    await intruderAdapter().alerts.append(alert).catch((e: unknown) => {
      const err = e as { message: string };
      expect(err.message).toBe("You do not have access to this feeder.");
      expect(err.message).not.toContain("permission-denied");
    });
  });
});
