import { describe, expect, it } from "vitest";
import { createMockAdapter } from "@/services/adapters/mock";
import type { NewPet } from "@/lib/types";

const newPet: NewPet = {
  name: "Rex", species: "Dog", breed: "Boerboel", weightKg: 40,
  portionG: 200, mealsPerDay: 2, status: "Active", colour: "violet",
};

describe("mock adapter", () => {
  it("lists the seeded pets", async () => {
    const svc = createMockAdapter();
    const pets = await svc.pets.list();
    expect(pets.map((p) => p.id)).toEqual(["PET001", "PET002", "PET003"]);
  });

  it("creates a pet with a generated id and enrolment date", async () => {
    const svc = createMockAdapter();
    const created = await svc.pets.create(newPet);
    expect(created.id).toBe("PET004");
    expect(created.enrolledAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(await svc.pets.list()).toHaveLength(4);
  });

  it("updates and removes pets", async () => {
    const svc = createMockAdapter();
    const updated = await svc.pets.update("PET001", { portionG: 175 });
    expect(updated.portionG).toBe(175);
    expect(await svc.pets.remove("PET001")).toBe(true);
    expect(await svc.pets.get("PET001")).toBeNull();
  });

  it("gives each adapter instance its own isolated store", async () => {
    const a = createMockAdapter();
    const b = createMockAdapter();
    await a.pets.remove("PET001");
    expect(await b.pets.get("PET001")).not.toBeNull();
  });

  it("prepends appended feedings and alerts", async () => {
    const svc = createMockAdapter();
    const before = await svc.feedings.list();
    const row = { ...before[0], id: "FD_new", timestamp: Date.now() };
    await svc.feedings.append(row);
    expect((await svc.feedings.list())[0].id).toBe("FD_new");
  });

  it("marks alerts read individually and in bulk", async () => {
    const svc = createMockAdapter();
    const [first] = await svc.alerts.list();
    await svc.alerts.markRead(first.id);
    expect((await svc.alerts.list()).find((a) => a.id === first.id)?.read).toBe(true);
    await svc.alerts.markAllRead();
    expect((await svc.alerts.list()).every((a) => a.read)).toBe(true);
  });

  it("returns feedings newest first", async () => {
    const rows = await createMockAdapter().feedings.list();
    const stamps = rows.map((r) => r.timestamp);
    expect([...stamps].sort((a, b) => b - a)).toEqual(stamps);
  });

  it("generates identical seeded history for every adapter instance", async () => {
    const a = await createMockAdapter().feedings.list();
    const b = await createMockAdapter().feedings.list();
    expect(b.map((r) => [r.timestamp, r.petId, r.actualG, r.confidence]))
      .toEqual(a.map((r) => [r.timestamp, r.petId, r.actualG, r.confidence]));
  });
});
