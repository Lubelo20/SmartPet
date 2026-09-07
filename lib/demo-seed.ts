import { buildSeedFeedings, buildSeedPets, buildSeedSchedules } from "@/lib/seed-data";
import type { FeederServices } from "@/services/contract";

/**
 * Populate an empty household with the demo pets, schedules and history.
 *
 * The mock adapter starts from this data; a real Firestore household starts
 * empty, so the dashboard's history, analytics and AI summary have nothing to
 * describe until someone has used the feeder for a while. This writes the same
 * fixtures through the ordinary contract — no admin credentials, no privileged
 * path, just the writes a signed-in member is already allowed to make under
 * firestore.rules.
 *
 * Distinct from scripts/seed.ts, which uses the Admin SDK to create a
 * household that does not exist yet. This one runs inside a household that
 * does.
 *
 * Refuses to run when pets already exist. Re-running would duplicate every
 * pet and double every total, and a "load demo data" button is exactly the
 * kind of thing someone presses twice.
 */
export async function loadDemoData(
  services: FeederServices,
): Promise<{ loaded: boolean; pets: number; schedules: number; feedings: number }> {
  const existing = await services.pets.list();
  if (existing.length > 0) {
    return { loaded: false, pets: 0, schedules: 0, feedings: 0 };
  }

  const pets = buildSeedPets();
  const schedules = buildSeedSchedules();
  const feedings = buildSeedFeedings();

  // Sequential rather than Promise.all: the Firebase adapter derives the next
  // pet id from how many already exist, so parallel creates would collide on
  // PET001 and silently overwrite each other.
  for (const pet of pets) {
    const { id, enrolledAt: _enrolledAt, ...rest } = pet;
    await services.pets.create({ ...rest, id });
  }
  for (const s of schedules) await services.schedules.create(s);
  for (const f of feedings) await services.feedings.append(f);

  return { loaded: true, pets: pets.length, schedules: schedules.length, feedings: feedings.length };
}
