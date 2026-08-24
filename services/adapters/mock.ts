import type { Alert, FeedingRecord, NewPet, NewSchedule, Pet, Schedule } from "@/lib/types";
import { buildSeedAlerts, buildSeedFeedings, buildSeedPets, buildSeedSchedules } from "@/lib/seed-data";
import { dayKey, delay, uid } from "@/lib/utils";
import type { FeederServices } from "@/services/contract";
import { FeederError } from "@/lib/errors";

export function createMockAdapter(): FeederServices {
  const store = {
    pets: buildSeedPets(),
    feedings: buildSeedFeedings(),
    schedules: buildSeedSchedules(),
    alerts: buildSeedAlerts(),
  };
  const latency = (): Promise<void> => delay(120 + Math.random() * 180);

  return {
    pets: {
      async list() {
        await latency();
        return [...store.pets];
      },
      async get(id: string) {
        await latency();
        return store.pets.find((p) => p.id === id) || null;
      },
      async create(pet: NewPet) {
        await latency();
        const next: Pet = {
          ...pet,
          id: pet.id || `PET${String(store.pets.length + 1).padStart(3, "0")}`,
          enrolledAt: dayKey(Date.now()),
        };
        store.pets = [...store.pets, next];
        return next;
      },
      async update(id: string, patch: Partial<Pet>) {
        await latency();
        store.pets = store.pets.map((p) => (p.id === id ? { ...p, ...patch } : p));
        const next = store.pets.find((p) => p.id === id);
        if (!next) throw new FeederError("not-found", "That pet no longer exists.");
        return next;
      },
      async remove(id: string) {
        await latency();
        store.pets = store.pets.filter((p) => p.id !== id);
        return true;
      },
    },
    feedings: {
      async list() {
        await latency();
        return [...store.feedings];
      },
      async append(row: FeedingRecord) {
        store.feedings = [row, ...store.feedings];
        return row;
      },
    },
    schedules: {
      async list() {
        await latency();
        return [...store.schedules];
      },
      async create(row: NewSchedule) {
        await latency();
        const next: Schedule = { ...row, id: uid("SCH") };
        store.schedules = [...store.schedules, next];
        return next;
      },
      async update(id: string, patch: Partial<Schedule>) {
        await latency();
        store.schedules = store.schedules.map((s) => (s.id === id ? { ...s, ...patch } : s));
        const next = store.schedules.find((s) => s.id === id);
        if (!next) throw new FeederError("not-found", "That schedule no longer exists.");
        return next;
      },
      async remove(id: string) {
        await latency();
        store.schedules = store.schedules.filter((s) => s.id !== id);
        return true;
      },
    },
    alerts: {
      async list() {
        await latency();
        return [...store.alerts];
      },
      async append(row: Alert) {
        store.alerts = [row, ...store.alerts];
        return row;
      },
      async markRead(id: string) {
        store.alerts = store.alerts.map((a) => (a.id === id ? { ...a, read: true } : a));
        return true;
      },
      async markAllRead() {
        store.alerts = store.alerts.map((a) => ({ ...a, read: true }));
        return true;
      },
    },
  };
}
