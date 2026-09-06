import { readFileSync } from "node:fs";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { initializeTestEnvironment, type RulesTestEnvironment } from "@firebase/rules-unit-testing";
import { doc, setDoc, type Firestore } from "firebase/firestore";
import { createFirebaseAdapter } from "@/services/adapters/firebase";
import { createMockAdapter } from "@/services/adapters/mock";
import { buildSeedAlerts, buildSeedFeedings, buildSeedPets, buildSeedSchedules } from "@/lib/seed-data";
import {
  alertToDoc, feedingToDoc, petToDoc, scheduleToDoc,
} from "@/lib/firebase/mapping";
import type { FeederServices } from "@/services/contract";
import type { Alert, FeedingRecord, NewPet, Pet } from "@/lib/types";

const HID = "contract-house";
const UID = "contract-user";

let testEnv: RulesTestEnvironment;

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: "demo-feeder",
    firestore: { rules: readFileSync("firestore.rules", "utf8") },
  });
});

afterAll(async () => { await testEnv.cleanup(); });

/** Seed the emulator with the same data the mock adapter starts from. */
async function seedFirestore(): Promise<Firestore> {
  await testEnv.clearFirestore();
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, "households", HID), {
      name: "Contract", memberUids: [UID], deviceId: "ESP32-PETFEEDER-001", createdAt: 0,
    });
    for (const pet of buildSeedPets()) {
      await setDoc(doc(db, "households", HID, "pets", pet.id), petToDoc(pet));
    }
    for (const s of buildSeedSchedules()) {
      await setDoc(doc(db, "households", HID, "feedingSchedules", s.id), scheduleToDoc(s));
    }
    for (const f of buildSeedFeedings()) {
      await setDoc(doc(db, "households", HID, "feedingHistory", f.id), feedingToDoc(f));
    }
    for (const a of buildSeedAlerts()) {
      await setDoc(doc(db, "households", HID, "alerts", a.id), alertToDoc(a));
    }
  });
  return testEnv.authenticatedContext(UID, { email: "contract@example.com" }).firestore() as unknown as Firestore;
}

const newPet: NewPet = {
  name: "Rex", species: "Dog", breed: "Boerboel", weightKg: 40,
  portionG: 200, mealsPerDay: 2, status: "Active", colour: "violet",
};

type Case = { name: string; make: () => Promise<FeederServices> };

const cases: Case[] = [
  { name: "mock", make: async () => createMockAdapter() },
  { name: "firebase", make: async () => createFirebaseAdapter(await seedFirestore(), HID, UID) },
];

describe.each(cases)("$name adapter satisfies the contract", ({ make }) => {
  let svc: FeederServices;
  beforeEach(async () => { svc = await make(); });

  it("lists the seeded pets", async () => {
    const pets = await svc.pets.list();
    expect(pets.map((p) => p.id).sort()).toEqual(["PET001", "PET002", "PET003"]);
  });

  it("gets one pet and returns null for a missing id", async () => {
    expect((await svc.pets.get("PET001"))?.name).toBe("Max");
    expect(await svc.pets.get("NOPE")).toBeNull();
  });

  it("creates a pet with a generated id and enrolment date", async () => {
    const created = await svc.pets.create(newPet);
    expect(created.id).toBe("PET004");
    expect(created.enrolledAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect((await svc.pets.list()).length).toBe(4);
  });

  it("updates a pet and returns the updated row", async () => {
    const updated = await svc.pets.update("PET001", { portionG: 175 });
    expect(updated.portionG).toBe(175);
    expect((await svc.pets.get("PET001"))?.portionG).toBe(175);
  });

  it("removes a pet", async () => {
    expect(await svc.pets.remove("PET001")).toBe(true);
    expect(await svc.pets.get("PET001")).toBeNull();
  });

  it("throws a not-found FeederError when updating a missing pet", async () => {
    await expect(svc.pets.update("NOPE", { portionG: 1 })).rejects.toMatchObject({ kind: "not-found" });
  });

  it("returns feedings newest first", async () => {
    const stamps = (await svc.feedings.list()).map((f) => f.timestamp);
    expect([...stamps].sort((a, b) => b - a)).toEqual(stamps);
  });

  it("round-trips an appended feeding record including the simulated flag", async () => {
    const [latest] = await svc.feedings.list();
    const row = { ...latest, id: "FD_contract", timestamp: latest.timestamp + 1000, simulated: true };
    await svc.feedings.append(row);
    const after = await svc.feedings.list();
    const found = after.find((f) => f.timestamp === row.timestamp);
    expect(found?.actualG).toBe(row.actualG);
    expect(found?.simulated).toBe(true);
  });

  it("lists schedules and toggles one", async () => {
    const [first] = await svc.schedules.list();
    const next = await svc.schedules.update(first.id, { enabled: !first.enabled });
    expect(next.enabled).toBe(!first.enabled);
  });

  it("creates and removes a schedule", async () => {
    const created = await svc.schedules.create({
      petId: "PET001", time: "21:00", portionG: 100, enabled: true, days: "Daily",
    });
    expect(created.id).toBeTruthy();
    expect(await svc.schedules.remove(created.id)).toBe(true);
  });

  it("marks one alert read and then all of them", async () => {
    const [first] = await svc.alerts.list();
    await svc.alerts.markRead(first.id);
    expect((await svc.alerts.list()).find((a) => a.id === first.id)?.read).toBe(true);
    await svc.alerts.markAllRead();
    expect((await svc.alerts.list()).every((a) => a.read)).toBe(true);
  });

  it("lists the household members", async () => {
    const members = await svc.household.members();
    expect(members.length).toBeGreaterThan(0);
    expect(members.every((m) => typeof m.uid === "string" && m.uid.length > 0)).toBe(true);
  });

  it("starts with no pending invitations", async () => {
    expect(await svc.household.invites()).toEqual([]);
  });

  it("sends an invitation and lists it back, lowercased", async () => {
    const created = await svc.household.invite("  Newperson@Example.COM ");
    expect(created.email).toBe("newperson@example.com");
    const pending = await svc.household.invites();
    expect(pending.map((i) => i.email)).toContain("newperson@example.com");
    expect(pending[0].invitedBy).toBeTruthy();
  });

  it("revokes an invitation", async () => {
    await svc.household.invite("revokeme@example.com");
    expect(await svc.household.revokeInvite("revokeme@example.com")).toBe(true);
    const pending = await svc.household.invites();
    expect(pending.map((i) => i.email)).not.toContain("revokeme@example.com");
  });

  it("does not duplicate an invitation to the same address", async () => {
    await svc.household.invite("twice@example.com");
    await svc.household.invite("twice@example.com");
    const pending = (await svc.household.invites()).filter((i) => i.email === "twice@example.com");
    expect(pending.length).toBe(1);
  });

  it("returns settings, falling back to defaults when nothing is stored", async () => {
    const cfg = await svc.settings.get();
    expect(cfg.defaultPortion).toBe(120);
    expect(cfg.notifications).toEqual({
      lowFood: true, offline: true, feedingError: true, unknownPet: true,
    });
  });

  it("round-trips settings across both halves of the split", async () => {
    const before = await svc.settings.get();
    const next = {
      ...before,
      deviceName: "Hallway feeder",
      maxDaily: 750,
      notifications: { ...before.notifications, lowFood: false },
    };
    await svc.settings.save(next);
    const after = await svc.settings.get();
    expect(after.deviceName).toBe("Hallway feeder");
    expect(after.maxDaily).toBe(750);
    expect(after.notifications.lowFood).toBe(false);
    // The other toggles must survive a partial change.
    expect(after.notifications.offline).toBe(true);
  });

  it("appends an alert", async () => {
    const before = (await svc.alerts.list()).length;
    const [sample] = await svc.alerts.list();
    await svc.alerts.append({ ...sample, id: "AL_contract", timestamp: sample.timestamp + 1 });
    expect((await svc.alerts.list()).length).toBe(before + 1);
  });

  it("pushes live pet changes to a subscriber and stops on unsubscribe", async () => {
    const seen: Pet[][] = [];
    const stop = svc.live.pets((rows) => seen.push(rows));

    // The first callback is the current state, so a subscriber never has to
    // also call list() and reconcile two sources.
    await vi.waitFor(() => expect(seen.length).toBeGreaterThan(0));
    expect(seen[0].some((p) => p.id === "PET001")).toBe(true);

    await svc.pets.create({ ...newPet, name: "Live" });
    await vi.waitFor(() => {
      expect(seen[seen.length - 1].some((p) => p.name === "Live")).toBe(true);
    });

    const countAtStop = seen.length;
    stop();
    await svc.pets.create({ ...newPet, name: "After" });
    // A late snapshot would be a leak: the component that subscribed is gone.
    await new Promise((r) => setTimeout(r, 300));
    expect(seen.length).toBe(countAtStop);
  });

  it("pushes live feedings newest-first", async () => {
    const seen: FeedingRecord[][] = [];
    const stop = svc.live.feedings((rows) => seen.push(rows));
    await vi.waitFor(() => expect(seen.length).toBeGreaterThan(0));

    await svc.feedings.append({
      id: "FD-LIVE", timestamp: Date.now() + 60_000, petId: "PET001",
      targetG: 100, actualG: 99, status: "Completed", confidence: 95,
      trigger: "Manual", durationS: 4, simulated: true,
    });
    await vi.waitFor(() => {
      expect(seen[seen.length - 1][0]?.id).toBe("FD-LIVE");
    });
    stop();
  });

  it("pushes live alerts", async () => {
    const seen: Alert[][] = [];
    const stop = svc.live.alerts((rows) => seen.push(rows));
    await vi.waitFor(() => expect(seen.length).toBeGreaterThan(0));

    await svc.alerts.append({
      id: "AL-LIVE", severity: "warning", type: "test", title: "Live alert",
      message: "m", source: "s", timestamp: Date.now() + 60_000, read: false,
    });
    await vi.waitFor(() => {
      expect(seen[seen.length - 1].some((a) => a.id === "AL-LIVE")).toBe(true);
    });
    stop();
  });

  it("appends and lists detections, newest first", async () => {
    const base = {
      deviceId: "ESP32-PETFEEDER-001", petName: "Max", confidence: 0.96,
      status: "RECOGNIZED" as const, modelVersion: "v1.0",
    };
    await svc.detections.append({ ...base, id: "DET001", petId: "PET001", timestamp: 1_000 });
    await svc.detections.append({
      ...base, id: "DET002", petId: null, petName: "Unknown",
      confidence: 0.42, status: "UNKNOWN", timestamp: 2_000,
    });

    const rows = await svc.detections.list();
    expect(rows.map((d) => d.id)).toEqual(["DET002", "DET001"]);
    expect(rows[0].petId).toBeNull();
    expect(rows[0].confidence).toBeCloseTo(0.42);
    expect(rows[1].petId).toBe("PET001");
  });

  it("round-trips a pet photo and clears it with the empty-string sentinel", async () => {
    const created = await svc.pets.create({ ...newPet, photoData: "data:image/jpeg;base64,AAAA" });
    expect(created.photoData).toBe("data:image/jpeg;base64,AAAA");
    expect((await svc.pets.get(created.id))?.photoData).toBe("data:image/jpeg;base64,AAAA");

    // "" is the removal value (updateDoc cannot carry undefined). It must read
    // back as NO photo, not as an empty one.
    await svc.pets.update(created.id, { photoData: "" });
    const cleared = await svc.pets.get(created.id);
    expect(cleared?.photoData ?? undefined).toBeUndefined();
  });

  it("round-trips feedCooldownS through the adapter", async () => {
    const before = await svc.settings.get();
    expect(typeof before.feedCooldownS).toBe("number");

    const saved = await svc.settings.save({ ...before, feedCooldownS: 600 });
    expect(saved.feedCooldownS).toBe(600);
    expect((await svc.settings.get()).feedCooldownS).toBe(600);
  });
});

/**
 * Firebase-only, because the shape under test is storage history: a
 * settings/device document written before feedCooldownS existed. The mock
 * adapter has the mirror of this test against a legacy localStorage blob
 * (lib/__tests__/mock-settings-persistence.test.ts). If the defaults-first
 * spread in settings.get() is ever lost, feedCooldownS reads undefined,
 * `undefined > 0` is false, and the cooldown silently stops governing —
 * fail-open, with no error anywhere.
 */
describe("firebase adapter with a settings document that predates feedCooldownS", () => {
  it("fills the missing field with the default and keeps the stored values", async () => {
    const db = await seedFirestore();
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), "households", HID, "settings", "device"), {
        deviceName: "Legacy Feeder", timezone: "Africa/Johannesburg", unit: "g",
        defaultPortion: 90, maxDaily: 500, confidenceThreshold: 80,
        // deliberately no feedCooldownS
      });
    });

    const svc = createFirebaseAdapter(db, HID, UID);
    const settings = await svc.settings.get();

    expect(settings.deviceName).toBe("Legacy Feeder");
    expect(settings.maxDaily).toBe(500);
    expect(settings.feedCooldownS).toBe(300);
    expect(settings.feedCooldownS).not.toBeUndefined();
  });
});
