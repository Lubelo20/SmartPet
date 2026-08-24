import type { Alert, FeedingRecord, NewPet, NewSchedule, Pet, Schedule, Settings } from "@/lib/types";

export interface FeederServices {
  pets: {
    list(): Promise<Pet[]>;
    get(id: string): Promise<Pet | null>;
    create(pet: NewPet): Promise<Pet>;
    update(id: string, patch: Partial<Pet>): Promise<Pet>;
    remove(id: string): Promise<boolean>;
  };
  feedings: {
    list(): Promise<FeedingRecord[]>;
    append(row: FeedingRecord): Promise<FeedingRecord>;
  };
  schedules: {
    list(): Promise<Schedule[]>;
    create(row: NewSchedule): Promise<Schedule>;
    update(id: string, patch: Partial<Schedule>): Promise<Schedule>;
    remove(id: string): Promise<boolean>;
  };
  /**
   * Stored as two documents — device preferences on the household, notification
   * preferences per member — but composed into one `Settings` here. The split
   * is the adapter's business; no component should know about it.
   */
  settings: {
    get(): Promise<Settings>;
    save(next: Settings): Promise<Settings>;
  };
  alerts: {
    list(): Promise<Alert[]>;
    append(row: Alert): Promise<Alert>;
    markRead(id: string): Promise<boolean>;
    markAllRead(): Promise<boolean>;
  };
}
