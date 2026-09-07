import { describe, expect, it } from "vitest";
import { loadDemoData } from "@/lib/demo-seed";
import { buildSeedFeedings, buildSeedPets, buildSeedSchedules } from "@/lib/seed-data";
import type { FeederServices } from "@/services/contract";
import type { FeedingRecord, NewPet, NewSchedule, Pet, Schedule } from "@/lib/types";

/**
 * A stub rather than a real adapter: the contract suite's fixtures always
 * contain pets, so it can only exercise the guard. This covers the path that
 * matters — writing into a household that is genuinely empty — and records
 * the order and the ids, which is where this can go wrong.
 */
function stub() {
  const pets: Pet[] = [];
  const schedules: Schedule[] = [];
  const feedings: FeedingRecord[] = [];
  let concurrent = 0;
  let maxConcurrent = 0;

  const track = async <T>(fn: () => T): Promise<T> => {
    concurrent += 1;
    maxConcurrent = Math.max(maxConcurrent, concurrent);
    await Promise.resolve();
    const out = fn();
    concurrent -= 1;
    return out;
  };

  const services = {
    pets: {
      list: async () => [...pets],
      create: (p: NewPet) => track(() => {
        // Mirrors the Firebase adapter: the id is derived from how many pets
        // already exist unless the caller supplies one.
        const next = {
          ...p,
          id: p.id ?? `PET${String(pets.length + 1).padStart(3, "0")}`,
          enrolledAt: "2026-01-01",
        } as Pet;
        pets.push(next);
        return next;
      }),
    },
    schedules: {
      create: (s: NewSchedule) => track(() => {
        const next = { ...s, id: `SCH${schedules.length + 1}` } as Schedule;
        schedules.push(next);
        return next;
      }),
    },
    feedings: {
      append: (f: FeedingRecord) => track(() => { feedings.push(f); return f; }),
    },
  } as unknown as FeederServices;

  return { services, pets, schedules, feedings, maxConcurrent: () => maxConcurrent };
}

describe("loadDemoData", () => {
  it("writes every seeded pet, schedule and feeding into an empty household", async () => {
    const s = stub();
    const out = await loadDemoData(s.services);

    expect(out.loaded).toBe(true);
    expect(s.pets.length).toBe(buildSeedPets().length);
    expect(s.schedules.length).toBe(buildSeedSchedules().length);
    expect(s.feedings.length).toBe(buildSeedFeedings().length);
    expect(out).toMatchObject({
      pets: buildSeedPets().length,
      schedules: buildSeedSchedules().length,
      feedings: buildSeedFeedings().length,
    });
  });

  it("preserves the seeded pet ids, which the schedules and history reference", async () => {
    const s = stub();
    await loadDemoData(s.services);

    const ids = s.pets.map((p) => p.id);
    expect(ids).toEqual(buildSeedPets().map((p) => p.id));
    // Every schedule must point at a pet that now exists, or the dashboard
    // shows schedules for nobody.
    for (const sch of buildSeedSchedules()) expect(ids).toContain(sch.petId);
    for (const f of buildSeedFeedings()) expect(ids).toContain(f.petId);
  });

  it("creates pets one at a time", async () => {
    // The Firebase adapter derives the next id from how many pets exist, so
    // parallel creates would collide on PET001 and overwrite each other.
    const s = stub();
    await loadDemoData(s.services);
    expect(s.maxConcurrent()).toBe(1);
  });

  it("refuses to run twice, because a load button is pressed twice", async () => {
    const s = stub();
    await loadDemoData(s.services);
    const again = await loadDemoData(s.services);

    expect(again.loaded).toBe(false);
    expect(s.pets.length).toBe(buildSeedPets().length);
    expect(s.feedings.length).toBe(buildSeedFeedings().length);
  });
});
