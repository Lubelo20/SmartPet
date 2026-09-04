# Feeding Decision Engine (sub-project A) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the pure feeding decision engine that every later AI sub-project calls, and wire it into the existing manual-dispense path so it governs real behaviour today.

**Architecture:** A single pure function, `decideFeeding`, in `lib/decision.ts`. No I/O, no clock of its own — `now` is a parameter. It reuses `checkDailyLimit` from `lib/limits.ts` rather than reimplementing the daily maximum, and a new `withinScheduleWindow` helper from `lib/schedule.ts`. It replaces the ad-hoc daily-limit check currently inlined in the `dispense` mutator, so manual feeding gains cooldown, unsafe-amount, food-level and device-online checks that nothing enforces today.

**Tech Stack:** TypeScript, Next.js 15 App Router, Vitest, Firestore rules + `@firebase/rules-unit-testing`.

**Spec:** `docs/superpowers/specs/2026-09-04-ai-pet-identification-design.md`

## Global Constraints

- **Household scoping is the security boundary.** New collections go under `households/{hid}/…`. Never top-level. (spec §4.1)
- **The subcollection rule names its collections explicitly** — never a bare wildcard. Rule matches are OR'd. (spec §5.4)
- **`allow write: if false`** on `models/`, `system/`, `trainingSessions/`. (spec §5.4)
- **Two confidence scales.** Model output and `Prediction.confidence` are `0..1`. `Settings.confidenceThreshold` and `FeedingRecord.confidence` are `0..100`. Conversion happens in **exactly one line** of `lib/decision.ts` and nowhere else. (spec §5.2.1)
- **No `Date.now()`, `new Date()` or `Math.random()` at module scope.** (CLAUDE.md)
- **No arbitrary-value Tailwind classes** (`w-[123px]`). No `bg-opacity-*`. Colour goes through semantic tokens. (CLAUDE.md)
- **Every setting must govern something.** (CLAUDE.md)
- **Both adapters must stay interchangeable.** `firestore/__tests__/contract.test.ts` runs one suite twice. Fix drift in the adapter, never by making a test lie. (CLAUDE.md)
- **Read `process.env.NEXT_PUBLIC_*` literally at the read site.** (CLAUDE.md)
- Run `npm run typecheck && npm test && npm run lint && npm run build` before calling any task done. Rules tasks additionally need `npm run test:rules`, which requires `export PATH="/opt/homebrew/opt/openjdk/bin:$PATH"`.

### Deliberate deviation from the spec

The spec's §6.2 lists `aiEnabled` as step 0. **This plan does not add `aiEnabled`.** Nothing triggers feeding from AI until sub-project F exists, so an `aiEnabled` toggle would be a control that promises behaviour and delivers none — the exact failure CLAUDE.md names as this codebase's most common bug. It belongs in the sub-project that introduces AI triggering. `AI_DISABLED` stays in the `RejectionReason` union (Task 3) so the type does not churn later.

The spec's §6.2 also assumed every decision is AI-triggered. Manual and scheduled feeds must not require a prediction, and must not be refused for being outside a schedule window. `DecisionInput` therefore carries a `trigger`, and the AI-only and schedule-only checks are gated on it. This is a correction to the spec discovered during planning.

---

### Task 1: `withinScheduleWindow` schedule helper

The engine needs "is now inside a feeding window for this pet", which does not exist. `isDue` is unsuitable: it stays true for the rest of the day once a time passes, so an AI feed at 23:00 would count as inside an 07:00 window.

**Files:**
- Modify: `lib/schedule.ts` (append; keep existing exports untouched)
- Test: `lib/__tests__/schedule.test.ts` (append to the existing file)

**Interfaces:**
- Consumes: `minutesOfDay`, `matchesDays` from `lib/schedule.ts`; `Schedule` from `lib/types.ts`
- Produces: `withinScheduleWindow(schedules: Schedule[], petId: string, at: Date, windowMinutes: number): boolean`

- [ ] **Step 1: Write the failing tests**

Append to `lib/__tests__/schedule.test.ts`:

```ts
describe("withinScheduleWindow", () => {
  const sched = (over: Partial<Schedule> = {}): Schedule => ({
    id: "s1", petId: "p1", time: "07:00", portionG: 100,
    enabled: true, days: "Daily", ...over,
  });
  // 2026-09-04 is a Friday.
  const at = (h: number, m: number) => new Date(2026, 8, 4, h, m, 0, 0);

  it("is inside the window at the exact scheduled minute", () => {
    expect(withinScheduleWindow([sched()], "p1", at(7, 0), 30)).toBe(true);
  });

  it("is inside the window before and after, within the tolerance", () => {
    expect(withinScheduleWindow([sched()], "p1", at(6, 31), 30)).toBe(true);
    expect(withinScheduleWindow([sched()], "p1", at(7, 29), 30)).toBe(true);
  });

  it("is outside the window beyond the tolerance on either side", () => {
    expect(withinScheduleWindow([sched()], "p1", at(6, 29), 30)).toBe(false);
    expect(withinScheduleWindow([sched()], "p1", at(7, 31), 30)).toBe(false);
  });

  it("does not stay open for the rest of the day, unlike isDue", () => {
    expect(withinScheduleWindow([sched()], "p1", at(23, 0), 30)).toBe(false);
  });

  it("ignores schedules belonging to another pet", () => {
    expect(withinScheduleWindow([sched({ petId: "p2" })], "p1", at(7, 0), 30)).toBe(false);
  });

  it("ignores disabled schedules", () => {
    expect(withinScheduleWindow([sched({ enabled: false })], "p1", at(7, 0), 30)).toBe(false);
  });

  it("honours the day rule — a Weekends schedule is closed on a Friday", () => {
    expect(withinScheduleWindow([sched({ days: "Weekends" })], "p1", at(7, 0), 30)).toBe(false);
  });

  it("ignores a schedule whose stored time will not parse", () => {
    expect(withinScheduleWindow([sched({ time: "7am" })], "p1", at(7, 0), 30)).toBe(false);
  });

  it("is open if any one of several schedules matches", () => {
    const list = [sched({ id: "a", time: "07:00" }), sched({ id: "b", time: "18:00" })];
    expect(withinScheduleWindow(list, "p1", at(18, 5), 30)).toBe(true);
  });

  it("is closed when the pet has no schedules at all", () => {
    expect(withinScheduleWindow([], "p1", at(7, 0), 30)).toBe(false);
  });
});
```

Add `withinScheduleWindow` to the existing import from `@/lib/schedule` at the top of the file, and `Schedule` to the type import from `@/lib/types` if it is not already there.

- [ ] **Step 2: Run the tests and verify they fail**

Run: `npx vitest run lib/__tests__/schedule.test.ts`
Expected: FAIL — `withinScheduleWindow is not a function`.

- [ ] **Step 3: Write the minimal implementation**

Append to `lib/schedule.ts`:

```ts
/**
 * Whether `at` falls inside a feeding window for this pet.
 *
 * Deliberately not `isDue`: that stays true for the rest of the day once the
 * time passes, which is right for "the device still owes this meal" and wrong
 * for "an animal is at the bowl now". A window is symmetric around the
 * scheduled minute and closes again.
 */
export function withinScheduleWindow(
  schedules: Schedule[],
  petId: string,
  at: Date,
  windowMinutes: number,
): boolean {
  const nowMins = at.getHours() * 60 + at.getMinutes();
  return schedules.some((s) => {
    if (s.petId !== petId) return false;
    if (!s.enabled) return false;
    if (!matchesDays(s.days, at)) return false;
    const mins = minutesOfDay(s.time);
    if (mins === null) return false;
    return Math.abs(nowMins - mins) < windowMinutes;
  });
}
```

- [ ] **Step 4: Run the tests and verify they pass**

Run: `npx vitest run lib/__tests__/schedule.test.ts`
Expected: PASS, including the pre-existing tests in that file.

- [ ] **Step 5: Run the full gates**

Run: `npm run typecheck && npm test && npm run lint`
Expected: typecheck clean, all tests pass, 0 lint errors.

- [ ] **Step 6: Commit**

```bash
git add lib/schedule.ts lib/__tests__/schedule.test.ts
git commit -m "Add withinScheduleWindow, a closing feeding window

isDue stays true for the rest of the day once a scheduled time passes,
which is correct for a device that still owes a meal and wrong for
deciding whether an animal at the bowl right now is due one."
```

---

### Task 2: `feedCooldownS` device setting

`decideFeeding` reads the cooldown from settings, so the field must exist first. It governs nothing until Task 4, which is why these two tasks land together in the same plan.

**Files:**
- Modify: `lib/types.ts` (the `DeviceSettings` type)
- Modify: `lib/seed-data.ts:8`
- Modify: `services/adapters/mock.ts` (settings defaults)
- Modify: `services/adapters/firebase.ts` (settings compose/save)
- Modify: `app/(dashboard)/settings/page.tsx`
- Test: `firestore/__tests__/contract.test.ts` (append a case)

**Interfaces:**
- Consumes: nothing new
- Produces: `Settings.feedCooldownS: number` — seconds, `0` means no cooldown

- [ ] **Step 1: Write the failing contract test**

Append inside the existing settings `describe` block in `firestore/__tests__/contract.test.ts`:

```ts
it("round-trips feedCooldownS through the adapter", async () => {
  const before = await services.settings.get();
  expect(typeof before.feedCooldownS).toBe("number");

  const saved = await services.settings.save({ ...before, feedCooldownS: 600 });
  expect(saved.feedCooldownS).toBe(600);
  expect((await services.settings.get()).feedCooldownS).toBe(600);
});
```

- [ ] **Step 2: Run it and verify it fails**

Run: `export PATH="/opt/homebrew/opt/openjdk/bin:$PATH" && npm run test:rules`
Expected: FAIL — `expected "undefined" to be "number"`, for both adapters.

- [ ] **Step 3: Add the field**

In `lib/types.ts`, extend `DeviceSettings`:

```ts
export type DeviceSettings = {
  deviceName: string; timezone: string; unit: string;
  defaultPortion: number; maxDaily: number; confidenceThreshold: number;
  /**
   * Seconds a pet must wait between feeds. Stops a pet that stays at the bowl
   * being fed repeatedly. 0 disables the check — a blank field must never lock
   * the feeder out, the same rule `checkDailyLimit` follows for its limit.
   */
  feedCooldownS: number;
};
```

In `lib/seed-data.ts:8`, add `feedCooldownS: 300` to the settings literal, so the line reads:

```ts
    defaultPortion: 120, maxDaily: 600, confidenceThreshold: 75, feedCooldownS: 300,
```

**`services/adapters/firebase.ts` needs no change.** Its settings `get` already spreads
`buildSeedSettings()` first and the stored device document over it, so a household whose
`settings/device` predates the field inherits the default. Read that function and confirm
this before moving on — do not edit it.

**`services/adapters/mock.ts` does need a change.** `loadStoredSettings()` returns a parsed
localStorage object verbatim, so a browser holding settings saved before this field returns
a `Settings` without it, and `feedCooldownS` reads `undefined`. Merge the defaults under it:

```ts
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
```

Confirm `buildSeedSettings` is already imported in that file; it is used at line 43.

- [ ] **Step 4: Add the settings control**

In `app/(dashboard)/settings/page.tsx`, beside the existing `maxDaily` field at line 61, following that field's exact markup — no new components, no arbitrary Tailwind values:

```tsx
<Field label="Feed cooldown (seconds)" hint="Minimum gap between feeds for one pet. 0 disables it.">
  <Input
    type="number"
    min={0}
    value={form.feedCooldownS}
    onChange={(e) => set("feedCooldownS", Number(e.target.value))}
  />
</Field>
```

Match the surrounding `Field`/`Input` usage exactly; if the neighbouring field does not use `hint`, drop it rather than introducing a new pattern.

- [ ] **Step 5: Run the tests and verify they pass**

Run: `export PATH="/opt/homebrew/opt/openjdk/bin:$PATH" && npm run test:rules && npm test`
Expected: both adapters pass the new case; the unit suite stays green.

- [ ] **Step 6: Run the full gates**

Run: `npm run typecheck && npm run lint && npm run build`
Expected: clean. `npm run build` catches a missed field in either adapter.

- [ ] **Step 7: Commit**

```bash
git add lib/types.ts lib/seed-data.ts services/adapters app/\(dashboard\)/settings/page.tsx firestore/__tests__/contract.test.ts
git commit -m "Add the feedCooldownS device setting

Read by the decision engine in the next commit. 0 disables the check,
matching checkDailyLimit: a blank field must never lock the feeder out
and leave an animal unfed."
```

---

### Task 3: `decideFeeding`

The safety-critical unit. Pure, so every branch is testable with no emulator, no network and no board.

**Files:**
- Create: `lib/decision.ts`
- Modify: `lib/types.ts` (add the decision types)
- Test: `lib/__tests__/decision.test.ts`

**Interfaces:**
- Consumes: `checkDailyLimit` (`lib/limits.ts`), `withinScheduleWindow` (`lib/schedule.ts`, Task 1), `Settings.feedCooldownS` (Task 2), `Pet`, `Schedule`, `FeedingRecord`, `Telemetry` (`lib/types.ts`)
- Produces: `decideFeeding(input: DecisionInput): Decision`, plus the exported types `FeedTrigger`, `Prediction`, `DecisionInput`, `Decision`, `RejectionReason`, `DetectionStatus`

- [ ] **Step 1: Add the types**

Append to `lib/types.ts`:

```ts
export type DetectionStatus = "RECOGNIZED" | "UNKNOWN" | "ERROR";

export type RejectionReason =
  | "UNKNOWN_PET" | "LOW_AI_CONFIDENCE" | "FEEDING_DISABLED"
  | "DAILY_LIMIT_REACHED" | "OUTSIDE_SCHEDULE" | "INSUFFICIENT_FOOD"
  | "DEVICE_OFFLINE" | "AI_SERVICE_OFFLINE" | "AI_DISABLED"
  | "COOLDOWN_ACTIVE" | "UNSAFE_AMOUNT";

/** What asked for this feed. AI checks apply only to "AI". */
export type FeedTrigger = "Manual" | "Scheduled" | "AI";

/** A model's answer. `confidence` is 0..1 — see the decision engine for the one place it meets the 0..100 threshold. */
export type Prediction = {
  petId: string | null;
  confidence: number;
  status: DetectionStatus;
  modelVersion: string | null;
};
```

- [ ] **Step 2: Write the failing tests**

Create `lib/__tests__/decision.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { decideFeeding, type DecisionInput } from "@/lib/decision";
import type { FeedingRecord, Pet, Prediction, Schedule, Settings } from "@/lib/types";

// A Friday at 07:00 local, matching the Task 1 fixtures.
const NOW = new Date(2026, 8, 4, 7, 0, 0, 0).getTime();

const pet = (over: Partial<Pet> = {}): Pet => ({
  id: "p1", name: "Max", species: "Dog", breed: "Labrador",
  weightKg: 30, portionG: 100, mealsPerDay: 3, status: "Active",
  colour: "amber", enrolledAt: "2026-01-01", ...over,
});

const settings = (over: Partial<Settings> = {}): Settings => ({
  deviceName: "Feeder", timezone: "Africa/Johannesburg", unit: "g",
  defaultPortion: 100, maxDaily: 600, confidenceThreshold: 75, feedCooldownS: 300,
  notifications: { lowFood: true, offline: true, feedingError: true, unknownPet: true },
  ...over,
});

const prediction = (over: Partial<Prediction> = {}): Prediction => ({
  petId: "p1", confidence: 0.96, status: "RECOGNIZED", modelVersion: "v1.2", ...over,
});

const schedule = (over: Partial<Schedule> = {}): Schedule => ({
  id: "s1", petId: "p1", time: "07:00", portionG: 100,
  enabled: true, days: "Daily", ...over,
});

const feeding = (over: Partial<FeedingRecord> = {}): FeedingRecord => ({
  id: "f1", timestamp: NOW, petId: "p1", targetG: 100, actualG: 100,
  status: "Completed", confidence: 95, trigger: "Manual", durationS: 4,
  simulated: true, ...over,
});

const input = (over: Partial<DecisionInput> = {}): DecisionInput => ({
  now: NOW,
  trigger: "AI",
  prediction: prediction(),
  pet: pet(),
  settings: settings(),
  telemetry: {
    device: {
      id: "ESP32-PETFEEDER-001", online: true, ip: "10.0.0.5", ssid: "wifi",
      rssi: -60, firmware: "1.0.0", mqtt: "ok", lastHeartbeat: NOW,
      uptimeS: 100, freeHeapKb: 120,
    },
    hopper: { grams: 400, capacity: 800 },
  },
  schedules: [schedule()],
  todaysFeedings: [],
  lastFeedAt: {},
  requestedG: 100,
  ...over,
});

describe("decideFeeding — approval", () => {
  it("approves a recognised pet that passes every check", () => {
    expect(decideFeeding(input())).toEqual({
      decision: "APPROVED", petId: "p1", amountG: 100,
    });
  });

  it("approves a manual feed with no prediction at all", () => {
    const d = decideFeeding(input({ trigger: "Manual", prediction: null }));
    expect(d.decision).toBe("APPROVED");
  });

  it("approves a manual feed outside every schedule window", () => {
    const d = decideFeeding(input({
      trigger: "Manual", prediction: null,
      now: new Date(2026, 8, 4, 23, 0, 0, 0).getTime(),
    }));
    expect(d.decision).toBe("APPROVED");
  });
});

describe("decideFeeding — rejection", () => {
  it("refuses to feed when the AI service is unreachable", () => {
    const d = decideFeeding(input({ prediction: null }));
    expect(d).toEqual({ decision: "REJECTED", reason: "AI_SERVICE_OFFLINE", petId: null });
  });

  it("refuses an unknown animal", () => {
    const d = decideFeeding(input({ prediction: prediction({ status: "UNKNOWN", petId: null, confidence: 0.42 }) }));
    expect(d).toEqual({ decision: "REJECTED", reason: "UNKNOWN_PET", petId: null });
  });

  it("refuses a recognised pet below the confidence threshold", () => {
    const d = decideFeeding(input({ prediction: prediction({ confidence: 0.62 }) }));
    expect(d).toEqual({ decision: "REJECTED", reason: "LOW_AI_CONFIDENCE", petId: "p1" });
  });

  it("accepts confidence exactly at the threshold", () => {
    const d = decideFeeding(input({ prediction: prediction({ confidence: 0.75 }) }));
    expect(d.decision).toBe("APPROVED");
  });

  it("refuses when the recognised class has no pet document", () => {
    const d = decideFeeding(input({ pet: null }));
    expect(d).toEqual({ decision: "REJECTED", reason: "UNKNOWN_PET", petId: "p1" });
  });

  it("refuses a paused pet", () => {
    const d = decideFeeding(input({ pet: pet({ status: "Paused" }) }));
    expect(d).toEqual({ decision: "REJECTED", reason: "FEEDING_DISABLED", petId: "p1" });
  });

  it("refuses an amount above twice the pet's portion", () => {
    const d = decideFeeding(input({ requestedG: 201 }));
    expect(d).toEqual({ decision: "REJECTED", reason: "UNSAFE_AMOUNT", petId: "p1" });
  });

  it("refuses the brief's 5000 g attack", () => {
    const d = decideFeeding(input({ requestedG: 5000 }));
    expect(d.decision).toBe("REJECTED");
    expect(d).toMatchObject({ reason: "UNSAFE_AMOUNT" });
  });

  it("refuses a non-positive amount", () => {
    expect(decideFeeding(input({ requestedG: 0 }))).toMatchObject({ reason: "UNSAFE_AMOUNT" });
  });

  it("caps the safe amount at 200 g even for a very large portion", () => {
    const d = decideFeeding(input({ pet: pet({ portionG: 400 }), requestedG: 250 }));
    expect(d).toMatchObject({ reason: "UNSAFE_AMOUNT" });
  });

  it("refuses inside the cooldown", () => {
    const d = decideFeeding(input({ lastFeedAt: { p1: NOW - 60_000 } }));
    expect(d).toEqual({ decision: "REJECTED", reason: "COOLDOWN_ACTIVE", petId: "p1" });
  });

  it("allows a feed exactly at the cooldown boundary", () => {
    const d = decideFeeding(input({ lastFeedAt: { p1: NOW - 300_000 } }));
    expect(d.decision).toBe("APPROVED");
  });

  it("treats a zero cooldown as disabled", () => {
    const d = decideFeeding(input({
      settings: settings({ feedCooldownS: 0 }), lastFeedAt: { p1: NOW - 1000 },
    }));
    expect(d.decision).toBe("APPROVED");
  });

  it("refuses once the daily limit would be breached", () => {
    const d = decideFeeding(input({
      todaysFeedings: [feeding({ actualG: 550 })], requestedG: 100,
    }));
    expect(d).toEqual({ decision: "REJECTED", reason: "DAILY_LIMIT_REACHED", petId: "p1" });
  });

  it("refuses an AI feed outside every schedule window", () => {
    const d = decideFeeding(input({ now: new Date(2026, 8, 4, 23, 0, 0, 0).getTime() }));
    expect(d).toEqual({ decision: "REJECTED", reason: "OUTSIDE_SCHEDULE", petId: "p1" });
  });

  it("refuses when the hopper holds less than the request", () => {
    const d = decideFeeding(input({
      telemetry: { ...input().telemetry, hopper: { grams: 40, capacity: 800 } },
    }));
    expect(d).toEqual({ decision: "REJECTED", reason: "INSUFFICIENT_FOOD", petId: "p1" });
  });

  it("refuses when the device is offline", () => {
    const t = input().telemetry;
    const d = decideFeeding(input({
      telemetry: { ...t, device: { ...t.device, online: false } },
    }));
    expect(d).toEqual({ decision: "REJECTED", reason: "DEVICE_OFFLINE", petId: "p1" });
  });
});

describe("decideFeeding — order of checks", () => {
  it("reports the AI failure, not the empty hopper, when both are true", () => {
    const t = input().telemetry;
    const d = decideFeeding(input({
      prediction: null, telemetry: { ...t, hopper: { grams: 0, capacity: 800 } },
    }));
    expect(d).toMatchObject({ reason: "AI_SERVICE_OFFLINE" });
  });

  it("reports the unsafe amount, not the daily limit, when both are true", () => {
    const d = decideFeeding(input({
      requestedG: 5000, todaysFeedings: [feeding({ actualG: 590 })],
    }));
    expect(d).toMatchObject({ reason: "UNSAFE_AMOUNT" });
  });
});
```

- [ ] **Step 3: Run the tests and verify they fail**

Run: `npx vitest run lib/__tests__/decision.test.ts`
Expected: FAIL — cannot resolve `@/lib/decision`.

- [ ] **Step 4: Write the implementation**

Create `lib/decision.ts`:

```ts
import { checkDailyLimit } from "@/lib/limits";
import { withinScheduleWindow } from "@/lib/schedule";
import type {
  FeedTrigger, FeedingRecord, Pet, Prediction, RejectionReason,
  Schedule, Settings, Telemetry,
} from "@/lib/types";

/**
 * Whether an animal eats.
 *
 * Pure on purpose. This is the one place in the system that says yes, and it
 * has to be testable without a network, an emulator, a model or a board — so
 * `now` is a parameter and nothing here reads a clock, a store or a socket.
 *
 * The recorded reason is the FIRST failure, because that is the sentence the
 * user reads on the History page. The order below is therefore part of the
 * contract, not an implementation detail, and the tests assert it.
 */

/** Minutes either side of a scheduled time that still count as "due". */
const SCHEDULE_WINDOW_MINUTES = 30;
/** No single pour may exceed this, whatever the pet's portion says. */
const ABSOLUTE_MAX_PORTION_G = 200;

export type DecisionInput = {
  now: number;
  trigger: FeedTrigger;
  /** null means the AI service gave no answer. Only consulted when trigger is "AI". */
  prediction: Prediction | null;
  /** The pet document for the identified pet, or null if there is none. */
  pet: Pet | null;
  settings: Settings;
  telemetry: Pick<Telemetry, "device" | "hopper">;
  schedules: Schedule[];
  todaysFeedings: FeedingRecord[];
  lastFeedAt: Record<string, number>;
  requestedG: number;
};

export type Decision =
  | { decision: "APPROVED"; petId: string; amountG: number }
  | { decision: "REJECTED"; reason: RejectionReason; petId: string | null };

const reject = (reason: RejectionReason, petId: string | null): Decision =>
  ({ decision: "REJECTED", reason, petId });

export function decideFeeding(input: DecisionInput): Decision {
  const { now, trigger, prediction, pet, settings, telemetry, requestedG } = input;

  // 1-3. AI checks. Manual and scheduled feeds are deliberate acts that do not
  // need a camera to agree with them.
  if (trigger === "AI") {
    // Fail safe, never fail open: no answer means no food.
    if (prediction === null) return reject("AI_SERVICE_OFFLINE", null);
    if (prediction.status !== "RECOGNIZED" || prediction.petId === null) {
      return reject("UNKNOWN_PET", null);
    }
    // The only place the 0..1 wire scale meets the 0..100 stored threshold.
    if (prediction.confidence < settings.confidenceThreshold / 100) {
      return reject("LOW_AI_CONFIDENCE", prediction.petId);
    }
  }

  // 4. A model keeps predicting a class after its pet is deleted. Deletion wins.
  const petId = pet?.id ?? prediction?.petId ?? null;
  if (pet === null) return reject("UNKNOWN_PET", petId);

  // 5.
  if (pet.status !== "Active") return reject("FEEDING_DISABLED", pet.id);

  // 6. Derived from the pet's own portion, so a chihuahua's ceiling is not a
  // labrador's, with an absolute cap above it.
  const maxSafeG = Math.min(pet.portionG * 2, ABSOLUTE_MAX_PORTION_G);
  if (requestedG < 1 || requestedG > maxSafeG) return reject("UNSAFE_AMOUNT", pet.id);

  // 7. A pet that stays at the bowl must not be fed repeatedly. 0 disables.
  const last = input.lastFeedAt[pet.id];
  if (settings.feedCooldownS > 0 && last !== undefined
      && now - last < settings.feedCooldownS * 1000) {
    return reject("COOLDOWN_ACTIVE", pet.id);
  }

  // 8. Reuses the existing helper rather than restating the rule.
  if (!checkDailyLimit(pet.id, input.todaysFeedings, requestedG, settings.maxDaily, now).allowed) {
    return reject("DAILY_LIMIT_REACHED", pet.id);
  }

  // 9. Only AI feeds are bound by the schedule.
  if (trigger === "AI"
      && !withinScheduleWindow(input.schedules, pet.id, new Date(now), SCHEDULE_WINDOW_MINUTES)) {
    return reject("OUTSIDE_SCHEDULE", pet.id);
  }

  // 10-11.
  if (telemetry.hopper.grams < requestedG) return reject("INSUFFICIENT_FOOD", pet.id);
  if (!telemetry.device.online) return reject("DEVICE_OFFLINE", pet.id);

  return { decision: "APPROVED", petId: pet.id, amountG: requestedG };
}
```

- [ ] **Step 5: Run the tests and verify they pass**

Run: `npx vitest run lib/__tests__/decision.test.ts`
Expected: PASS, all cases.

- [ ] **Step 6: Run the full gates**

Run: `npm run typecheck && npm test && npm run lint && npm run build`
Expected: clean.

- [ ] **Step 7: Commit**

```bash
git add lib/decision.ts lib/types.ts lib/__tests__/decision.test.ts
git commit -m "Add decideFeeding, the pure feeding decision engine

The one place in the system that says an animal may eat, so it is pure:
now is a parameter and it reads no clock, store or socket, and every
branch is covered without an emulator, a model or a board.

The recorded reason is the first failure, because that is the sentence
shown on the History page, so the order of checks is part of the
contract and the tests assert it."
```

---

### Task 4: Wire `decideFeeding` into the dispense mutator

Makes `feedCooldownS` govern real behaviour, and gives manual feeding the unsafe-amount, food-level and device-online checks it does not have today.

**Files:**
- Modify: `hooks/useFeederData.tsx:248-272` (the `dispense` mutator)
- Create: `lib/decision-messages.ts`
- Test: `lib/__tests__/decision-messages.test.ts`

**Interfaces:**
- Consumes: `decideFeeding`, `Decision`, `RejectionReason` (Task 3)
- Produces: `rejectionMessage(reason: RejectionReason, ctx: { petName: string }): { title: string; message: string }`

- [ ] **Step 1: Write the failing test for the messages**

Create `lib/__tests__/decision-messages.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { rejectionMessage } from "@/lib/decision-messages";
import type { RejectionReason } from "@/lib/types";

const ALL: RejectionReason[] = [
  "UNKNOWN_PET", "LOW_AI_CONFIDENCE", "FEEDING_DISABLED", "DAILY_LIMIT_REACHED",
  "OUTSIDE_SCHEDULE", "INSUFFICIENT_FOOD", "DEVICE_OFFLINE", "AI_SERVICE_OFFLINE",
  "AI_DISABLED", "COOLDOWN_ACTIVE", "UNSAFE_AMOUNT",
];

describe("rejectionMessage", () => {
  it.each(ALL)("gives %s a title and a message a pet owner can act on", (reason) => {
    const m = rejectionMessage(reason, { petName: "Max" });
    expect(m.title.length).toBeGreaterThan(0);
    expect(m.message.length).toBeGreaterThan(0);
    // No enum constants leaking into the UI.
    expect(m.message).not.toContain("_");
  });

  it("names the pet where the reason is about that pet", () => {
    expect(rejectionMessage("FEEDING_DISABLED", { petName: "Max" }).message).toContain("Max");
  });
});
```

- [ ] **Step 2: Run it and verify it fails**

Run: `npx vitest run lib/__tests__/decision-messages.test.ts`
Expected: FAIL — cannot resolve `@/lib/decision-messages`.

- [ ] **Step 3: Write the implementation**

Create `lib/decision-messages.ts`:

```ts
import type { RejectionReason } from "@/lib/types";

/**
 * A refusal the person reading it can act on.
 *
 * Kept out of `lib/decision.ts` so the engine stays free of copy, and out of
 * the components so two pages cannot word the same refusal differently.
 */
export function rejectionMessage(
  reason: RejectionReason,
  ctx: { petName: string },
): { title: string; message: string } {
  switch (reason) {
    case "UNKNOWN_PET":
      return { title: "Pet not recognised", message: "The animal at the feeder was not recognised, so no food was dispensed." };
    case "LOW_AI_CONFIDENCE":
      return { title: "Identification not confident enough", message: "The feeder was not sure enough which pet this is. Lower the confidence threshold in Settings, or add more training photos." };
    case "FEEDING_DISABLED":
      return { title: "Feeding paused", message: `${ctx.petName} is paused. Set the pet back to Active to allow feeding.` };
    case "DAILY_LIMIT_REACHED":
      return { title: "Daily limit reached", message: `${ctx.petName} has already had the daily maximum. Raise it in Settings if that is wrong.` };
    case "OUTSIDE_SCHEDULE":
      return { title: "Outside feeding times", message: `This is not one of ${ctx.petName}'s scheduled meal times.` };
    case "INSUFFICIENT_FOOD":
      return { title: "Not enough food", message: "The hopper holds less than the requested portion. Refill it and try again." };
    case "DEVICE_OFFLINE":
      return { title: "Feeder offline", message: "The feeder cannot be reached. Check its power and Wi-Fi." };
    case "AI_SERVICE_OFFLINE":
      return { title: "Identification unavailable", message: "The feeder could not identify the animal, so it did not dispense. This is deliberate." };
    case "AI_DISABLED":
      return { title: "Automatic feeding is off", message: "Identification-triggered feeding is switched off. Scheduled and manual feeding still work." };
    case "COOLDOWN_ACTIVE":
      return { title: "Fed too recently", message: `${ctx.petName} was fed a moment ago. The cooldown stops a pet at the bowl being fed repeatedly.` };
    case "UNSAFE_AMOUNT":
      return { title: "Portion refused", message: `That portion is outside the safe range for ${ctx.petName}.` };
  }
}
```

- [ ] **Step 4: Run it and verify it passes**

Run: `npx vitest run lib/__tests__/decision-messages.test.ts`
Expected: PASS. TypeScript's exhaustiveness check on the switch means a future reason cannot be forgotten.

- [ ] **Step 5: Replace the mutator body**

In `hooks/useFeederData.tsx`, replace the body of `dispense` (currently lines 248-272 — the inlined `checkDailyLimit` block and its toast) with:

```tsx
  const dispense = useCallback(async (pet: Pet, portionG: number) => {
    if (!pet) return;
    const now = Date.now();

    // Every refusal in one place. This used to enforce the daily maximum
    // alone; the engine adds the cooldown, the safe-portion range, the food
    // level and the device check, and words each refusal once.
    const verdict = decideFeeding({
      now,
      trigger: "Manual",
      prediction: null,
      pet,
      settings,
      telemetry: { device: telemetry.device, hopper: telemetry.hopper },
      schedules,
      todaysFeedings: feedings,
      lastFeedAt: lastFeedAtRef.current,
      requestedG: portionG,
    });

    if (verdict.decision === "REJECTED") {
      const { title, message } = rejectionMessage(verdict.reason, { petName: pet.name });
      toast({ tone: "critical", title, message });
      return;
    }

    try {
      await commandBus.send("feeding.start", { petId: pet.id, portionG, trigger: "Manual" });
      lastFeedAtRef.current = { ...lastFeedAtRef.current, [pet.id]: now };
    } catch (e) {
      toast({ tone: "critical", title: "Feeding failed", message: errorMessage(e, "The feeding command failed.") });
    }
  }, [commandBus, toast, feedings, settings, telemetry, schedules]);
```

Add near the other refs in the provider — a ref, not state, because writing it must not re-render:

```tsx
  // Last accepted feed per pet, for the cooldown. A ref: recording it must not
  // re-render, and it is read at call time, never during render.
  const lastFeedAtRef = useRef<Record<string, number>>({});
```

Add the imports: `decideFeeding` from `@/lib/decision`, `rejectionMessage` from `@/lib/decision-messages`, and `useRef` from `react`. Remove the `checkDailyLimit` import **only if** nothing else in the file still uses it — the `engine.setDailyLimit` effect uses `dailyTotalFor`, which is a different export, so check before deleting.

- [ ] **Step 6: Run the full gates**

Run: `npm run typecheck && npm test && npm run lint && npm run build`
Expected: clean. If a test asserted the old daily-limit toast copy, update that test to the new wording from `rejectionMessage` — the copy moved, the behaviour did not.

- [ ] **Step 7: Verify by hand in the running app**

Run: `npm run dev`, open http://localhost:3000, and check three things:
1. A normal quick feed still dispenses.
2. A second quick feed for the same pet within 5 minutes is refused with "Fed too recently".
3. Setting the feed cooldown to `0` in Settings makes back-to-back feeds work again.

Expected: all three. Step 3 is the check that the setting governs something.

- [ ] **Step 8: Commit**

```bash
git add hooks/useFeederData.tsx lib/decision-messages.ts lib/__tests__/decision-messages.test.ts
git commit -m "Route manual feeding through the decision engine

dispense enforced the daily maximum and nothing else: an unsafe portion,
an empty hopper, an offline device and a pet already fed a moment ago all
sent the command anyway. One call to decideFeeding covers all of them and
makes feedCooldownS govern something, which is the bar this codebase sets
for adding a setting at all."
```

---

### Task 5: Firestore rules for the AI collections

Foundation for sub-projects B, C and D. Done as one rules change with tests rather than three later.

**Files:**
- Modify: `firestore.rules`
- Test: `firestore/__tests__/rules.test.ts` (append)

**Interfaces:**
- Consumes: the existing `isMember(hid)` and `signedIn()` helpers in `firestore.rules`
- Produces: no code interface — a security boundary the later sub-projects rely on

- [ ] **Step 1: Write the failing rules tests**

Append to `firestore/__tests__/rules.test.ts`. That file already defines `alice()`, `bob()`,
`HID` and an `afterEach` that seeds a household where Alice is a member and Bob is not —
reuse them; do not define new context helpers.

```ts
describe("AI collections", () => {
  it("lets a member read and write detections in their own household", async () => {
    const db = alice();
    await assertSucceeds(setDoc(doc(db, "households", HID, "detections", "d1"), {
      deviceId: "ESP32-PETFEEDER-001", petId: "p1", confidence: 0.96,
      status: "RECOGNIZED", timestamp: 1_756_000_000_000,
    }));
    await assertSucceeds(getDoc(doc(db, "households", HID, "detections", "d1")));
  });

  it("lets a member write feedingEvents and trainingImages", async () => {
    const db = alice();
    await assertSucceeds(setDoc(doc(db, "households", HID, "feedingEvents", "e1"), {
      requestId: "FEED-1", decision: "REJECTED", reason: "UNKNOWN_PET",
      timestamp: 1_756_000_000_000,
    }));
    await assertSucceeds(setDoc(doc(db, "households", HID, "trainingImages", "i1"), {
      petId: "p1", storagePath: "training/house1/p1/i1.jpg", approved: true,
      uploadedAt: 1_756_000_000_000,
    }));
  });

  it("refuses a non-member reading another household's detections", async () => {
    await assertFails(getDoc(doc(bob(), "households", HID, "detections", "d1")));
  });

  it("refuses writes to a collection not on the allowed list", async () => {
    await assertFails(setDoc(doc(alice(), "households", HID, "somethingElse", "x"), { a: 1 }));
  });

  it("lets any signed-in user read the model registry", async () => {
    const db = bob();
    await assertSucceeds(getDoc(doc(db, "models", "v1.0")));
    await assertSucceeds(getDoc(doc(db, "system", "ai")));
  });

  it("refuses a client writing the model registry, however it is dressed up", async () => {
    const db = alice();
    await assertFails(setDoc(doc(db, "models", "v9.9"), { status: "ACTIVE", accuracy: 1 }));
    await assertFails(setDoc(doc(db, "system", "ai"), { activeModelVersion: "v9.9" }));
    await assertFails(setDoc(doc(db, "trainingSessions", "s1"), { status: "COMPLETE" }));
  });

  it("refuses an unauthenticated read of the model registry", async () => {
    await assertFails(getDoc(doc(anon(), "models", "v1.0")));
  });
});
```

Note the literal timestamps: `Date.now()` in a test body is fine, but fixed values keep a
failure reproducible. Reading a document that does not exist still exercises the rule —
`assertSucceeds` on a permitted read of a missing document passes.

- [ ] **Step 2: Run and verify they fail**

Run: `export PATH="/opt/homebrew/opt/openjdk/bin:$PATH" && npm run test:rules`
Expected: the household-collection cases FAIL (the collections are not on the allowed list); the `models`/`system` read cases FAIL (no rule matches, so access is denied).

- [ ] **Step 3: Change the rules**

In `firestore.rules`, extend the explicit collection list — keeping the existing comment, which explains why it is a list and not a wildcard:

```
      match /{collection}/{docId} {
        allow read, write: if isMember(hid)
          && collection in ['pets', 'feedingHistory', 'feedingSchedules', 'alerts', 'settings',
                            'detections', 'feedingEvents', 'trainingImages'];
      }
```

And add, as siblings of `match /invites/{email}`:

```
    // The model registry is global — one model serves every household — and is
    // written only by the training job and the activation callable, both of
    // which use the Admin SDK and bypass rules. A client that could mark a
    // model ACTIVE could point every feeder in the system at a model it
    // trained itself, so no client may write here at all.
    match /models/{version}      { allow read: if signedIn(); allow write: if false; }
    match /system/{doc}          { allow read: if signedIn(); allow write: if false; }
    match /trainingSessions/{id} { allow read: if signedIn(); allow write: if false; }
```

- [ ] **Step 4: Run and verify they pass**

Run: `export PATH="/opt/homebrew/opt/openjdk/bin:$PATH" && npm run test:rules`
Expected: PASS, all of them, and the pre-existing 22 rules tests still green.

- [ ] **Step 5: Deploy the rules**

Run: `npx firebase deploy --only firestore:rules --project smart-pet-feeder-g4`
Expected: `rules file firestore.rules compiled successfully` then `released rules`.

- [ ] **Step 6: Commit**

```bash
git add firestore.rules firestore/__tests__/rules.test.ts
git commit -m "Add rules for the AI collections

detections, feedingEvents and trainingImages join the explicit
household subcollection list. models, system and trainingSessions are
global and readable by any signed-in user but writable by no client:
a client that could mark a model ACTIVE could point every feeder at a
model it trained itself."
```

---

## Done when

- `npm run typecheck && npm test && npm run lint && npm run build` all clean
- `npm run test:rules` green, including the new AI-collection cases
- A second quick feed inside the cooldown is refused in the running app, and setting the cooldown to 0 allows it again
- Rules deployed to `smart-pet-feeder-g4`

## Explicitly not in this plan

Deferred to their own sub-projects, per the spec's §14 sequence: `Detection` and `FeedingEvent` **types and adapter methods** (nothing writes them yet — adding contract methods with no caller is speculative), the AI Training route, Firebase Storage, the Colab pipeline, the model registry UI, the FastAPI service, real-time listeners, and `aiEnabled`.
