import type {
  Detection,
  Alert, FeedingRecord, HouseholdMember, Invite, NewPet, NewSchedule, Pet, Schedule, Settings,
} from "@/lib/types";
import { buildSeedAlerts, buildSeedFeedings, buildSeedPets, buildSeedSchedules, buildSeedSettings } from "@/lib/seed-data";
import { dayKey, delay, uid } from "@/lib/utils";
import type { FeederServices } from "@/services/contract";
import { FeederError } from "@/lib/errors";

/**
 * Mock mode has no backend, so without this a reload rebuilt the adapter and
 * every saved setting reverted to its default. Wrapped in try/catch throughout:
 * localStorage throws in private windows and is absent during SSR, and neither
 * is a reason to fail a read.
 */
const SETTINGS_KEY = "feeder.settings";

function loadStoredSettings(): Settings | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(SETTINGS_KEY);
    if (!raw) return null;
    const stored = JSON.parse(raw) as Partial<Settings>;
    // Defaults underneath, so a payload stored before a field existed gains it
    // rather than reading undefined.
    const defaults = buildSeedSettings();
    return {
      ...defaults,
      ...stored,
      notifications: { ...defaults.notifications, ...(stored.notifications ?? {}) },
    };
  } catch {
    return null;
  }
}

function storeSettings(next: Settings): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(next));
  } catch {
    // Private windows and full quotas both land here. The in-memory copy is
    // still correct for this session, so there is nothing useful to report.
  }
}

export function createMockAdapter(): FeederServices {
  const store = {
    pets: buildSeedPets(),
    feedings: buildSeedFeedings(),
    // No seeded detections: the camera loop is the only writer, and a demo
    // that claims sightings which never happened would be a lie.
    detections: [] as Detection[],
    schedules: buildSeedSchedules(),
    alerts: buildSeedAlerts(),
    settings: loadStoredSettings() ?? buildSeedSettings(),
    // Mock mode has one signed-in demo user; a second member makes the
    // Household page show what it looks like with someone else in it.
    householdName: "Demo household",
    members: [
      { uid: "demo-user", email: "demo@example.com", displayName: "Demo" },
      { uid: "demo-partner", email: "partner@example.com", displayName: "Sam" },
    ] as HouseholdMember[],
    invites: [] as Invite[],
  };
  const latency = (): Promise<void> => delay(120 + Math.random() * 180);

  /**
   * Live subscriptions for the mock adapter. Firestore pushes because another
   * device wrote; here the only writer is this tab, so the emitter fires after
   * each local mutation. That keeps the two adapters indistinguishable to the
   * contract suite, which is the property that lets the app run with no
   * backend at all.
   */
  type Sink = { pets: Set<(r: Pet[]) => void>; feedings: Set<(r: FeedingRecord[]) => void>; alerts: Set<(r: Alert[]) => void> };
  const sinks: Sink = { pets: new Set(), feedings: new Set(), alerts: new Set() };
  const emitPets = () => sinks.pets.forEach((fn) => fn([...store.pets]));
  const emitFeedings = () => sinks.feedings.forEach((fn) => fn([...store.feedings].sort((a, b) => b.timestamp - a.timestamp)));
  const emitAlerts = () => sinks.alerts.forEach((fn) => fn([...store.alerts].sort((a, b) => b.timestamp - a.timestamp)));

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
        emitPets();
        return next;
      },
      async update(id: string, patch: Partial<Pet>) {
        await latency();
        store.pets = store.pets.map((p) => {
          if (p.id !== id) return p;
          const next = { ...p, ...patch };
          // "" is the photo-removal sentinel (updateDoc cannot carry
          // undefined). The Firebase adapter's petFromDoc reads "" back as no
          // photo at all; dropping the key here keeps the adapters
          // indistinguishable to the contract suite.
          if (next.photoData === "") delete next.photoData;
          return next;
        });
        emitPets();
        const next = store.pets.find((p) => p.id === id);
        if (!next) throw new FeederError("not-found", "That pet no longer exists.");
        return next;
      },
      async remove(id: string) {
        await latency();
        store.pets = store.pets.filter((p) => p.id !== id);
        emitPets();
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
        emitFeedings();
        return row;
      },
    },
    detections: {
      async list() {
        await latency();
        return [...store.detections].sort((a, b) => b.timestamp - a.timestamp);
      },
      async append(row: Detection) {
        await latency();
        store.detections = [row, ...store.detections];
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
    household: {
      async name() { await latency(); return store.householdName; },
      async members() { await latency(); return store.members.map((m) => ({ ...m })); },
      async invites() { await latency(); return store.invites.map((i) => ({ ...i })); },
      async invite(email: string) {
        await latency();
        const key = email.trim().toLowerCase();
        // Matches the Firebase adapter: re-inviting the same address returns
        // the existing invitation rather than issuing a second one.
        const already = store.invites.find((i) => i.email === key);
        if (already) return { ...already };
        const row: Invite = {
          email: key, hid: "demo-household", invitedBy: "demo-user", createdAt: Date.now(),
        };
        store.invites = [...store.invites, row];
        return { ...row };
      },
      async revokeInvite(email: string) {
        await latency();
        const before = store.invites.length;
        store.invites = store.invites.filter((i) => i.email !== email);
        if (store.invites.length === before) {
          throw new FeederError("not-found", "That invitation no longer exists.");
        }
        return true;
      },
    },

    settings: {
      async get() {
        await latency();
        return { ...store.settings, notifications: { ...store.settings.notifications } };
      },
      async save(next: Settings) {
        await latency();
        store.settings = { ...next, notifications: { ...next.notifications } };
        storeSettings(store.settings);
        return { ...store.settings, notifications: { ...store.settings.notifications } };
      },
    },
    live: {
      pets(onChange) {
        sinks.pets.add(onChange);
        onChange([...store.pets]);
        return () => { sinks.pets.delete(onChange); };
      },
      feedings(onChange) {
        sinks.feedings.add(onChange);
        onChange([...store.feedings].sort((a, b) => b.timestamp - a.timestamp));
        return () => { sinks.feedings.delete(onChange); };
      },
      alerts(onChange) {
        sinks.alerts.add(onChange);
        onChange([...store.alerts].sort((a, b) => b.timestamp - a.timestamp));
        return () => { sinks.alerts.delete(onChange); };
      },
    },
    alerts: {
      async list() {
        await latency();
        return [...store.alerts];
      },
      async append(row: Alert) {
        store.alerts = [row, ...store.alerts];
        emitAlerts();
        return row;
      },
      async markRead(id: string) {
        store.alerts = store.alerts.map((a) => (a.id === id ? { ...a, read: true } : a));
        emitAlerts();
        return true;
      },
      async markAllRead() {
        store.alerts = store.alerts.map((a) => ({ ...a, read: true }));
        emitAlerts();
        return true;
      },
    },
  };
}
