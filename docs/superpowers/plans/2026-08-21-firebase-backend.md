# Stage 2 (Firebase Backend) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the mock data adapter with a live, household-scoped Firestore backend behind Firebase Auth, without changing a single component.

**Architecture:** Components already reach data only through `useFeederData()`, and `services/services-provider.tsx` is the sole construction site for the adapter — so the swap is a `CONFIG.dataSource` branch in one file. Auth sits behind the same seam: an `AuthProvider` resolves a household, and `ServicesProvider` binds a Firebase adapter to that household id. Security rules are the real boundary; the route gate is only UX.

**Tech Stack:** Firebase v12 modular SDK (Auth + Firestore), Firebase emulators, `@firebase/rules-unit-testing`, Vitest, Next.js 15, TypeScript strict.

**Spec:** `docs/superpowers/specs/2026-08-20-feeder-platform-design.md`

## Global Constraints

- Firestore is the database for every in-scope collection. RTDB is reserved for the telemetry stream in a later stage.
- **Client SDK only.** No Admin SDK, no service account, no server route handlers for data. Security rules are the enforcement boundary; the route gate is UX. The one exception is `scripts/seed.ts`, which runs on a developer's machine against the emulator or a live project.
- **All data is household-scoped.** `households/{hid}` with a `memberUids` array is the security boundary; every collection nests beneath it.
- **The mock adapter stays.** `NEXT_PUBLIC_DATA_SOURCE=mock` must continue to run the whole dashboard with no Firebase config at all, including a fake session that bypasses the auth gate.
- Env vars are read as literal `process.env.NEXT_PUBLIC_X` expressions. Never a `const env = process.env` alias — Next does not inline it.
- No module-scope `Date.now()`, `new Date()` or `Math.random()`. Relative time from a client-seeded timestamp is hydration-safe; an absolute clock or date rendered during render needs `suppressHydrationWarning` (only `components/feeder/CameraPreview.tsx` currently needs one).
- **Timestamps are `Timestamp` in Firestore and epoch-milliseconds `number` in the app.** Conversion happens only at the adapter boundary, in one file per adapter. The domain types in `lib/types.ts` do not change shape.
- TypeScript `strict: true`. No `any`; use `unknown` plus narrowing.
- Tailwind v4: no arbitrary-value classes, no `bg-opacity-*` (use slash syntax). Plain `opacity-*` is valid.
- Never commit credentials. `.env.local` is git-ignored and stays that way.
- Test commands: `npm test`, `npm run test:rules`, `npm run typecheck`, `npm run lint`, `npm run build`.
- Commit at the end of every task.

## What Stage 1 Already Settled

Read this before Task 1; it changes what several spec sections ask for.

- **The spec's "nine call-site updates" are already done.** No page calls `services.*`. Every page consumes `useFeederData()`, and `services/services-provider.tsx:36-41` is the only place instances are constructed. The swap really is one line.
- **Instances are constructed once**, in a `useState` initialiser. `useTelemetry(store)` reads the store only on mount, so if this plan makes instances depend on a household id, the provider must remount rather than mutate — Task 12 covers it explicitly.
- **Four fire-and-forget writes exist** at `hooks/useFeederData.tsx:97, 111, 208, 213` (`void services.alerts.append(...)`, `void services.feedings.append(...)`, `void services.alerts.markRead(...)`, `void services.alerts.markAllRead(...)`). Against the mock adapter they cannot meaningfully reject. Against Firestore they can — yielding unhandled rejections plus local state that has silently diverged from the server. Task 13 fixes them.
- **`FeederError` does not exist yet.** `hooks/useFeederData.tsx:55` narrows on `e instanceof Error`. Task 2 introduces the typed error the spec describes.
- **`FeedingRecord` has no `simulated` field.** Stage 1 deliberately omitted it. Task 3 adds it, Task 13 sets it, and the history table renders the badge.
- **`ServiceInstances.engine` is typed as the concrete `SimulationEngine` class** (`services/services-provider.tsx:13`). That is fine for this stage — the engine is still the only telemetry source — but do not widen it speculatively.

## File Structure

| File | Responsibility |
|---|---|
| `lib/errors.ts` | `FeederError`, `toFeederError()` — the typed error both adapters throw |
| `lib/firebase/client.ts` | App/Auth/Firestore init, emulator wiring, local cache |
| `lib/firebase/auth-provider.tsx` | Session status machine, sign-in/out |
| `lib/firebase/household.ts` | Household resolution, auto-create, invite join |
| `lib/firebase/mapping.ts` | `Timestamp` ⇄ epoch-ms conversion for each collection |
| `services/adapters/firebase.ts` | `createFirebaseAdapter(db, hid)` implementing `FeederServices` |
| `services/services-provider.tsx` | Gains the `CONFIG.dataSource` branch |
| `app/(auth)/sign-in/page.tsx` | Email/password + Google |
| `app/(auth)/join/page.tsx` | Invite acceptance |
| `app/(dashboard)/layout.tsx` | Gains the auth gate |
| `firestore.rules` | The security boundary |
| `firestore.indexes.json` | Composite indexes |
| `firebase.json` | Emulator + deploy config |
| `scripts/seed.ts` | Writes the demo household |
| `SETUP.md` | Project creation checklist |

---

### Task 1: Firebase dependencies and the emulator test harness

**Files:**
- Create: `firebase.json`, `.firebaserc`, `vitest.rules.config.ts`
- Modify: `package.json`, `.gitignore`
- Test: `firestore/__tests__/harness.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `npm run test:rules` (Vitest against the Firestore emulator), `npm run emulators`; project id `demo-feeder` for all emulator work.

Emulator tests cannot share the main Vitest config: they need a longer timeout, serial execution, and their own setup. They get `vitest.rules.config.ts` and a separate script. `npm test` must continue to run only the 46 fast unit tests.

- [ ] **Step 1: Install dependencies**

```bash
npm install firebase
npm install -D firebase-tools @firebase/rules-unit-testing
```

- [ ] **Step 2: Create `firebase.json`**

A project id beginning `demo-` makes the emulators run without any credentials.

```json
{
  "firestore": { "rules": "firestore.rules", "indexes": "firestore.indexes.json" },
  "emulators": {
    "auth": { "port": 9099 },
    "firestore": { "port": 8080 },
    "ui": { "enabled": true, "port": 4000 },
    "singleProjectMode": true
  }
}
```

And `.firebaserc`:

```json
{ "projects": { "default": "demo-feeder" } }
```

- [ ] **Step 3: Create a placeholder `firestore.rules` and `firestore.indexes.json`**

The emulator refuses to start without them. Task 4 writes the real rules; Task 5 the real indexes. Deny-all is the correct placeholder — it makes Task 4's first test fail for the right reason.

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /{document=**} { allow read, write: if false; }
  }
}
```

```json
{ "indexes": [], "fieldOverrides": [] }
```

- [ ] **Step 4: Keep emulator tests out of the unit suite**

`vitest.config.ts`'s include pattern is `**/__tests__/**/*.test.ts`, which matches `firestore/__tests__/` too — so `npm test` would try to run emulator tests with no emulator running. Add the directory to the exclude list that already carries the worktree exclusion:

```ts
    exclude: [...configDefaults.exclude, "**/.next/**", "**/.claude/worktrees/**", "**/firestore/**"],
```

- [ ] **Step 5: Create `vitest.rules.config.ts`**

```ts
import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    environment: "node",
    include: ["firestore/__tests__/**/*.test.ts"],
    testTimeout: 15000,
    hookTimeout: 30000,
    fileParallelism: false,
  },
});
```

- [ ] **Step 6: Add scripts to `package.json`**

`emulators:exec` starts the emulators, runs the command, and tears them down, so the suite is one command in CI and locally.

```json
"emulators": "firebase emulators:start --only auth,firestore",
"test:rules": "firebase emulators:exec --only auth,firestore \"vitest run --config vitest.rules.config.ts\""
```

- [ ] **Step 7: Add emulator artefacts to `.gitignore`**

```
firebase-debug.log
firestore-debug.log
ui-debug.log
.firebase/
```

- [ ] **Step 8: Write the failing harness test**

This proves the emulator, the rules file and the test environment are all wired together. It asserts the deny-all placeholder actually denies — so it fails if the harness silently is not talking to the emulator.

```ts
// firestore/__tests__/harness.test.ts
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  assertFails, initializeTestEnvironment, type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import { doc, getDoc } from "firebase/firestore";

let testEnv: RulesTestEnvironment;

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: "demo-feeder",
    firestore: { rules: readFileSync("firestore.rules", "utf8") },
  });
});

afterAll(async () => { await testEnv.cleanup(); });

describe("emulator harness", () => {
  it("loads the rules file and enforces it", async () => {
    const db = testEnv.unauthenticatedContext().firestore();
    await assertFails(getDoc(doc(db, "households/anything")));
  });
});
```

- [ ] **Step 9: Run it**

Run: `npm run test:rules`
Expected: PASS (1 test). The deny-all placeholder denies the read, which is what the assertion expects. If instead you see a connection error, the emulator is not running — check the port numbers in `firebase.json`.

- [ ] **Step 10: Confirm the unit suite is unaffected**

Run: `npm test`
Expected: 46 passed. Confirm with `npx vitest list | grep -c firestore` that it reports 0 — if it does not, the exclude in Step 4 is wrong.

- [ ] **Step 11: Commit**

```bash
git add firebase.json vitest.config.ts .firebaserc firestore.rules firestore.indexes.json vitest.rules.config.ts package.json package-lock.json .gitignore firestore/__tests__/harness.test.ts
git commit -m "chore: add firebase deps and emulator-backed test harness"
```

---

### Task 2: Typed errors

**Files:**
- Create: `lib/errors.ts`
- Modify: `services/adapters/mock.ts`, `hooks/useFeederData.tsx:55`
- Test: `lib/__tests__/errors.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `class FeederError extends Error` with `kind: FeederErrorKind` and `cause?: unknown`; `type FeederErrorKind = "denied" | "offline" | "not-found" | "unknown"`; `toFeederError(e: unknown, fallback: string): FeederError`.

Firestore throws opaque codes and "FirebaseError: Missing or insufficient permissions" is not a sentence anyone feeding their dog should read. Both adapters throw this type, so error paths stay testable without a backend.

- [ ] **Step 1: Write the failing test**

```ts
// lib/__tests__/errors.test.ts
import { describe, expect, it } from "vitest";
import { FeederError, toFeederError } from "@/lib/errors";

class FakeFirebaseError extends Error {
  constructor(readonly code: string, message: string) { super(message); this.name = "FirebaseError"; }
}

describe("toFeederError", () => {
  it("passes a FeederError through unchanged", () => {
    const original = new FeederError("denied", "Nope");
    expect(toFeederError(original, "fallback")).toBe(original);
  });

  it("maps permission-denied to a readable message", () => {
    const err = toFeederError(new FakeFirebaseError("permission-denied", "Missing or insufficient permissions."), "fallback");
    expect(err.kind).toBe("denied");
    expect(err.message).toBe("You do not have access to this feeder.");
  });

  it("maps unavailable to offline", () => {
    const err = toFeederError(new FakeFirebaseError("unavailable", "backend unreachable"), "fallback");
    expect(err.kind).toBe("offline");
    expect(err.message).toBe("Cannot reach the feeder data. Check your connection.");
  });

  it("maps not-found", () => {
    expect(toFeederError(new FakeFirebaseError("not-found", "no doc"), "fallback").kind).toBe("not-found");
  });

  it("calls out a missing index on failed-precondition", () => {
    const err = toFeederError(new FakeFirebaseError("failed-precondition", "The query requires an index."), "fallback");
    expect(err.kind).toBe("unknown");
    expect(err.message).toContain("index");
  });

  it("falls back for an unrecognised error and keeps the cause", () => {
    const raw = new Error("something odd");
    const err = toFeederError(raw, "Could not load feeder data.");
    expect(err.kind).toBe("unknown");
    expect(err.message).toBe("Could not load feeder data.");
    expect(err.cause).toBe(raw);
  });

  it("handles a thrown non-Error", () => {
    const err = toFeederError("just a string", "Could not load feeder data.");
    expect(err.kind).toBe("unknown");
    expect(err.message).toBe("Could not load feeder data.");
  });
});
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `npm test -- errors`
Expected: FAIL — cannot resolve `@/lib/errors`.

- [ ] **Step 3: Write `lib/errors.ts`**

```ts
export type FeederErrorKind = "denied" | "offline" | "not-found" | "unknown";

export class FeederError extends Error {
  constructor(readonly kind: FeederErrorKind, message: string, readonly cause?: unknown) {
    super(message);
    this.name = "FeederError";
  }
}

const hasCode = (e: unknown): e is { code: string } =>
  typeof e === "object" && e !== null && "code" in e && typeof (e as { code: unknown }).code === "string";

export function toFeederError(e: unknown, fallback: string): FeederError {
  if (e instanceof FeederError) return e;
  if (hasCode(e)) {
    switch (e.code) {
      case "permission-denied":
        return new FeederError("denied", "You do not have access to this feeder.", e);
      case "unavailable":
      case "deadline-exceeded":
        return new FeederError("offline", "Cannot reach the feeder data. Check your connection.", e);
      case "not-found":
        return new FeederError("not-found", "That record no longer exists.", e);
      case "failed-precondition":
        // Nearly always a missing composite index; say so while developing.
        return new FeederError("unknown", "This query needs a Firestore index that has not been created yet.", e);
      default:
        break;
    }
  }
  return new FeederError("unknown", fallback, e);
}
```

- [ ] **Step 4: Run the test**

Run: `npm test -- errors`
Expected: PASS (7 tests).

- [ ] **Step 5: Make the mock adapter throw the same type**

`services/adapters/mock.ts` currently throws bare `Error`s — `` throw new Error(`Pet ${id} not found`) `` in `pets.update` and `schedules.update`. Change both to:

```ts
throw new FeederError("not-found", "That pet no longer exists.");
```

and the schedule one to `"That schedule no longer exists."`. Import `FeederError` from `@/lib/errors`. Run `npm test -- mock-adapter` and confirm the existing 8 tests still pass — they assert on rejection, not on the error class, so they should be unaffected.

- [ ] **Step 6: Use the kind in the provider**

`hooks/useFeederData.tsx:55` has:

```ts
const errorMessage = (e: unknown, fallback: string): string =>
  e instanceof Error && e.message ? e.message : fallback;
```

Replace the body with `toFeederError(e, fallback).message` and import `toFeederError`. Behaviour is unchanged for plain `Error`s and improves for Firestore ones. Do not change any call site.

- [ ] **Step 7: Verify**

Run: `npm test && npm run typecheck && npm run lint`
Expected: 53 tests pass (46 + 7), no type or lint errors.

- [ ] **Step 8: Commit**

```bash
git add lib/errors.ts lib/__tests__/errors.test.ts services/adapters/mock.ts hooks/useFeederData.tsx
git commit -m "feat: add FeederError and map adapter failures through it"
```

---

### Task 3: Household types and timestamp mapping

**Files:**
- Modify: `lib/types.ts`
- Create: `lib/firebase/mapping.ts`
- Test: `lib/__tests__/mapping.test.ts`

**Interfaces:**
- Consumes: `Pet`, `FeedingRecord`, `Schedule`, `Alert` from `@/lib/types`.
- Produces: types `Household`, `Invite`, `SessionStatus`; `FeedingRecord.simulated: boolean`; and from `lib/firebase/mapping.ts` — `petFromDoc`, `petToDoc`, `feedingFromDoc`, `feedingToDoc`, `scheduleFromDoc`, `scheduleToDoc`, `alertFromDoc`, `alertToDoc`.

The mapping module is the *only* place `Timestamp` exists. Everything above it speaks epoch milliseconds, exactly as stage 1's UI already does.

- [ ] **Step 1: Add the new types to `lib/types.ts`**

```ts
export type Household = {
  id: string;
  name: string;
  memberUids: string[];
  deviceId: string;
  createdAt: number;
};

export type Invite = {
  email: string;
  hid: string;
  invitedBy: string;
  createdAt: number;
};

export type SessionStatus = "resolving" | "signed-out" | "no-household" | "ready";
```

And add one field to the existing `FeedingRecord`, after `durationS`:

```ts
  /** True while the device is simulated. Real telemetry writes false. */
  simulated: boolean;
```

- [ ] **Step 2: Fix the resulting type errors**

Run `npm run typecheck`. `FeedingRecord` gains a required field, so every construction site breaks. There are exactly two: `lib/seed-data.ts` (`buildSeedFeedings`) and `services/simulation.ts` (the `cycle:complete` record). Set `simulated: true` in both — during this stage the device is simulated, so the flag is honest. Do not make the field optional to dodge the errors; the whole point is that every record states its provenance.

- [ ] **Step 3: Write the failing mapping test**

```ts
// lib/__tests__/mapping.test.ts
import { describe, expect, it } from "vitest";
import { Timestamp } from "firebase/firestore";
import {
  alertFromDoc, alertToDoc, feedingFromDoc, feedingToDoc,
  petFromDoc, petToDoc, scheduleFromDoc, scheduleToDoc,
} from "@/lib/firebase/mapping";
import type { Alert, FeedingRecord, Pet, Schedule } from "@/lib/types";

const pet: Pet = {
  id: "PET001", name: "Max", species: "Dog", breed: "Labrador Retriever", weightKg: 24,
  portionG: 150, mealsPerDay: 3, status: "Active", colour: "amber",
  note: "Weight-managed.", enrolledAt: "2026-05-04",
};

const feeding: FeedingRecord = {
  id: "FD1", timestamp: 1_755_676_800_000, petId: "PET001", targetG: 150, actualG: 149,
  status: "Completed", confidence: 96.4, trigger: "Scheduled", durationS: 8.2, simulated: true,
};

const schedule: Schedule = {
  id: "SCH001", petId: "PET001", time: "06:30", portionG: 150, enabled: true, days: "Daily",
};

const alert: Alert = {
  id: "AL1", severity: "warning", type: "Low food", title: "Hopper below 25%",
  message: "Refill before the next cycle.", source: "HX711",
  timestamp: 1_755_676_800_000, read: false,
};

describe("timestamp mapping", () => {
  it("round-trips a feeding record through Firestore shape", () => {
    const doc = feedingToDoc(feeding);
    expect(doc.timestamp).toBeInstanceOf(Timestamp);
    expect(feedingFromDoc(feeding.id, doc)).toEqual(feeding);
  });

  it("round-trips an alert", () => {
    const doc = alertToDoc(alert);
    expect(doc.timestamp).toBeInstanceOf(Timestamp);
    expect(alertFromDoc(alert.id, doc)).toEqual(alert);
  });

  it("preserves millisecond precision", () => {
    const odd = { ...feeding, timestamp: 1_755_676_800_123 };
    expect(feedingFromDoc(odd.id, feedingToDoc(odd)).timestamp).toBe(1_755_676_800_123);
  });

  it("leaves the document id out of the stored payload", () => {
    expect("id" in feedingToDoc(feeding)).toBe(false);
    expect("id" in petToDoc(pet)).toBe(false);
  });

  it("round-trips a pet, whose enrolledAt is a plain date string", () => {
    const doc = petToDoc(pet);
    expect(doc.enrolledAt).toBe("2026-05-04");
    expect(petFromDoc(pet.id, doc)).toEqual(pet);
  });

  it("round-trips a schedule, which carries no timestamps", () => {
    expect(scheduleFromDoc(schedule.id, scheduleToDoc(schedule))).toEqual(schedule);
  });

  it("defaults simulated to true when a stored record predates the field", () => {
    const legacy = { ...feedingToDoc(feeding) } as Record<string, unknown>;
    delete legacy.simulated;
    expect(feedingFromDoc("FD1", legacy).simulated).toBe(true);
  });

  it("drops an undefined optional rather than writing undefined to Firestore", () => {
    const doc = petToDoc({ ...pet, note: undefined });
    expect("note" in doc).toBe(false);
  });
});
```

- [ ] **Step 4: Run it and confirm it fails**

Run: `npm test -- mapping`
Expected: FAIL — cannot resolve `@/lib/firebase/mapping`.

- [ ] **Step 5: Write `lib/firebase/mapping.ts`**

Each `*ToDoc` returns the stored shape without `id`; each `*FromDoc` takes the document id plus its data and returns the domain type. Two rules the tests pin: Firestore rejects `undefined` field values, so optional fields are omitted rather than written; and `simulated` defaults to `true` when absent, because every record written before real telemetry existed was simulated.

```ts
import { Timestamp } from "firebase/firestore";
import type { Alert, AlertSeverity, FeedingRecord, Pet, PetColour, Schedule } from "@/lib/types";

const toMillis = (v: unknown): number =>
  v instanceof Timestamp ? v.toMillis() : typeof v === "number" ? v : 0;

export function petToDoc(pet: Pet): Record<string, unknown> {
  const { id: _id, note, ...rest } = pet;
  return note === undefined ? { ...rest } : { ...rest, note };
}

export function petFromDoc(id: string, data: Record<string, unknown>): Pet {
  return {
    id,
    name: String(data.name), species: data.species as Pet["species"], breed: String(data.breed),
    weightKg: Number(data.weightKg), portionG: Number(data.portionG), mealsPerDay: Number(data.mealsPerDay),
    status: data.status as Pet["status"], colour: data.colour as PetColour,
    ...(data.note === undefined ? {} : { note: String(data.note) }),
    enrolledAt: String(data.enrolledAt),
  };
}
```

Write `feedingToDoc` / `feedingFromDoc` (converting `timestamp` through `Timestamp.fromMillis` / `toMillis`, defaulting `simulated` to `true`), `scheduleToDoc` / `scheduleFromDoc` (no timestamps — a straight id split), and `alertToDoc` / `alertFromDoc` (same timestamp treatment, `severity` cast to `AlertSeverity`) in the same style.

- [ ] **Step 6: Run the tests**

Run: `npm test -- mapping`
Expected: PASS (8 tests).

- [ ] **Step 7: Verify the whole suite**

Run: `npm test && npm run typecheck`
Expected: 61 tests pass (53 + 8), no type errors. If `simulated` still breaks a construction site, fix that site — do not weaken the type.

- [ ] **Step 8: Commit**

```bash
git add lib/types.ts lib/firebase/mapping.ts lib/__tests__/mapping.test.ts lib/seed-data.ts services/simulation.ts
git commit -m "feat: add household types, simulated flag and Firestore timestamp mapping"
```

---

### Task 4: Security rules

**Files:**
- Modify: `firestore.rules` (replacing the deny-all placeholder)
- Test: `firestore/__tests__/rules.test.ts`

**Interfaces:**
- Consumes: the emulator harness from Task 1.
- Produces: the security boundary every other task relies on. No TypeScript surface.

**This is the most important task in the plan.** Everything else can be wrong and produce a visible bug; this being wrong exposes one household's data to another and nothing looks broken. Write the tests first and make sure each one fails against the deny-all placeholder for the right reason.

The data model, from the spec:

```
households/{hid}              { name, memberUids: string[], deviceId, createdAt }
  ├─ pets/{petId}
  ├─ feedingHistory/{id}
  ├─ feedingSchedules/{id}
  └─ alerts/{id}
invites/{email}               { hid, invitedBy, createdAt }
```

- [ ] **Step 1: Write the failing rules test**

```ts
// firestore/__tests__/rules.test.ts
import { readFileSync } from "node:fs";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import {
  assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import {
  addDoc, collection, deleteDoc, doc, getDoc, getDocs, query, setDoc, updateDoc, where,
} from "firebase/firestore";

let testEnv: RulesTestEnvironment;

const ALICE = { uid: "alice", email: "alice@example.com" };
const BOB = { uid: "bob", email: "bob@example.com" };
const MALLORY = { uid: "mallory", email: "mallory@example.com" };
const HID = "house1";

const alice = () => testEnv.authenticatedContext(ALICE.uid, { email: ALICE.email }).firestore();
const bob = () => testEnv.authenticatedContext(BOB.uid, { email: BOB.email }).firestore();
const mallory = () => testEnv.authenticatedContext(MALLORY.uid, { email: MALLORY.email }).firestore();
const anon = () => testEnv.unauthenticatedContext().firestore();

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: "demo-feeder",
    firestore: { rules: readFileSync("firestore.rules", "utf8") },
  });
});

afterAll(async () => { await testEnv.cleanup(); });

afterEach(async () => { await testEnv.clearFirestore(); });

/** Seed a household owned by Alice, bypassing rules. */
async function seedHousehold(memberUids: string[] = [ALICE.uid]) {
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, "households", HID), {
      name: "Alice's home", memberUids, deviceId: "ESP32-PETFEEDER-001", createdAt: 0,
    });
    await setDoc(doc(db, "households", HID, "pets", "PET001"), { name: "Max", portionG: 150 });
  });
}

describe("household documents", () => {
  it("lets a member read their household", async () => {
    await seedHousehold();
    await assertSucceeds(getDoc(doc(alice(), "households", HID)));
  });

  it("denies a non-member", async () => {
    await seedHousehold();
    await assertFails(getDoc(doc(mallory(), "households", HID)));
  });

  it("denies an anonymous reader", async () => {
    await seedHousehold();
    await assertFails(getDoc(doc(anon(), "households", HID)));
  });

  it("allows a constrained membership query", async () => {
    await seedHousehold();
    const q = query(collection(alice(), "households"), where("memberUids", "array-contains", ALICE.uid));
    await assertSucceeds(getDocs(q));
  });

  it("rejects an unconstrained household query", async () => {
    await seedHousehold();
    // This is the case that silently leaks if the rule is written naively.
    await assertFails(getDocs(collection(mallory(), "households")));
  });

  it("rejects a query constrained to someone else's uid", async () => {
    await seedHousehold();
    const q = query(collection(mallory(), "households"), where("memberUids", "array-contains", ALICE.uid));
    await assertFails(getDocs(q));
  });

  it("lets a signed-in user create a household with themselves as the only member", async () => {
    await assertSucceeds(setDoc(doc(alice(), "households", "newhouse"), {
      name: "New", memberUids: [ALICE.uid], deviceId: "ESP32-PETFEEDER-001", createdAt: 0,
    }));
  });

  it("refuses a household created with someone else pre-added", async () => {
    await assertFails(setDoc(doc(mallory(), "households", "sneaky"), {
      name: "Sneaky", memberUids: [MALLORY.uid, ALICE.uid], deviceId: "d", createdAt: 0,
    }));
  });

  it("refuses deletion outright", async () => {
    await seedHousehold();
    await assertFails(deleteDoc(doc(alice(), "households", HID)));
  });
});

describe("subcollections", () => {
  it("lets a member read and write pets", async () => {
    await seedHousehold();
    await assertSucceeds(getDoc(doc(alice(), "households", HID, "pets", "PET001")));
    await assertSucceeds(addDoc(collection(alice(), "households", HID, "feedingHistory"), { targetG: 150 }));
  });

  it("denies a non-member every subcollection", async () => {
    await seedHousehold();
    await assertFails(getDoc(doc(mallory(), "households", HID, "pets", "PET001")));
    await assertFails(getDocs(collection(mallory(), "households", HID, "alerts")));
    await assertFails(addDoc(collection(mallory(), "households", HID, "feedingHistory"), { targetG: 1 }));
  });
});

describe("membership changes", () => {
  it("lets an invited user add their own uid and nothing else", async () => {
    await seedHousehold();
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), "invites", BOB.email), {
        hid: HID, invitedBy: ALICE.uid, createdAt: 0,
      });
    });
    await assertSucceeds(updateDoc(doc(bob(), "households", HID), {
      memberUids: [ALICE.uid, BOB.uid],
    }));
  });

  it("refuses to add a uid that is not your own, even with an invite", async () => {
    await seedHousehold();
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), "invites", BOB.email), {
        hid: HID, invitedBy: ALICE.uid, createdAt: 0,
      });
    });
    await assertFails(updateDoc(doc(bob(), "households", HID), {
      memberUids: [ALICE.uid, BOB.uid, MALLORY.uid],
    }));
  });

  it("refuses to join without an invite", async () => {
    await seedHousehold();
    await assertFails(updateDoc(doc(mallory(), "households", HID), {
      memberUids: [ALICE.uid, MALLORY.uid],
    }));
  });

  it("refuses an invite that names a different household", async () => {
    await seedHousehold();
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), "invites", BOB.email), {
        hid: "some-other-house", invitedBy: ALICE.uid, createdAt: 0,
      });
    });
    await assertFails(updateDoc(doc(bob(), "households", HID), {
      memberUids: [ALICE.uid, BOB.uid],
    }));
  });

  it("refuses to drop an existing member", async () => {
    await seedHousehold([ALICE.uid, BOB.uid]);
    await assertFails(updateDoc(doc(bob(), "households", HID), { memberUids: [BOB.uid] }));
  });

  it("lets a member rename the household without touching membership", async () => {
    await seedHousehold();
    await assertSucceeds(updateDoc(doc(alice(), "households", HID), { name: "Kitchen feeder" }));
  });

  it("refuses a member silently adding someone via a rename", async () => {
    await seedHousehold();
    await assertFails(updateDoc(doc(alice(), "households", HID), {
      name: "Kitchen feeder", memberUids: [ALICE.uid, MALLORY.uid],
    }));
  });
});

describe("invites", () => {
  it("lets a member invite someone", async () => {
    await seedHousehold();
    await assertSucceeds(setDoc(doc(alice(), "invites", BOB.email), {
      hid: HID, invitedBy: ALICE.uid, createdAt: 0,
    }));
  });

  it("refuses a non-member issuing an invite to that household", async () => {
    await seedHousehold();
    await assertFails(setDoc(doc(mallory(), "invites", BOB.email), {
      hid: HID, invitedBy: MALLORY.uid, createdAt: 0,
    }));
  });

  it("lets only the named invitee read their invite", async () => {
    await seedHousehold();
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), "invites", BOB.email), {
        hid: HID, invitedBy: ALICE.uid, createdAt: 0,
      });
    });
    await assertSucceeds(getDoc(doc(bob(), "invites", BOB.email)));
    await assertFails(getDoc(doc(mallory(), "invites", BOB.email)));
  });

  it("lets the invitee delete their own invite once used", async () => {
    await seedHousehold();
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), "invites", BOB.email), {
        hid: HID, invitedBy: ALICE.uid, createdAt: 0,
      });
    });
    await assertSucceeds(deleteDoc(doc(bob(), "invites", BOB.email)));
  });
});
```

- [ ] **Step 2: Run it against the deny-all placeholder**

Run: `npm run test:rules`
Expected: every `assertSucceeds` case FAILS (deny-all denies them) and every `assertFails` case passes. Read the failure list and confirm it is exactly the positive cases — if an `assertFails` case is failing, the test itself is wrong.

- [ ] **Step 3: Write the rules**

```
rules_version = '2';

service cloud.firestore {
  match /databases/{database}/documents {

    function signedIn() {
      return request.auth != null;
    }

    function householdData(hid) {
      return get(/databases/$(database)/documents/households/$(hid)).data;
    }

    function isMember(hid) {
      return signedIn() && request.auth.uid in householdData(hid).memberUids;
    }

    function inviteFor(email) {
      return get(/databases/$(database)/documents/invites/$(email)).data;
    }

    function hasInviteTo(hid) {
      return signedIn()
        && request.auth.token.email != null
        && exists(/databases/$(database)/documents/invites/$(request.auth.token.email))
        && inviteFor(request.auth.token.email).hid == hid;
    }

    // Adding exactly yourself, changing nothing else.
    function joiningSelf() {
      return request.resource.data.diff(resource.data).affectedKeys().hasOnly(['memberUids'])
        && request.resource.data.memberUids == resource.data.memberUids.concat([request.auth.uid])
        && !(request.auth.uid in resource.data.memberUids);
    }

    match /households/{hid} {
      allow get: if isMember(hid);
      // Per-document evaluation on list: an unconstrained query is rejected
      // rather than filtered, because some document would fail this rule.
      allow list: if signedIn() && request.auth.uid in resource.data.memberUids;

      allow create: if signedIn()
        && request.resource.data.memberUids == [request.auth.uid];

      allow update: if (isMember(hid)
                        && request.resource.data.memberUids == resource.data.memberUids)
                    || (hasInviteTo(hid) && joiningSelf());

      allow delete: if false;

      match /{collection}/{docId} {
        allow read, write: if isMember(hid);
      }
    }

    match /invites/{email} {
      allow get: if signedIn() && request.auth.token.email == email;
      allow create: if signedIn() && isMember(request.resource.data.hid);
      allow delete: if signedIn()
        && (request.auth.token.email == email || isMember(resource.data.hid));
      allow list, update: if false;
    }
  }
}
```

- [ ] **Step 4: Run the rules suite**

Run: `npm run test:rules`
Expected: PASS (22 tests). If "refuses to drop an existing member" fails, check `joiningSelf` — `concat` preserves order, so a reordered array is not equal and the rule correctly refuses.

- [ ] **Step 5: Commit**

```bash
git add firestore.rules firestore/__tests__/rules.test.ts
git commit -m "feat: household-scoped security rules with rules-only invite flow"
```

---

### Task 5: Composite indexes

**Files:**
- Modify: `firestore.indexes.json`
- Test: covered by Task 8's contract suite (the emulator raises `failed-precondition` for a missing index)

**Interfaces:**
- Consumes: nothing.
- Produces: the indexes the adapter's queries need.

The adapter (Task 7) issues two queries that a single-field index cannot serve: feeding history for one pet ordered by time, and unread alerts ordered by time.

- [ ] **Step 1: Write the index definitions**

```json
{
  "indexes": [
    {
      "collectionGroup": "feedingHistory",
      "queryScope": "COLLECTION",
      "fields": [
        { "fieldPath": "petId", "order": "ASCENDING" },
        { "fieldPath": "timestamp", "order": "DESCENDING" }
      ]
    },
    {
      "collectionGroup": "alerts",
      "queryScope": "COLLECTION",
      "fields": [
        { "fieldPath": "read", "order": "ASCENDING" },
        { "fieldPath": "timestamp", "order": "DESCENDING" }
      ]
    }
  ],
  "fieldOverrides": []
}
```

- [ ] **Step 2: Confirm the emulator still starts**

Run: `npm run test:rules`
Expected: the 23 emulator tests still pass (1 harness + 22 rules). A malformed indexes file stops the emulator booting, so a green run proves the JSON is valid.

- [ ] **Step 3: Commit**

```bash
git add firestore.indexes.json
git commit -m "feat: add composite indexes for feeding history and alerts"
```

---

### Task 6: Firebase client initialisation

**Files:**
- Create: `lib/firebase/client.ts`
- Modify: `lib/config.ts`
- Test: `lib/__tests__/firebase-client.test.ts`

**Interfaces:**
- Consumes: `CONFIG` from `@/lib/config`.
- Produces: `getFirebase(): { app: FirebaseApp; auth: Auth; db: Firestore }`, `isFirebaseConfigured(): boolean`, and `CONFIG.useEmulators: boolean`.

Initialisation is lazy and memoised: calling it at module scope would run during the static prerender, where no config exists and nothing needs it. `getFirebase()` is called from inside effects and state initialisers only.

- [ ] **Step 1: Add the emulator flag to `lib/config.ts`**

Add one field, keeping the literal-read rule:

```ts
  useEmulators: process.env.NEXT_PUBLIC_USE_EMULATORS === "true",
```

Then update `lib/__tests__/config.test.ts`'s first case to assert `CONFIG.useEmulators === false` by default, and add `process.env.NEXT_PUBLIC_USE_EMULATORS` to the literal-read assertion list.

- [ ] **Step 2: Write the failing test**

These assertions are about wiring and guard rails, not about Firebase itself — a live connection is exercised by the contract suite in Task 8.

```ts
// lib/__tests__/firebase-client.test.ts
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { isFirebaseConfigured } from "@/lib/firebase/client";

describe("firebase client", () => {
  it("reports unconfigured when no api key is present", () => {
    // No NEXT_PUBLIC_FIREBASE_* vars are set in the test environment.
    expect(isFirebaseConfigured()).toBe(false);
  });

  it("does not initialise anything at module scope", () => {
    const source = readFileSync("lib/firebase/client.ts", "utf8");
    // initializeApp must sit inside a function body, never at top level.
    const topLevelInit = /^initializeApp\(|^const \w+ = initializeApp\(/m.test(source);
    expect(topLevelInit).toBe(false);
  });

  it("enables an offline cache rather than the default memory cache", () => {
    const source = readFileSync("lib/firebase/client.ts", "utf8");
    expect(source).toContain("persistentLocalCache");
  });

  it("wires the emulators only behind the config flag", () => {
    const source = readFileSync("lib/firebase/client.ts", "utf8");
    expect(source).toContain("connectAuthEmulator");
    expect(source).toContain("connectFirestoreEmulator");
    expect(source).toContain("CONFIG.useEmulators");
  });
});
```

- [ ] **Step 3: Run it and confirm it fails**

Run: `npm test -- firebase-client`
Expected: FAIL — cannot resolve `@/lib/firebase/client`.

- [ ] **Step 4: Write `lib/firebase/client.ts`**

```ts
import { getApp, getApps, initializeApp, type FirebaseApp } from "firebase/app";
import { connectAuthEmulator, getAuth, type Auth } from "firebase/auth";
import {
  connectFirestoreEmulator, initializeFirestore, persistentLocalCache,
  persistentMultipleTabManager, type Firestore,
} from "firebase/firestore";
import { CONFIG } from "@/lib/config";

export function isFirebaseConfigured(): boolean {
  return Boolean(CONFIG.firebase.apiKey && CONFIG.firebase.projectId);
}

type FirebaseBundle = { app: FirebaseApp; auth: Auth; db: Firestore };
let bundle: FirebaseBundle | null = null;

export function getFirebase(): FirebaseBundle {
  if (bundle) return bundle;
  if (!isFirebaseConfigured()) {
    throw new Error(
      "Firebase is not configured. Set the NEXT_PUBLIC_FIREBASE_* values in .env.local, or run with NEXT_PUBLIC_DATA_SOURCE=mock.",
    );
  }

  const app = getApps().length ? getApp() : initializeApp({
    apiKey: CONFIG.firebase.apiKey,
    authDomain: CONFIG.firebase.authDomain,
    databaseURL: CONFIG.firebase.databaseURL,
    projectId: CONFIG.firebase.projectId,
  });

  const auth = getAuth(app);
  // A phone on unreliable house wifi renders last-known state instead of an error.
  const db = initializeFirestore(app, {
    localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
  });

  if (CONFIG.useEmulators) {
    connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });
    connectFirestoreEmulator(db, "127.0.0.1", 8080);
  }

  bundle = { app, auth, db };
  return bundle;
}
```

- [ ] **Step 5: Verify**

Run: `npm test && npm run typecheck && npm run lint`
Expected: 65 tests pass (61 + 4), clean typecheck and lint.

- [ ] **Step 6: Commit**

```bash
git add lib/firebase/client.ts lib/config.ts lib/__tests__/firebase-client.test.ts lib/__tests__/config.test.ts
git commit -m "feat: lazy firebase client init with offline cache and emulator wiring"
```

---

### Task 7: The Firebase adapter

**Files:**
- Create: `services/adapters/firebase.ts`
- Test: covered by Task 8's contract suite — do not write a separate unit test

**Interfaces:**
- Consumes: `FeederServices` from `@/services/contract`; the mappers from `@/lib/firebase/mapping`; `toFeederError` from `@/lib/errors`.
- Produces: `createFirebaseAdapter(db: Firestore, hid: string): FeederServices`.

The adapter takes its `Firestore` instance and household id as arguments rather than reaching for globals — that is what lets the contract suite point it at the emulator.

- [ ] **Step 1: Write the adapter**

Every method wraps its body in a `try`/`catch` that rethrows through `toFeederError`, so nothing above ever sees a raw `FirebaseError`. Collection names come from the spec: `pets`, `feedingHistory`, `feedingSchedules`, `alerts`.

```ts
import {
  addDoc, collection, deleteDoc, doc, getDoc, getDocs, orderBy, query,
  setDoc, updateDoc, writeBatch, type Firestore,
} from "firebase/firestore";
import { toFeederError } from "@/lib/errors";
import {
  alertFromDoc, alertToDoc, feedingFromDoc, feedingToDoc,
  petFromDoc, petToDoc, scheduleFromDoc, scheduleToDoc,
} from "@/lib/firebase/mapping";
import type { Alert, FeedingRecord, NewPet, NewSchedule, Pet, Schedule } from "@/lib/types";
import type { FeederServices } from "@/services/contract";

export function createFirebaseAdapter(db: Firestore, hid: string): FeederServices {
  const col = (name: string) => collection(db, "households", hid, name);
  const ref = (name: string, id: string) => doc(db, "households", hid, name, id);

  async function guard<T>(fallback: string, fn: () => Promise<T>): Promise<T> {
    try { return await fn(); } catch (e) { throw toFeederError(e, fallback); }
  }

  return {
    pets: {
      list: () => guard("Could not load pets.", async () => {
        const snap = await getDocs(query(col("pets"), orderBy("name")));
        return snap.docs.map((d) => petFromDoc(d.id, d.data()));
      }),
      get: (id) => guard("Could not load that pet.", async () => {
        const snap = await getDoc(ref("pets", id));
        return snap.exists() ? petFromDoc(snap.id, snap.data()) : null;
      }),
      create: (pet: NewPet) => guard("Could not add the pet.", async () => {
        // Pets keep human-readable ids because the classifier references them.
        const existing = await getDocs(col("pets"));
        const id = pet.id ?? `PET${String(existing.size + 1).padStart(3, "0")}`;
        const next: Pet = { ...pet, id, enrolledAt: new Date().toISOString().slice(0, 10) };
        await setDoc(ref("pets", id), petToDoc(next));
        return next;
      }),
      update: (id, patch) => guard("Could not save the pet.", async () => {
        await updateDoc(ref("pets", id), patch);
        const snap = await getDoc(ref("pets", id));
        if (!snap.exists()) throw toFeederError({ code: "not-found" }, "That pet no longer exists.");
        return petFromDoc(snap.id, snap.data());
      }),
      remove: (id) => guard("Could not delete the pet.", async () => {
        await deleteDoc(ref("pets", id));
        return true;
      }),
    },
    feedings: {
      list: () => guard("Could not load feeding history.", async () => {
        const snap = await getDocs(query(col("feedingHistory"), orderBy("timestamp", "desc")));
        return snap.docs.map((d) => feedingFromDoc(d.id, d.data()));
      }),
      append: (row: FeedingRecord) => guard("Could not record the feeding.", async () => {
        await addDoc(col("feedingHistory"), feedingToDoc(row));
        return row;
      }),
    },
    schedules: {
      list: () => guard("Could not load schedules.", async () => {
        const snap = await getDocs(query(col("feedingSchedules"), orderBy("time")));
        return snap.docs.map((d) => scheduleFromDoc(d.id, d.data()));
      }),
      create: (row: NewSchedule) => guard("Could not add the schedule.", async () => {
        const created = await addDoc(col("feedingSchedules"), scheduleToDoc({ ...row, id: "" }));
        return { ...row, id: created.id };
      }),
      update: (id, patch) => guard("Could not save the schedule.", async () => {
        await updateDoc(ref("feedingSchedules", id), patch);
        const snap = await getDoc(ref("feedingSchedules", id));
        if (!snap.exists()) throw toFeederError({ code: "not-found" }, "That schedule no longer exists.");
        return scheduleFromDoc(snap.id, snap.data());
      }),
      remove: (id) => guard("Could not delete the schedule.", async () => {
        await deleteDoc(ref("feedingSchedules", id));
        return true;
      }),
    },
    alerts: {
      list: () => guard("Could not load alerts.", async () => {
        const snap = await getDocs(query(col("alerts"), orderBy("timestamp", "desc")));
        return snap.docs.map((d) => alertFromDoc(d.id, d.data()));
      }),
      append: (row: Alert) => guard("Could not record the alert.", async () => {
        await addDoc(col("alerts"), alertToDoc(row));
        return row;
      }),
      markRead: (id) => guard("Could not update the alert.", async () => {
        await updateDoc(ref("alerts", id), { read: true });
        return true;
      }),
      markAllRead: () => guard("Could not update the alerts.", async () => {
        const snap = await getDocs(col("alerts"));
        const batch = writeBatch(db);
        snap.docs.forEach((d) => batch.update(d.ref, { read: true }));
        await batch.commit();
        return true;
      }),
    },
  };
}
```

Two deliberate differences from the mock, both forced by a real database and both verified by Task 8:
- `pets.create` derives its id from the current document count, exactly as the mock does. This races under concurrent creates; the spec accepts that for now because a household has one person adding pets at a time. Do **not** silently switch to auto-ids — the classifier depends on `PET001`-style ids.
- `schedules.create` uses an auto-id, so the `{ ...row, id: "" }` placeholder never reaches Firestore — `scheduleToDoc` strips `id`.

- [ ] **Step 2: Confirm it compiles against the contract**

Run: `npm run typecheck && npm run lint`
Expected: clean. If the compiler complains that the returned object does not satisfy `FeederServices`, the signature has drifted — fix the adapter, not the contract.

- [ ] **Step 3: Commit**

```bash
git add services/adapters/firebase.ts
git commit -m "feat: add Firestore adapter implementing FeederServices"
```

---

### Task 8: The contract suite

**Files:**
- Create: `firestore/__tests__/contract.test.ts`

**Interfaces:**
- Consumes: `createMockAdapter`, `createFirebaseAdapter`, the emulator harness.
- Produces: proof that the two adapters are interchangeable.

This is the test the spec cares most about after the rules: one suite, run twice, once per adapter. Drift between them fails here instead of surfacing in a demo.

- [ ] **Step 1: Write the suite**

```ts
// firestore/__tests__/contract.test.ts
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
  { name: "firebase", make: async () => createFirebaseAdapter(await seedFirestore(), HID) },
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

  it("appends an alert", async () => {
    const before = (await svc.alerts.list()).length;
    const [sample] = await svc.alerts.list();
    await svc.alerts.append({ ...sample, id: "AL_contract", timestamp: sample.timestamp + 1 });
    expect((await svc.alerts.list()).length).toBe(before + 1);
  });
});
```

- [ ] **Step 2: Run it**

Run: `npm run test:rules`
Expected: 47 emulator tests pass — 1 harness, 22 rules, and 24 contract (12 assertions × 2 adapters).

Two failures are likely and each means something specific:
- A `failed-precondition` error means a query needs an index that `firestore.indexes.json` does not declare. Add it there, not by removing the `orderBy`.
- A mismatch on `pets.list` ordering means the mock returns insertion order while Firestore returns `orderBy("name")`. Fix it by sorting in the test's assertion (as written above with `.sort()`), never by making one adapter lie about the other's behaviour.

- [ ] **Step 3: Commit**

```bash
git add firestore/__tests__/contract.test.ts
git commit -m "test: prove mock and firebase adapters satisfy one contract"
```

---

### Task 9: Auth provider

**Files:**
- Create: `lib/firebase/auth-provider.tsx`
- Test: `lib/__tests__/auth-provider.test.ts`

**Interfaces:**
- Consumes: `getFirebase`, `isFirebaseConfigured` from `@/lib/firebase/client`; `CONFIG`; `SessionStatus` from `@/lib/types`.
- Produces: `AuthProvider` (client component), `useAuth(): AuthValue` where

```ts
export type AuthValue = {
  status: SessionStatus;              // "resolving" | "signed-out" | "no-household" | "ready"
  user: { uid: string; email: string | null; displayName: string | null } | null;
  householdId: string | null;
  pendingInviteHid: string | null;    // set when an invite exists for this email
  signInWithPassword: (email: string, password: string) => Promise<void>;
  registerWithPassword: (email: string, password: string) => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  signOutNow: () => Promise<void>;
  acceptInvite: () => Promise<void>;
  createHousehold: () => Promise<void>;
};
```

`resolving` is a real state, not a detail: Firebase restores sessions asynchronously, and without it every load flashes the sign-in page. In mock mode the provider yields a fixed fake session and `status` is always `ready`, which is what keeps the dashboard runnable with no backend.

- [ ] **Step 1: Write the failing test**

The household logic itself is tested end-to-end in Task 10 against the emulator; these cases pin the mock-mode contract and the shape, which is what the rest of the app compiles against.

```ts
// lib/__tests__/auth-provider.test.ts
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { MOCK_SESSION } from "@/lib/firebase/auth-provider";

describe("auth provider", () => {
  it("exposes a fixed fake session for mock mode", () => {
    expect(MOCK_SESSION.status).toBe("ready");
    expect(MOCK_SESSION.householdId).toBe("demo-household");
    expect(MOCK_SESSION.user?.uid).toBe("demo-user");
  });

  it("never redirects in mock mode, because status is always ready", () => {
    expect(MOCK_SESSION.status).not.toBe("signed-out");
  });

  it("treats resolving as a distinct state from signed-out", () => {
    const source = readFileSync("lib/firebase/auth-provider.tsx", "utf8");
    expect(source).toContain('"resolving"');
    expect(source).toContain('"signed-out"');
    expect(source).toContain('"no-household"');
  });

  it("subscribes with onAuthStateChanged and unsubscribes", () => {
    const source = readFileSync("lib/firebase/auth-provider.tsx", "utf8");
    expect(source).toContain("onAuthStateChanged");
    // The effect must return the unsubscribe, or a second mount double-subscribes.
    expect(/return\s+onAuthStateChanged|return\s+unsub/.test(source)).toBe(true);
  });

  it("does not construct firebase at module scope", () => {
    const source = readFileSync("lib/firebase/auth-provider.tsx", "utf8");
    expect(/^const \w+ = getFirebase\(\)/m.test(source)).toBe(false);
  });
});
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `npm test -- auth-provider`
Expected: FAIL — module not found.

- [ ] **Step 3: Write `lib/firebase/auth-provider.tsx`**

Structure, with `"use client"` at the top:

```ts
export const MOCK_SESSION: Pick<AuthValue, "status" | "user" | "householdId" | "pendingInviteHid"> = {
  status: "ready",
  user: { uid: "demo-user", email: "demo@example.com", displayName: "Demo" },
  householdId: "demo-household",
  pendingInviteHid: null,
};
```

`AuthProvider` branches on `CONFIG.dataSource === "mock"` *first* and returns the fake session with no-op async methods before touching `getFirebase()` — mock mode must never require config. Otherwise it:

1. Holds `status`, `user`, `householdId`, `pendingInviteHid` in state, starting at `resolving`.
2. In one effect, subscribes with `onAuthStateChanged(auth, ...)` and returns the unsubscribe.
3. On a null user, sets `signed-out`.
4. On a user, calls `resolveHousehold(db, user.uid, user.email)` from Task 10 and sets either `ready` with the id, or `no-household` with `pendingInviteHid` when an invite is waiting.
5. Implements `signInWithPassword` (`signInWithEmailAndPassword`), `registerWithPassword` (`createUserWithEmailAndPassword`), `signInWithGoogle` (`signInWithPopup` + `GoogleAuthProvider`), `signOutNow` (`signOut`), and delegates `acceptInvite` / `createHousehold` to Task 10's helpers, re-resolving afterwards.

Every method wraps failures in `toFeederError` so the sign-in page can show a sentence rather than `auth/wrong-password`.

- [ ] **Step 4: Verify**

Run: `npm test -- auth-provider && npm run typecheck && npm run lint`
Expected: 5 tests pass, clean.

- [ ] **Step 5: Commit**

```bash
git add lib/firebase/auth-provider.tsx lib/__tests__/auth-provider.test.ts
git commit -m "feat: auth provider with resolving state and mock-mode session"
```

---

### Task 10: Household resolution, creation and invite join

**Files:**
- Create: `lib/firebase/household.ts`
- Test: `firestore/__tests__/household.test.ts`

**Interfaces:**
- Consumes: `Household`, `Invite` from `@/lib/types`; `toFeederError`.
- Produces:
```ts
resolveHousehold(db: Firestore, uid: string, email: string | null):
  Promise<{ householdId: string | null; pendingInviteHid: string | null }>
createHouseholdFor(db: Firestore, uid: string, displayName: string | null): Promise<string>
acceptInviteFor(db: Firestore, uid: string, email: string): Promise<string>
```

These run against the emulator with rules **enabled**, because the invite flow is rules-only — if the rule is wrong, `acceptInviteFor` must fail here rather than in production.

- [ ] **Step 1: Write the failing test**

```ts
// firestore/__tests__/household.test.ts
import { readFileSync } from "node:fs";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { initializeTestEnvironment, type RulesTestEnvironment } from "@firebase/rules-unit-testing";
import { doc, getDoc, setDoc, type Firestore } from "firebase/firestore";
import { acceptInviteFor, createHouseholdFor, resolveHousehold } from "@/lib/firebase/household";

let testEnv: RulesTestEnvironment;
const ALICE = { uid: "alice", email: "alice@example.com" };
const BOB = { uid: "bob", email: "bob@example.com" };

const dbFor = (uid: string, email: string) =>
  testEnv.authenticatedContext(uid, { email }).firestore() as unknown as Firestore;

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: "demo-feeder",
    firestore: { rules: readFileSync("firestore.rules", "utf8") },
  });
});
afterAll(async () => { await testEnv.cleanup(); });
afterEach(async () => { await testEnv.clearFirestore(); });

describe("createHouseholdFor", () => {
  it("creates a household naming the creator as sole member", async () => {
    const db = dbFor(ALICE.uid, ALICE.email);
    const hid = await createHouseholdFor(db, ALICE.uid, "Alice");
    const snap = await getDoc(doc(db, "households", hid));
    expect(snap.exists()).toBe(true);
    expect(snap.data()?.memberUids).toEqual([ALICE.uid]);
    expect(snap.data()?.name).toContain("Alice");
  });
});

describe("resolveHousehold", () => {
  it("finds a household the user belongs to", async () => {
    const db = dbFor(ALICE.uid, ALICE.email);
    const hid = await createHouseholdFor(db, ALICE.uid, "Alice");
    const res = await resolveHousehold(db, ALICE.uid, ALICE.email);
    expect(res.householdId).toBe(hid);
    expect(res.pendingInviteHid).toBeNull();
  });

  it("returns nulls for a user with neither household nor invite", async () => {
    const db = dbFor(BOB.uid, BOB.email);
    const res = await resolveHousehold(db, BOB.uid, BOB.email);
    expect(res.householdId).toBeNull();
    expect(res.pendingInviteHid).toBeNull();
  });

  it("surfaces a pending invite when one names this email", async () => {
    const aliceDb = dbFor(ALICE.uid, ALICE.email);
    const hid = await createHouseholdFor(aliceDb, ALICE.uid, "Alice");
    await setDoc(doc(aliceDb, "invites", BOB.email), {
      hid, invitedBy: ALICE.uid, createdAt: 0,
    });
    const res = await resolveHousehold(dbFor(BOB.uid, BOB.email), BOB.uid, BOB.email);
    expect(res.householdId).toBeNull();
    expect(res.pendingInviteHid).toBe(hid);
  });
});

describe("acceptInviteFor", () => {
  it("adds the invitee and deletes the invite", async () => {
    const aliceDb = dbFor(ALICE.uid, ALICE.email);
    const hid = await createHouseholdFor(aliceDb, ALICE.uid, "Alice");
    await setDoc(doc(aliceDb, "invites", BOB.email), {
      hid, invitedBy: ALICE.uid, createdAt: 0,
    });

    const bobDb = dbFor(BOB.uid, BOB.email);
    const joined = await acceptInviteFor(bobDb, BOB.uid, BOB.email);
    expect(joined).toBe(hid);

    const snap = await getDoc(doc(bobDb, "households", hid));
    expect(snap.data()?.memberUids.sort()).toEqual([ALICE.uid, BOB.uid].sort());
    expect((await getDoc(doc(bobDb, "invites", BOB.email))).exists()).toBe(false);
  });

  it("rejects when no invite exists", async () => {
    const db = dbFor(BOB.uid, BOB.email);
    await expect(acceptInviteFor(db, BOB.uid, BOB.email)).rejects.toMatchObject({ kind: "not-found" });
  });
});
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `npm run test:rules`
Expected: the household file fails to resolve. The rules and contract suites still pass.

- [ ] **Step 3: Write `lib/firebase/household.ts`**

Key details:
- `resolveHousehold` queries `where("memberUids", "array-contains", uid)` — the constrained form the rules require. An unconstrained query is rejected, which is the behaviour Task 4 pinned.
- It then reads `invites/{email}` only if no household was found, and only when `email` is non-null.
- `createHouseholdFor` writes `memberUids: [uid]` exactly — the rules refuse a create with anyone else pre-added — and names it from the display name (`"Alice's home"`), falling back to `"My home"`.
- `acceptInviteFor` reads the invite, then commits a `writeBatch` that appends the uid with `arrayUnion(uid)` and deletes the invite. **Use `arrayUnion`, not a hand-built array:** the rules compare against `resource.data.memberUids.concat([uid])`, and `arrayUnion` produces exactly that when the uid is absent. If the invite is missing, throw `new FeederError("not-found", "That invitation is no longer valid.")`.
- Every function wraps failures through `toFeederError`.

- [ ] **Step 4: Run the tests**

Run: `npm run test:rules`
Expected: all 53 emulator tests pass — 1 harness, 22 rules, 24 contract, 6 household.

- [ ] **Step 5: Commit**

```bash
git add lib/firebase/household.ts firestore/__tests__/household.test.ts
git commit -m "feat: household resolution, creation and rules-only invite join"
```

---

### Task 11: Sign-in and invite-acceptance pages

**Files:**
- Create: `app/(auth)/layout.tsx`, `app/(auth)/sign-in/page.tsx`, `app/(auth)/join/page.tsx`
- Test: none — UI, verified by `tsc`, `next build` and the runtime check below

**Interfaces:**
- Consumes: `useAuth()` from `@/lib/firebase/auth-provider`; `Card`, `Button`, `Field`, `Input`, `ErrorState` from `@/components/ui/*`.
- Produces: the two routes outside the dashboard shell.

These are the only new screens in the whole stage. Build them from the existing primitives so they look like the rest of the app — no new design language, no new colour tokens.

- [ ] **Step 1: Create `app/(auth)/layout.tsx`**

A centred single-column shell: `min-h-screen flex items-center justify-center bg-slate-50 p-4`, with the app name and a one-line subtitle above `{children}`. It must **not** mount `FeederDataProvider` — there is no household yet, and mounting it would try to read data as a signed-out user.

- [ ] **Step 2: Create `app/(auth)/sign-in/page.tsx`**

`"use client"`. Local state for `email`, `password`, `mode` (`"sign-in" | "register"`), `busy`, `error`.

- Email and password `Field`/`Input` pairs, a primary submit `Button` reading "Sign in" or "Create account", and a text toggle between the two modes.
- A Google `Button` (`variant="ghost"`) calling `signInWithGoogle`.
- Errors render in the existing `ErrorState` style, showing `FeederError.message` — never a raw `auth/…` code.
- On success, `useEffect` watches `status` and routes with `useRouter()`: `ready` → `/`, `no-household` with a `pendingInviteHid` → `/join`, `no-household` without one → call `createHousehold()` then `/`.
- While `status === "resolving"`, render the loading state rather than the form, so a returning user does not see a flash of sign-in.

- [ ] **Step 3: Create `app/(auth)/join/page.tsx`**

`"use client"`. Reads `pendingInviteHid` from `useAuth()`.

- With an invite: a `Card` explaining that someone invited them, an "Accept invitation" primary `Button` calling `acceptInvite()`, and a secondary "Create my own household instead" calling `createHousehold()`. Both route to `/` on success.
- Without one (direct navigation): an `EmptyState` saying no invitation is waiting, with a link back to `/`.
- Signed out: redirect to `/sign-in`.

- [ ] **Step 4: Verify**

Run: `npm run typecheck && npm run lint && npm run build`
Expected: clean, and the build lists `/sign-in` and `/join` alongside the nine dashboard routes.

Then run the app in mock mode (`npm run dev`) and confirm `/sign-in` renders and that `/` still loads straight into the dashboard without redirecting — mock mode must not gate anything.

- [ ] **Step 5: Commit**

```bash
git add app/\(auth\)
git commit -m "feat: sign-in and invite-acceptance routes"
```

---

### Task 12: Wire the adapter swap and the auth gate

**Files:**
- Modify: `services/services-provider.tsx`, `app/(dashboard)/layout.tsx`
- Test: `lib/__tests__/services-provider.test.ts`

**Interfaces:**
- Consumes: `createFirebaseAdapter`, `createMockAdapter`, `getFirebase`, `useAuth`, `CONFIG`.
- Produces: the swap itself. No new exported surface.

This is the task the whole stage has been building towards, and it is deliberately small.

**The remount rule.** Stage 1 constructs instances once in a `useState` initialiser, and `useTelemetry(store)` reads the store only on mount. The Firebase adapter needs a household id, which is not known on the first render. Do **not** mutate the instances when the id arrives — that would leave `useTelemetry` pinned to a stale store. Instead, render `ServicesProvider` only once a household id exists, and give it a `key={householdId}` so a household change remounts the subtree cleanly.

- [ ] **Step 1: Write the failing test**

```ts
// lib/__tests__/services-provider.test.ts
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync("services/services-provider.tsx", "utf8");

describe("services provider wiring", () => {
  it("branches on CONFIG.dataSource", () => {
    expect(source).toContain("CONFIG.dataSource");
    expect(source).toContain("createFirebaseAdapter");
    expect(source).toContain("createMockAdapter");
  });

  it("still constructs everything inside a single state initialiser", () => {
    expect(source).toContain("useState");
    // Construction at module scope would run during prerender.
    expect(/^const \w+ = create(Mock|Firebase)Adapter\(/m.test(source)).toBe(false);
  });

  it("takes the household id as a prop rather than reading auth itself", () => {
    // Keeps the provider testable and makes the remount boundary explicit.
    expect(source).toContain("householdId");
  });
});
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `npm test -- services-provider`
Expected: FAIL — none of those strings are present yet.

- [ ] **Step 3: Modify `services/services-provider.tsx`**

Give it a `householdId: string` prop and branch inside the existing initialiser. Everything else in the file — the telemetry store, the engine, the command bus, the comment explaining why instances are built once — stays exactly as it is.

```tsx
export function ServicesProvider({ householdId, children }: { householdId: string; children: ReactNode }) {
  const [instances] = useState<ServiceInstances>(() => {
    const services = CONFIG.dataSource === "firebase"
      ? createFirebaseAdapter(getFirebase().db, householdId)
      : createMockAdapter();
    const telemetry = new TelemetryStore(initialTelemetry(Date.now()));
    const engine = new SimulationEngine(telemetry);
    return { services, telemetry, engine, commandBus: createCommandBus(telemetry, engine) };
  });
  return <ServicesCtx.Provider value={instances}>{children}</ServicesCtx.Provider>;
}
```

- [ ] **Step 4: Add the gate to `app/(dashboard)/layout.tsx`**

The layout currently mounts `ServicesProvider > ToastProvider > FeederDataProvider > DashboardShell`. Wrap that stack in `AuthProvider` and a small client gate component that switches on `status`:

- `resolving` → the existing `LoadingState` inside a `Card`, centred. Never the sign-in page: a flash of it on every reload is the bug this state exists to prevent.
- `signed-out` → `router.replace("/sign-in")`, render nothing.
- `no-household` → `router.replace("/join")`, render nothing.
- `ready` → the provider stack, with `<ServicesProvider householdId={householdId} key={householdId}>`.

State the obvious in a comment: this gate is UX, not security. `firestore.rules` is the boundary and holds regardless of what the client renders. There is deliberately no Next middleware — with no server session cookie, a middleware check would be theatre.

In mock mode `status` is always `ready` and `householdId` is `"demo-household"`, so nothing redirects and the dashboard runs with no Firebase config at all.

- [ ] **Step 5: Verify both modes**

Run: `npm test && npm run typecheck && npm run lint && npm run build`
Expected: 73 unit tests (46 from stage 1, plus 7 errors, 8 mapping, 4 client, 5 auth, 3 provider), clean, all eleven routes.

Then exercise both modes for real:
- Mock: `npm run dev` with no `.env.local`. `/` loads the dashboard directly; no redirect; the demo panel drives a full feeding cycle.
- Firebase against the emulators: in one terminal `npm run emulators`; in another, `.env.local` with `NEXT_PUBLIC_DATA_SOURCE=firebase`, `NEXT_PUBLIC_USE_EMULATORS=true` and the demo project values, then `npm run dev`. Visiting `/` must redirect to `/sign-in`. Register an account, land on the dashboard, add a pet, and confirm it appears in the Emulator UI at `http://127.0.0.1:4000/firestore` under `households/{hid}/pets`.

Report exactly what you observed in both modes.

- [ ] **Step 6: Commit**

```bash
git add services/services-provider.tsx app/\(dashboard\)/layout.tsx lib/__tests__/services-provider.test.ts
git commit -m "feat: branch the adapter on CONFIG.dataSource behind an auth gate"
```

---

### Task 13: Harden the writes that assumed a mock backend

**Files:**
- Modify: `hooks/useFeederData.tsx`, `components/feeder/FeedingHistoryTable.tsx`
- Test: none automated — verified against the emulator in the checks below

**Interfaces:**
- Consumes: `toFeederError`, `useToast`.
- Produces: no new surface; four writes stop being fire-and-forget and feeding rows show their provenance.

Stage 1 left four writes as `void services.…(…)` because the mock adapter cannot meaningfully fail. Firestore can — permission denied, offline, a rejected write — and today each of those becomes an unhandled promise rejection while local state has already moved on, so the UI shows a feeding record or a read alert that the server never accepted.

- [ ] **Step 1: Handle the four rejections**

The sites are `hooks/useFeederData.tsx:97` (`alerts.append` inside `raiseAlert`), `:111` (`feedings.append` on `cycle:complete`), `:208` (`alerts.markRead`) and `:213` (`alerts.markAllRead`).

For each, keep the optimistic local update — the UI must stay responsive — but attach a rejection handler that tells the user the write did not stick:

```ts
void services.alerts.append(row).catch((e: unknown) => {
  toast({ tone: "warning", title: "Alert not saved", message: toFeederError(e, "The alert was not recorded.").message });
});
```

Use a message appropriate to each site: "Alert not saved", "Feeding not recorded", "Could not mark as read", "Could not mark all as read". Do not roll the local state back — a lost write is better surfaced than silently undone mid-interaction, and a reload reconciles.

- [ ] **Step 2: Show provenance in the history table**

`FeedingRecord.simulated` exists as of Task 3 and every record written in this stage is `true`. Add a small "Demo" badge to rows where `simulated` is true, using the existing `Badge` component with `tone="warning"`, placed beside the status cell. Match the table's existing type scale and spacing — no new styles.

When real telemetry lands in a later stage, records arrive with `simulated: false` and the badge simply stops appearing. No migration, no filtering.

- [ ] **Step 3: Verify against a failing write**

With the emulators running and `NEXT_PUBLIC_DATA_SOURCE=firebase`, temporarily tighten `firestore.rules` so `alerts` writes are denied (`allow write: if false;` on that subcollection only), restart the emulator, then trigger a low-food alert from the demo panel. You must see the warning toast and **no** unhandled rejection in the browser console. Restore the rules file afterwards and confirm `npm run test:rules` is green again.

State plainly in your report whether you performed this check.

- [ ] **Step 4: Verify normally**

Run: `npm test && npm run test:rules && npm run typecheck && npm run lint && npm run build`
Expected: all green.

- [ ] **Step 5: Commit**

```bash
git add hooks/useFeederData.tsx components/feeder/FeedingHistoryTable.tsx
git commit -m "fix: surface failed background writes and badge simulated feedings"
```

---

### Task 14: Seed script, setup checklist and docs

**Files:**
- Create: `scripts/seed.ts`, `SETUP.md`
- Modify: `package.json`, `CLAUDE.md`, `docs/ARCHITECTURE.md`, `.env.local.example`
- Test: none automated — the seed script is exercised against the emulator

**Interfaces:**
- Consumes: `buildSeedPets/Schedules/Feedings/Alerts` from `@/lib/seed-data`; the mappers.
- Produces: `npm run seed`; a checklist that turns Firebase project creation into a task rather than a debugging session.

- [ ] **Step 1: Write `scripts/seed.ts`**

It writes the demo household from the same seed data the mock adapter uses, so a fresh Firebase project looks exactly like mock mode. Requirements:

- Takes the target household id and owner uid from argv, defaulting to `demo-household` and `demo-user`.
- Refuses to run against a project whose id does not start with `demo-` unless `--force` is passed. Seeding a real project by accident is the failure worth preventing.
- Writes `households/{hid}` with `memberUids: [uid]`, then the pets, schedules, feeding history and alerts through the same mappers the adapter uses — so a mapping bug shows up here too.
- Every feeding row carries `simulated: true`, like all data written in this stage.
- Prints a one-line summary of what it wrote.

Add the script:

```json
"seed": "tsx scripts/seed.ts"
```

and install `tsx` as a dev dependency. Against the emulators, run it with `NEXT_PUBLIC_USE_EMULATORS=true`.

- [ ] **Step 2: Run it against the emulator**

With `npm run emulators` in another terminal:

```bash
NEXT_PUBLIC_DATA_SOURCE=firebase NEXT_PUBLIC_USE_EMULATORS=true npm run seed
```

Confirm in the Emulator UI (`http://127.0.0.1:4000/firestore`) that `households/demo-household` exists with three pets, nine schedules, a feeding history and five alerts. Then sign in as that household in the app and confirm the dashboard renders the seeded data.

- [ ] **Step 3: Write `.env.local.example`**

Every variable the app reads, with empty values and a comment saying the real ones live in `.env.local`, which is git-ignored:

```
NEXT_PUBLIC_DATA_SOURCE=mock
NEXT_PUBLIC_TRANSPORT=simulation
NEXT_PUBLIC_DEVICE_ID=ESP32-PETFEEDER-001
NEXT_PUBLIC_USE_EMULATORS=false
NEXT_PUBLIC_FIREBASE_API_KEY=
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=
NEXT_PUBLIC_FIREBASE_DATABASE_URL=
NEXT_PUBLIC_FIREBASE_PROJECT_ID=
```

- [ ] **Step 4: Write `SETUP.md`**

A checklist someone can follow without knowing this codebase:

1. Create a Firebase project in the console; note the project id.
2. Add a Web app; copy its config into `.env.local` using the names in `.env.local.example`.
3. Enable Authentication → Sign-in method → Email/Password **and** Google.
4. **Add your deployment domain to Authentication → Settings → Authorised domains.** Google sign-in fails with an opaque error otherwise — this is the single most common setup mistake.
5. Create a Firestore database in production mode.
6. Deploy rules and indexes: `npx firebase deploy --only firestore:rules,firestore:indexes`.
7. Seed: `NEXT_PUBLIC_DATA_SOURCE=firebase npm run seed -- --force`.
8. Set `NEXT_PUBLIC_DATA_SOURCE=firebase` and run `npm run dev`.

Include a short troubleshooting section covering the three failures this design produces: `permission-denied` (you are not a member of that household, or rules were not deployed), the missing-index message (deploy indexes), and Google sign-in failing on an unauthorised domain.

- [ ] **Step 5: Update the two docs**

`docs/ARCHITECTURE.md`: the "Swapping mock data for Firebase" section now describes something that exists. Replace the instructions with a description of the wiring — the `CONFIG.dataSource` branch, the household scoping, where rules live — and point at `SETUP.md` for the procedure.

`CLAUDE.md`: add the new commands (`npm run test:rules`, `npm run emulators`, `npm run seed`), the auth/household model in two or three sentences, the rule that security lives in `firestore.rules` and the route gate is UX only, and the timestamp-mapping boundary. Keep it as concise as the rest of the file.

- [ ] **Step 6: Final verification**

Run: `npm test && npm run test:rules && npm run typecheck && npm run lint && npm run build`
Expected: all green; eleven routes.

Then both modes one last time: mock with no config, and firebase against the emulators with a seeded household.

- [ ] **Step 7: Commit**

```bash
git add scripts/seed.ts SETUP.md .env.local.example package.json package-lock.json CLAUDE.md docs/ARCHITECTURE.md
git commit -m "feat: seed script, setup checklist and updated docs"
```

---

## Definition of Done

- `npm test`, `npm run test:rules`, `npm run typecheck`, `npm run lint` and `npm run build` all pass.
- The rules suite proves a non-member is denied every read and write, an invitee can add only their own uid, no one can drop an existing member, and an unconstrained household query is rejected.
- The contract suite passes identically against the mock and Firebase adapters.
- With no `.env.local` at all, the dashboard runs end to end on mock data with no sign-in.
- Against the emulators with `NEXT_PUBLIC_DATA_SOURCE=firebase`: sign in, create a pet, dispense, see the record persist, sign out, sign back in, and the data is still there.
- A second account invited to the household can sign in and see the same pets.
- `SETUP.md` takes someone from an empty Firebase console to a running app.

## Out of Scope

Live telemetry transport (MQTT / RTDB) replacing `SimulationEngine`; ESP32 firmware; member roles beyond membership; hosting and deployment configuration. Each is its own spec.

Also deliberately deferred from stage 1's final review, to be picked up when they stop being cosmetic: the duplicated `chartAxis`/`tooltipStyle` constants across three page files, `navLinkClass` forking `Button`'s class string, and the `Pet | null` vs `Pet | undefined` prop drift between `PetAvatar` and its siblings.
