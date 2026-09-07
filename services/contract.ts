import type {
  Alert, Detection, FeedingEvent, FeedingRecord, HouseholdMember, Invite, NewPet, NewSchedule,
  Pet, Schedule, Settings,
} from "@/lib/types";

/** Stops a live subscription. Calling it twice is safe. */
export type Unsubscribe = () => void;

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
  /**
   * Every feeding decision and its outcome, refusals included. Newest first.
   */
  feedingEvents: {
    list(): Promise<FeedingEvent[]>;
    append(row: FeedingEvent): Promise<FeedingEvent>;
  };
  /** AI sightings from the camera loop. Newest first, like feedings. */
  detections: {
    list(): Promise<Detection[]>;
    append(row: Detection): Promise<Detection>;
  };
  schedules: {
    list(): Promise<Schedule[]>;
    create(row: NewSchedule): Promise<Schedule>;
    update(id: string, patch: Partial<Schedule>): Promise<Schedule>;
    remove(id: string): Promise<boolean>;
  };
  /**
   * Who shares this feeder. `invite` writes an invite keyed by email that the
   * recipient redeems on /join; there is no privileged server, so the security
   * rules are what make that safe.
   */
  household: {
    name(): Promise<string>;
    members(): Promise<HouseholdMember[]>;
    invites(): Promise<Invite[]>;
    invite(email: string): Promise<Invite>;
    revokeInvite(email: string): Promise<boolean>;
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
  /**
   * Push updates for the collections a second device can change underneath
   * you. Each subscriber is called immediately with the current rows, so a
   * caller never has to also list() and reconcile two sources of truth.
   */
  live: {
    pets(onChange: (rows: Pet[]) => void): Unsubscribe;
    feedings(onChange: (rows: FeedingRecord[]) => void): Unsubscribe;
    alerts(onChange: (rows: Alert[]) => void): Unsubscribe;
  };
  alerts: {
    list(): Promise<Alert[]>;
    append(row: Alert): Promise<Alert>;
    markRead(id: string): Promise<boolean>;
    markAllRead(): Promise<boolean>;
  };
}
