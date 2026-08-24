import { readFileSync } from "node:fs";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { initializeTestEnvironment, type RulesTestEnvironment } from "@firebase/rules-unit-testing";
import { doc, setDoc, type Firestore } from "firebase/firestore";
import { createFirebaseAdapter } from "@/services/adapters/firebase";
import { createMockAdapter } from "@/services/adapters/mock";
import { buildSeedAlerts, buildSeedFeedings, buildSeedPets, buildSeedSchedules } from "@/lib/seed-data";
import {
  alertToDoc, feedingToDoc, petToDoc, scheduleToDoc,
} from "@/lib/firebase/mapping";
import type { FeederServices } from "@/services/contract";
import type { NewPet } from "@/lib/types";

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
});
