import type { Alert, FeedingRecord, NewPet, NewSchedule, Pet, Schedule } from "@/lib/types";

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
  alerts: {
    list(): Promise<Alert[]>;
    append(row: Alert): Promise<Alert>;
    markRead(id: string): Promise<boolean>;
    markAllRead(): Promise<boolean>;
  };
}
