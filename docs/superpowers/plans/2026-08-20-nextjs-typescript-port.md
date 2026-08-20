# Smart Pet Feeder — Stage 1 (Next.js + TypeScript Port) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Split `smart-pet-feeder-dashboard.jsx` into a Next.js 15 + TypeScript project that renders and behaves identically, with the mock adapter and simulation engine intact.

**Architecture:** Bottom-up port — `lib/` then `services/` then components then pages — so type errors surface next to their cause. The four layers from the original file's banner comments become folders. State that lived in `AppShell` moves into a `FeederDataProvider` in the dashboard route-group layout, because App Router replaces the single-component route switch with real routes.

**Tech Stack:** Next.js 15 (App Router), React 19, TypeScript strict, Tailwind v4, Vitest, lucide-react, recharts 3.

**Spec:** `docs/superpowers/specs/2026-08-20-feeder-platform-design.md`

## Global Constraints

- Next.js 15 App Router, no `src/` directory, import alias `@/*`.
- TypeScript `strict: true`. No `any` in committed code; use `unknown` plus narrowing.
- Tailwind v4. The seven `bg-opacity-*` utilities become slash syntax (`bg-white/90`, `bg-slate-900/40`). No arbitrary-value classes (`w-[42px]`) anywhere — the original avoided them and that habit is kept.
- recharts `^3` (recharts 2 does not support React 19).
- **Env vars must be read as literal `process.env.NEXT_PUBLIC_X` expressions.** Next inlines only the literal form; a destructured `const env = process.env` alias yields `undefined` in the browser. The original file uses the alias form at line 44 — that is a bug to fix, not a pattern to copy.
- **No module-scope `Date.now()`, `new Date()` or `Math.random()`.** Values computed at import time differ between server prerender and client hydration and cause React hydration errors. Every seed and initial-telemetry value comes from a factory function called from a client state initialiser or effect.
- No behavioural changes and no refactoring of component internals beyond what typing forces. The one sanctioned extraction is `deriveAnalytics()` out of `useAnalytics` (Task 8), so the derivation can be tested without a DOM.
- `"use client"` at the top of every file under `components/`, `hooks/`, `services/` that uses hooks, handlers or browser APIs, and every `app/(dashboard)/**/page.tsx`. Only `app/layout.tsx` stays a server component.
- `smart-pet-feeder-dashboard.jsx` stays on disk untouched until Task 17. It is the reference for every port task — cited by line range, never guessed at.
- Commit at the end of every task. Test commands: `npm test` (Vitest, node environment), `npm run typecheck` (`tsc --noEmit`), `npm run build`.

## File Structure

| File | Responsibility |
|---|---|
| `lib/config.ts` | `CONFIG` from literal env reads |
| `lib/types.ts` | Domain types + engine event union |
| `lib/utils.ts` | Formatters, clamp, seeded PRNG, `uid`, `delay` |
| `lib/analytics.ts` | `deriveAnalytics()` — pure |
| `lib/seed-data.ts` | `buildSeedPets/Schedules/Feedings/Alerts()` factories |
| `services/contract.ts` | `FeederServices` interface |
| `services/adapters/mock.ts` | `createMockAdapter()` |
| `services/telemetry.ts` | `TelemetryStore`, `initialTelemetry()` |
| `services/simulation.ts` | `SimulationEngine` |
| `services/commands.ts` | `createCommandBus()` |
| `hooks/useTelemetry.ts` | Subscribe to a store |
| `hooks/useToast.tsx` | `ToastProvider` + `useToast` |
| `hooks/useAnalytics.ts` | `useMemo` wrapper over `deriveAnalytics` |
| `components/ui/*` | 14 primitives |
| `components/feeder/*` | 14 feature components |
| `components/layout/*` | `Sidebar`, `Header`, `DemoPanel` |
| `app/(dashboard)/layout.tsx` | `FeederDataProvider` + shell + engine event wiring |
| `app/(dashboard)/**/page.tsx` | 9 route pages |

---

### Task 1: Project scaffold and test harness

**Files:**
- Create: `package.json`, `tsconfig.json`, `next.config.ts`, `app/layout.tsx`, `app/globals.css`, `vitest.config.ts`
- Test: `lib/__tests__/smoke.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `npm test`, `npm run typecheck`, `npm run build`; import alias `@/*` resolving from the repo root in both Next and Vitest.

- [ ] **Step 1: Scaffold into a temp directory**

`create-next-app` aborts when the target directory holds files it does not recognise, and this repo already has `CLAUDE.md`, `docs/` and the `.jsx`. Scaffold elsewhere, then move the generated files in.

```bash
npx create-next-app@latest /tmp/feeder-scaffold \
  --typescript --tailwind --eslint --app --no-src-dir \
  --import-alias "@/*" --use-npm --yes
```

- [ ] **Step 2: Move the scaffold into the repo**

```bash
REPO="$PWD"          # run this from the repo root; it may be a git worktree
cd /tmp/feeder-scaffold && rm -rf .git README.md public/*.svg app/page.tsx
cp -R . "$REPO"/
cd "$REPO" && npm install
```

`app/page.tsx` is deleted because the real root route is `app/(dashboard)/page.tsx` (Task 13).

- [ ] **Step 3: Install runtime and test dependencies**

```bash
npm install lucide-react recharts@^3
npm install -D vitest vite-tsconfig-paths
```

- [ ] **Step 4: Add the Vitest config**

`vitest.config.ts` — node environment, because every test in this plan covers pure logic. `vite-tsconfig-paths` makes `@/lib/...` resolve in tests the same way it does in Next.

```ts
import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: { environment: "node", include: ["**/__tests__/**/*.test.ts"] },
});
```

- [ ] **Step 5: Add scripts to `package.json`**

```json
"scripts": {
  "dev": "next dev",
  "build": "next build",
  "start": "next start",
  "lint": "eslint",
  "test": "vitest run",
  "test:watch": "vitest",
  "typecheck": "tsc --noEmit"
}
```

- [ ] **Step 6: Write the failing smoke test**

```ts
// lib/__tests__/smoke.test.ts
import { describe, expect, it } from "vitest";
import { clamp } from "@/lib/utils";

describe("harness", () => {
  it("resolves the @/ alias and runs a real import", () => {
    expect(clamp(12, 0, 10)).toBe(10);
  });
});
```

- [ ] **Step 7: Run it and confirm it fails**

Run: `npm test`
Expected: FAIL — `Failed to resolve import "@/lib/utils"`. This proves the alias plumbing is exercised, not stubbed.

- [ ] **Step 8: Create the minimal `lib/utils.ts`**

```ts
export const clamp = (v: number, a: number, b: number): number => Math.min(b, Math.max(a, v));
```

- [ ] **Step 9: Run the test and the build**

Run: `npm test && npm run typecheck`
Expected: 1 passing test, no type errors.

- [ ] **Step 10: Replace the root layout**

`app/layout.tsx` is the only server component in the project.

```tsx
import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Smart Pet Feeder",
  description: "Monitor feeding activity, pets, sensors and device status in real time.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-slate-50 text-slate-900 font-sans antialiased">{children}</body>
    </html>
  );
}
```

- [ ] **Step 11: Commit**

```bash
git add -A
git commit -m "chore: scaffold Next.js 15 + TypeScript + Vitest harness"
```

---

### Task 2: Config and domain types

**Files:**
- Create: `lib/config.ts`, `lib/types.ts`
- Test: `lib/__tests__/config.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `CONFIG` (`{ dataSource, transport, deviceId, firebase, mqtt, hopperCapacityG, lowFoodThreshold }`); types `Pet`, `NewPet`, `PetColour`, `FeedingRecord`, `Schedule`, `NewSchedule`, `Alert`, `AlertSeverity`, `Telemetry`, `DeviceStatus`, `DetectionState`, `EngineEvent`, `Settings`, `Tone`, `ToastInput`.

The `Settings` shape is taken from `smart-pet-feeder-dashboard.jsx:2101-2105`; Task 12 consumes it.

- [ ] **Step 1: Write the failing test**

The second case is the important one: it fails if someone reintroduces the `const env = process.env` alias, which typechecks and passes a naive unit test while shipping `undefined` to the browser.

```ts
// lib/__tests__/config.test.ts
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { CONFIG } from "@/lib/config";

describe("CONFIG", () => {
  it("falls back to mock/simulation defaults when env is unset", () => {
    expect(CONFIG.dataSource).toBe("mock");
    expect(CONFIG.transport).toBe("simulation");
    expect(CONFIG.deviceId).toBe("ESP32-PETFEEDER-001");
    expect(CONFIG.hopperCapacityG).toBe(1500);
    expect(CONFIG.lowFoodThreshold).toBe(0.2);
  });

  it("reads env vars literally so Next can inline them", () => {
    const source = readFileSync("lib/config.ts", "utf8");
    expect(source).toContain("process.env.NEXT_PUBLIC_DATA_SOURCE");
    expect(source).not.toMatch(/const\s+env\s*=/);
  });
});
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `npm test -- config`
Expected: FAIL — cannot resolve `@/lib/config`.

- [ ] **Step 3: Write `lib/config.ts`**

Ported from `smart-pet-feeder-dashboard.jsx:41-67`, with every env read expanded to its literal form.

```ts
export const CONFIG = {
  dataSource: process.env.NEXT_PUBLIC_DATA_SOURCE ?? "mock",
  transport: process.env.NEXT_PUBLIC_TRANSPORT ?? "simulation",
  deviceId: process.env.NEXT_PUBLIC_DEVICE_ID ?? "ESP32-PETFEEDER-001",
  // Credentials come from .env.local and stay there.
  firebase: {
    apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
    authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
    databaseURL: process.env.NEXT_PUBLIC_FIREBASE_DATABASE_URL,
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  },
  mqtt: {
    url: process.env.NEXT_PUBLIC_MQTT_URL,
    topicIn: "petfeeder/+/telemetry",
    topicOut: "petfeeder/{deviceId}/command",
  },
  hopperCapacityG: 1500,
  lowFoodThreshold: 0.2,
} as const;
```

- [ ] **Step 4: Write `lib/types.ts`**

```ts
export type PetColour = "amber" | "sky" | "emerald" | "violet" | "rose";

export type Pet = {
  id: string; name: string; species: "Dog" | "Cat"; breed: string;
  weightKg: number; portionG: number; mealsPerDay: number;
  status: "Active" | "Paused"; colour: PetColour; note?: string; enrolledAt: string;
};
export type NewPet = Omit<Pet, "id" | "enrolledAt"> & { id?: string };

export type FeedingRecord = {
  id: string; timestamp: number; petId: string; targetG: number; actualG: number;
  status: "Completed" | "Under-dispensed" | "Low confidence";
  confidence: number; trigger: "Manual" | "Scheduled"; durationS: number;
};

export type Schedule = {
  id: string; petId: string; time: string; portionG: number;
  enabled: boolean; days: "Daily" | "Weekdays" | "Weekends";
};
export type NewSchedule = Omit<Schedule, "id">;

export type AlertSeverity = "critical" | "warning" | "info";
export type Alert = {
  id: string; severity: AlertSeverity; type: string; title: string;
  message: string; source: string; timestamp: number; read: boolean;
};

export type DetectionState = "idle" | "detected" | "identifying" | "identified" | "unknown";

export type DeviceStatus = {
  id: string; online: boolean; ip: string; ssid: string; rssi: number;
  firmware: string; mqtt: string; lastHeartbeat: number; uptimeS: number; freeHeapKb: number;
};

export type Telemetry = {
  device: DeviceStatus;
  hopper: { grams: number; capacity: number };
  bowl: { grams: number; targetG: number };
  distanceCm: number;
  servo: "READY" | "DISPENSING";
  camera: { online: boolean; lastFrameAt: number; fps: number };
  detection: { state: DetectionState; petId: string | null; confidence: number; since: number };
  cycle: {
    active: boolean; step: number; petId: string | null; targetG: number;
    trigger: string | null; startedAt: number | null; message: string;
  };
  demo: boolean;
  history: { weight: { t: number; v: number }[]; distance: { t: number; v: number }[] };
};

export type EngineEvent =
  | { kind: "demo"; on: boolean }
  | { kind: "cycle:start"; petId: string; targetG: number; trigger: string }
  | { kind: "cycle:stopped"; reason: string; petId: string | null; dispensedG: number; targetG: number }
  | { kind: "cycle:complete"; record: FeedingRecord; short: boolean }
  | { kind: "detection:identified"; petId: string; confidence: number }
  | { kind: "detection:unknown" }
  | { kind: "device:offline" }
  | { kind: "device:online" }
  | { kind: "food:low"; grams: number }
  | { kind: "food:refilled" }
  | { kind: "sensor:error" };

export type Settings = {
  deviceName: string; timezone: string; unit: string;
  defaultPortion: number; maxDaily: number; confidenceThreshold: number;
  notifications: { lowFood: boolean; offline: boolean; feedingError: boolean; unknownPet: boolean };
};

export type Tone = "success" | "warning" | "critical" | "info" | "neutral";
export type ToastInput = { tone?: Tone; title: string; message?: string; duration?: number };
```

- [ ] **Step 5: Run the tests**

Run: `npm test -- config && npm run typecheck`
Expected: PASS, no type errors.

- [ ] **Step 6: Commit**

```bash
git add lib/config.ts lib/types.ts lib/__tests__/config.test.ts
git commit -m "feat: port CONFIG and domain types with literal env reads"
```

---

### Task 3: Utilities

**Files:**
- Modify: `lib/utils.ts`
- Test: `lib/__tests__/utils.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `clamp(v,a,b)`, `pad(n)`, `fmtTime(d)`, `fmtDate(d)`, `fmtShort(d)`, `timeAgo(ts)`, `fmtUptime(sec)`, `dayKey(d)`, `uid(prefix)`, `delay(ms)`, `rnd()`, `rint(a,b)`, `resetSeed()`.

`resetSeed()` is new and exists only so tests can restore the module-level PRNG state; nothing in the app calls it.

- [ ] **Step 1: Write the failing test**

```ts
// lib/__tests__/utils.test.ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clamp, dayKey, fmtDate, fmtShort, fmtTime, fmtUptime, resetSeed, rint, rnd, timeAgo, uid } from "@/lib/utils";

describe("formatters", () => {
  const at = new Date(2026, 7, 20, 9, 5).getTime(); // 20 Aug 2026, 09:05 local

  it("formats dates, times and short dates", () => {
    expect(fmtDate(at)).toBe("20 Aug 2026");
    expect(fmtTime(at)).toBe("09:05");
    expect(fmtShort(at)).toBe("20 Aug");
  });

  it("formats uptime across day, hour and minute scales", () => {
    expect(fmtUptime(183642)).toBe("2d 3h 0m");
    expect(fmtUptime(3725)).toBe("1h 2m 05s");
    expect(fmtUptime(65)).toBe("1m 05s");
  });

  it("keys days as ISO dates", () => {
    expect(dayKey(Date.UTC(2026, 7, 20, 12))).toBe("2026-08-20");
  });

  it("clamps to bounds", () => {
    expect(clamp(-5, 0, 10)).toBe(0);
    expect(clamp(50, 0, 10)).toBe(10);
    expect(clamp(5, 0, 10)).toBe(5);
  });
});

describe("timeAgo", () => {
  beforeEach(() => vi.useFakeTimers().setSystemTime(new Date(2026, 7, 20, 12, 0, 0)));
  afterEach(() => vi.useRealTimers());

  it("describes elapsed time in the largest sensible unit", () => {
    const now = Date.now();
    expect(timeAgo(0)).toBe("never");
    expect(timeAgo(now - 1000)).toBe("just now");
    expect(timeAgo(now - 30_000)).toBe("30 seconds ago");
    expect(timeAgo(now - 60_000)).toBe("1 minute ago");
    expect(timeAgo(now - 3 * 60_000)).toBe("3 minutes ago");
    expect(timeAgo(now - 2 * 3_600_000)).toBe("2 hours ago");
    expect(timeAgo(now - 3 * 86_400_000)).toBe("3 days ago");
  });
});

describe("seeded PRNG", () => {
  beforeEach(() => resetSeed());

  it("produces the same sequence after a reset", () => {
    const first = [rnd(), rnd(), rnd()];
    resetSeed();
    expect([rnd(), rnd(), rnd()]).toEqual(first);
  });

  it("keeps rint within bounds inclusive", () => {
    const values = Array.from({ length: 200 }, () => rint(3, 7));
    expect(Math.min(...values)).toBeGreaterThanOrEqual(3);
    expect(Math.max(...values)).toBeLessThanOrEqual(7);
  });
});

describe("uid", () => {
  it("prefixes and stays unique across calls", () => {
    const a = uid("PET");
    const b = uid("PET");
    expect(a.startsWith("PET_")).toBe(true);
    expect(a).not.toBe(b);
  });
});
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `npm test -- utils`
Expected: FAIL — most exports do not exist yet.

- [ ] **Step 3: Port the utilities**

Ported from `smart-pet-feeder-dashboard.jsx:68-104`, typed, with `resetSeed` added.

```ts
const SEED_START = 20260820;
let seed = SEED_START;

export const resetSeed = (): void => { seed = SEED_START; };
export const rnd = (): number => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };
export const rint = (a: number, b: number): number => Math.floor(a + rnd() * (b - a + 1));
export const clamp = (v: number, a: number, b: number): number => Math.min(b, Math.max(a, v));
export const uid = (p: string): string => `${p}_${Math.random().toString(36).slice(2, 9)}`;
export const delay = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

export const pad = (n: number): string => String(n).padStart(2, "0");

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export const fmtTime = (d: number | Date): string => {
  const x = new Date(d);
  return `${pad(x.getHours())}:${pad(x.getMinutes())}`;
};
export const fmtDate = (d: number | Date): string => {
  const x = new Date(d);
  return `${pad(x.getDate())} ${MONTHS[x.getMonth()]} ${x.getFullYear()}`;
};
export const fmtShort = (d: number | Date): string => {
  const x = new Date(d);
  return `${pad(x.getDate())} ${MONTHS[x.getMonth()]}`;
};

export const timeAgo = (ts: number): string => {
  if (!ts) return "never";
  const s = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  if (s < 3) return "just now";
  if (s < 60) return `${s} seconds ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} minute${m > 1 ? "s" : ""} ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} hour${h > 1 ? "s" : ""} ago`;
  const d = Math.floor(h / 24);
  return `${d} day${d > 1 ? "s" : ""} ago`;
};

export const fmtUptime = (sec: number): string => {
  const d = Math.floor(sec / 86400);
  const h = Math.floor((sec % 86400) / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  return d > 0 ? `${d}d ${h}h ${m}m` : h > 0 ? `${h}h ${m}m ${pad(s)}s` : `${m}m ${pad(s)}s`;
};

export const dayKey = (d: number | Date): string => new Date(d).toISOString().slice(0, 10);
```

Note the one deliberate fix: the original `timeAgo` pluralises days with `h > 24` (`smart-pet-feeder-dashboard.jsx:94`), so a 25-hour gap rendered "1 days ago". The port compares days, which is what the original meant. This is the only behavioural correction in the plan; anything else you notice goes in a follow-up, not this port.

- [ ] **Step 4: Run the tests**

Run: `npm test -- utils`
Expected: PASS (all cases).

- [ ] **Step 5: Commit**

```bash
git add lib/utils.ts lib/__tests__/utils.test.ts
git commit -m "feat: port utilities with tests and fix day pluralisation in timeAgo"
```

---

### Task 4: Seed data, service contract and mock adapter

**Files:**
- Create: `lib/seed-data.ts`, `services/contract.ts`, `services/adapters/mock.ts`
- Test: `services/__tests__/mock-adapter.test.ts`

**Interfaces:**
- Consumes: `Pet`, `NewPet`, `Schedule`, `NewSchedule`, `Alert`, `FeedingRecord` from `@/lib/types`; `uid`, `rnd`, `rint`, `dayKey`, `delay` from `@/lib/utils`.
- Produces: `FeederServices` interface; `createMockAdapter(): FeederServices`; `buildSeedPets()`, `buildSeedSchedules()`, `buildSeedFeedings()`, `buildSeedAlerts()`.

Every seed is a **function**, not a module constant. The originals (`smart-pet-feeder-dashboard.jsx:126-176`) call `Date.now()` and `new Date()` at import time, which produces different values on the server and the client and triggers hydration errors.

- [ ] **Step 1: Write the failing test**

```ts
// services/__tests__/mock-adapter.test.ts
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
});
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `npm test -- mock-adapter`
Expected: FAIL — `@/services/adapters/mock` does not exist.

- [ ] **Step 3: Write `lib/seed-data.ts`**

Port `smart-pet-feeder-dashboard.jsx:108-176` verbatim in content, wrapping each export in a factory and typing the arrays. `buildSeedPets()` and `buildSeedSchedules()` return the literal arrays from lines 108-123. `buildSeedFeedings()` is the body of `buildFeedingHistory()` (lines 126-164) returning `FeedingRecord[]`, with `status` typed as `FeedingRecord["status"]` so the conditional assignments narrow correctly. `buildSeedAlerts()` returns the five alerts from lines 168-174.

```ts
import type { Alert, FeedingRecord, Pet, Schedule } from "@/lib/types";
import { rint, rnd, uid } from "@/lib/utils";

export function buildSeedPets(): Pet[] { /* lines 108-112, typed */ }
export function buildSeedSchedules(): Schedule[] { /* lines 114-123, typed */ }

export function buildSeedFeedings(): FeedingRecord[] {
  const rows: FeedingRecord[] = [];
  const now = new Date();
  // ...body of buildFeedingHistory, lines 127-164...
  return rows.sort((a, b) => b.timestamp - a.timestamp);
}

export function buildSeedAlerts(): Alert[] {
  const now = Date.now();
  return [ /* lines 169-173, with Date.now() replaced by the local `now` */ ];
}
```

- [ ] **Step 4: Write `services/contract.ts`**

```ts
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
```

- [ ] **Step 5: Write `services/adapters/mock.ts`**

Port `smart-pet-feeder-dashboard.jsx:183-228`, declaring `createMockAdapter(): FeederServices` and building the store from the factories. `update` throws when the id is missing rather than returning `undefined`, because the contract promises a `Pet`:

```ts
async update(id: string, patch: Partial<Pet>): Promise<Pet> {
  await latency();
  store.pets = store.pets.map((p) => (p.id === id ? { ...p, ...patch } : p));
  const next = store.pets.find((p) => p.id === id);
  if (!next) throw new Error(`Pet ${id} not found`);
  return next;
}
```

- [ ] **Step 6: Run the tests**

Run: `npm test -- mock-adapter && npm run typecheck`
Expected: PASS (7 tests), no type errors.

- [ ] **Step 7: Commit**

```bash
git add lib/seed-data.ts services/contract.ts services/adapters/mock.ts services/__tests__/mock-adapter.test.ts
git commit -m "feat: port service contract, lazy seed factories and mock adapter"
```

---

### Task 5: Telemetry store

**Files:**
- Create: `services/telemetry.ts`
- Test: `services/__tests__/telemetry.test.ts`

**Interfaces:**
- Consumes: `Telemetry` from `@/lib/types`; `CONFIG` from `@/lib/config`.
- Produces: `initialTelemetry(now: number): Telemetry`; `class TelemetryStore` with `get()`, `set(patch)`, `subscribe(fn): () => void`.

`initialTelemetry` takes `now` as an argument — the original called `Date.now()` inside itself at module scope (`smart-pet-feeder-dashboard.jsx:264-289`), which is the hydration hazard from the Global Constraints.

- [ ] **Step 1: Write the failing test**

```ts
// services/__tests__/telemetry.test.ts
import { describe, expect, it, vi } from "vitest";
import { TelemetryStore, initialTelemetry } from "@/services/telemetry";

describe("initialTelemetry", () => {
  it("stamps every time field from the injected now", () => {
    const t = initialTelemetry(1_000);
    expect(t.device.lastHeartbeat).toBe(1_000);
    expect(t.camera.lastFrameAt).toBe(1_000);
    expect(t.detection.since).toBe(1_000);
    expect(t.device.online).toBe(true);
    expect(t.cycle.active).toBe(false);
    expect(t.hopper.capacity).toBe(1500);
  });
});

describe("TelemetryStore", () => {
  it("merges object patches shallowly", () => {
    const store = new TelemetryStore(initialTelemetry(0));
    store.set({ distanceCm: 12 });
    expect(store.get().distanceCm).toBe(12);
    expect(store.get().servo).toBe("READY");
  });

  it("accepts a function patch derived from current state", () => {
    const store = new TelemetryStore(initialTelemetry(0));
    store.set((s) => ({ distanceCm: s.distanceCm + 1 }));
    expect(store.get().distanceCm).toBe(65);
  });

  it("notifies subscribers and stops after unsubscribe", () => {
    const store = new TelemetryStore(initialTelemetry(0));
    const listener = vi.fn();
    const off = store.subscribe(listener);
    store.set({ distanceCm: 3 });
    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener.mock.calls[0][0].distanceCm).toBe(3);
    off();
    store.set({ distanceCm: 4 });
    expect(listener).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `npm test -- telemetry`
Expected: FAIL — module not found.

- [ ] **Step 3: Write `services/telemetry.ts`**

Port `smart-pet-feeder-dashboard.jsx:257-300`. `WORKFLOW_STEPS` moves here too, since `FeedingWorkflow` renders it.

```ts
import { CONFIG } from "@/lib/config";
import type { Telemetry } from "@/lib/types";

export const WORKFLOW_STEPS = [
  { key: "detected", label: "Pet detected", detail: "HC-SR04 proximity trigger" },
  { key: "identified", label: "Pet identified", detail: "CNN classification" },
  { key: "portion", label: "Portion retrieved", detail: "Profile lookup" },
  { key: "dispensing", label: "Food dispensing", detail: "SG90 servo open" },
  { key: "checking", label: "Weight checked", detail: "HX711 + load cell" },
  { key: "reached", label: "Target reached", detail: "Servo closed" },
] as const;

export const initialTelemetry = (now: number): Telemetry => ({
  device: {
    id: CONFIG.deviceId, online: true, ip: "192.168.0.114", ssid: "LubeloTech-2.4G",
    rssi: -58, firmware: "v1.4.2", mqtt: "connected",
    lastHeartbeat: now, uptimeS: 183642, freeHeapKb: 178,
  },
  hopper: { grams: 742, capacity: CONFIG.hopperCapacityG },
  bowl: { grams: 0, targetG: 0 },
  distanceCm: 64,
  servo: "READY",
  camera: { online: true, lastFrameAt: now, fps: 12 },
  detection: { state: "idle", petId: null, confidence: 0, since: now },
  cycle: { active: false, step: -1, petId: null, targetG: 0, trigger: null, startedAt: null, message: "Waiting for a pet" },
  demo: false,
  history: { weight: [], distance: [] },
});

type Listener = (state: Telemetry) => void;
type Patch = Partial<Telemetry> | ((state: Telemetry) => Partial<Telemetry>);

export class TelemetryStore {
  private state: Telemetry;
  private listeners = new Set<Listener>();

  constructor(initial: Telemetry) { this.state = initial; }

  get(): Telemetry { return this.state; }

  set(patch: Patch): void {
    const next = typeof patch === "function" ? patch(this.state) : patch;
    this.state = { ...this.state, ...next };
    this.listeners.forEach((l) => l(this.state));
  }

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => { this.listeners.delete(fn); };
  }
}
```

- [ ] **Step 4: Run the tests**

Run: `npm test -- telemetry`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add services/telemetry.ts services/__tests__/telemetry.test.ts
git commit -m "feat: port telemetry store with injectable clock"
```

---

### Task 6: Simulation engine

**Files:**
- Create: `services/simulation.ts`
- Test: `services/__tests__/simulation.test.ts`

**Interfaces:**
- Consumes: `TelemetryStore` from `@/services/telemetry`; `EngineEvent`, `Pet`, `FeedingRecord` from `@/lib/types`; `CONFIG`; `clamp`, `rnd`, `rint`, `uid` from `@/lib/utils`.
- Produces: `class SimulationEngine` with `start()`, `stop()`, `on(fn): () => void`, `setDemo(on)`, `setPets(pets)`, `startCycle(petId, targetG, trigger?): boolean`, `stopCycle(reason?)`, `scenario(name: ScenarioName)`; type `ScenarioName = "offline" | "online" | "low-food" | "refill" | "unknown-pet" | "sensor-error"`.

`setPets()` is new. The original reads `SEED_PETS` directly (`smart-pet-feeder-dashboard.jsx:406`) purely to put a pet's name in a status message; importing seed data into the engine would defeat the adapter swap in stage 2. The provider calls `setPets()` when data loads, which is always before a cycle can be started.

- [ ] **Step 1: Write the failing test**

```ts
// services/__tests__/simulation.test.ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SimulationEngine } from "@/services/simulation";
import { TelemetryStore, initialTelemetry } from "@/services/telemetry";
import type { EngineEvent } from "@/lib/types";

function harness() {
  const store = new TelemetryStore(initialTelemetry(Date.now()));
  const engine = new SimulationEngine(store);
  const events: EngineEvent[] = [];
  engine.on((e) => events.push(e));
  engine.start();
  return { store, engine, events };
}

describe("SimulationEngine", () => {
  beforeEach(() => vi.useFakeTimers().setSystemTime(new Date(2026, 7, 20, 12, 0, 0)));
  afterEach(() => vi.useRealTimers());

  it("enters the detected state when a cycle starts", () => {
    const { store, engine, events } = harness();
    expect(engine.startCycle("PET001", 150, "Manual")).toBe(true);
    const s = store.get();
    expect(s.cycle.active).toBe(true);
    expect(s.cycle.step).toBe(0);
    expect(s.detection.state).toBe("detected");
    expect(s.bowl.targetG).toBe(150);
    expect(events[0]).toEqual({ kind: "cycle:start", petId: "PET001", targetG: 150, trigger: "Manual" });
    engine.stop();
  });

  it("refuses to start a second cycle or to start while offline", () => {
    const { engine } = harness();
    engine.startCycle("PET001", 150);
    expect(engine.startCycle("PET002", 120)).toBe(false);
    engine.stopCycle();
    engine.scenario("offline");
    expect(engine.startCycle("PET002", 120)).toBe(false);
    engine.stop();
  });

  it("advances through identification and dispensing to completion", () => {
    const { store, engine, events } = harness();
    engine.startCycle("PET001", 150, "Manual");

    vi.advanceTimersByTime(2_000);
    expect(store.get().cycle.step).toBe(1);
    expect(store.get().detection.state).toBe("identifying");

    vi.advanceTimersByTime(2_000);
    expect(store.get().detection.state).toBe("identified");
    expect(store.get().detection.petId).toBe("PET001");

    vi.advanceTimersByTime(30_000);
    const complete = events.find((e) => e.kind === "cycle:complete");
    expect(complete).toBeDefined();
    if (complete?.kind !== "cycle:complete") throw new Error("unreachable");
    expect(complete.record.petId).toBe("PET001");
    expect(complete.record.targetG).toBe(150);
    expect(complete.record.actualG).toBeGreaterThan(140);
    expect(complete.record.trigger).toBe("Manual");
    expect(store.get().cycle.active).toBe(false);
    engine.stop();
  });

  it("draws dispensed food out of the hopper", () => {
    const { store, engine } = harness();
    const before = store.get().hopper.grams;
    engine.startCycle("PET003", 60, "Manual");
    vi.advanceTimersByTime(30_000);
    expect(store.get().hopper.grams).toBeLessThan(before);
    engine.stop();
  });

  it("stops a running cycle and reports the reason", () => {
    const { store, engine, events } = harness();
    engine.startCycle("PET001", 150);
    engine.stopCycle("Stopped from the dashboard");
    expect(store.get().cycle.active).toBe(false);
    expect(store.get().servo).toBe("READY");
    expect(events.some((e) => e.kind === "cycle:stopped")).toBe(true);
    engine.stop();
  });

  it("applies device and food scenarios", () => {
    const { store, engine, events } = harness();
    engine.scenario("offline");
    expect(store.get().device.online).toBe(false);
    expect(store.get().camera.online).toBe(false);
    engine.scenario("online");
    expect(store.get().device.online).toBe(true);
    engine.scenario("low-food");
    expect(store.get().hopper.grams).toBe(210);
    engine.scenario("refill");
    expect(store.get().hopper.grams).toBe(1500);
    expect(events.map((e) => e.kind)).toEqual([
      "device:offline", "device:online", "food:low", "food:refilled",
    ]);
    engine.stop();
  });

  it("records rolling sensor history capped at 40 points", () => {
    const { store, engine } = harness();
    vi.advanceTimersByTime(400 * 60);
    expect(store.get().history.weight).toHaveLength(40);
    expect(store.get().history.distance).toHaveLength(40);
    engine.stop();
  });
});
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `npm test -- simulation`
Expected: FAIL — module not found.

- [ ] **Step 3: Port the engine**

Port `smart-pet-feeder-dashboard.jsx:306-482` with these typed changes and nothing else:

- `constructor(private store: TelemetryStore)`; `private timer: ReturnType<typeof setInterval> | null = null`.
- `private pets: Pet[] = []` with `setPets(pets: Pet[]) { this.pets = pets; }`; line 406's `SEED_PETS.find(...)` becomes `this.pets.find(...)`.
- `on(fn: (e: EngineEvent) => void): () => void` returning an unsubscribe that deletes from the set.
- `scenario(name: ScenarioName)` — the `default` branch stays so an unknown name is a no-op.
- `stop()` guards `if (this.timer) clearInterval(this.timer)`.

- [ ] **Step 4: Run the tests**

Run: `npm test -- simulation`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add services/simulation.ts services/__tests__/simulation.test.ts
git commit -m "feat: port simulation engine with injected pet lookup"
```

---

### Task 7: Command bus

**Files:**
- Create: `services/commands.ts`
- Test: `services/__tests__/commands.test.ts`

**Interfaces:**
- Consumes: `TelemetryStore`, `SimulationEngine`, `delay`.
- Produces: `createCommandBus(telemetry, engine): CommandBus`; `type CommandType = "feeding.start" | "feeding.stop" | "portion.update" | "schedule.update" | "device.config"`; `CommandBus.send(type, payload?): Promise<{ accepted: true }>`.

A factory rather than the original's module singleton (`smart-pet-feeder-dashboard.jsx:487-508`), so the bus can be constructed per provider and tested against a scratch store.

- [ ] **Step 1: Write the failing test**

```ts
// services/__tests__/commands.test.ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createCommandBus } from "@/services/commands";
import { SimulationEngine } from "@/services/simulation";
import { TelemetryStore, initialTelemetry } from "@/services/telemetry";

function harness() {
  const store = new TelemetryStore(initialTelemetry(Date.now()));
  const engine = new SimulationEngine(store);
  return { store, engine, bus: createCommandBus(store, engine) };
}

describe("commandBus", () => {
  beforeEach(() => vi.useFakeTimers().setSystemTime(new Date(2026, 7, 20, 12, 0, 0)));
  afterEach(() => vi.useRealTimers());

  it("starts a feeding cycle", async () => {
    const { store, bus } = harness();
    const sent = bus.send("feeding.start", { petId: "PET001", portionG: 150, trigger: "Manual" });
    await vi.advanceTimersByTimeAsync(400);
    await expect(sent).resolves.toEqual({ accepted: true });
    expect(store.get().cycle.active).toBe(true);
  });

  it("rejects when the device is offline", async () => {
    const { engine, bus } = harness();
    engine.scenario("offline");
    const sent = bus.send("feeding.stop");
    await vi.advanceTimersByTimeAsync(400);
    await expect(sent).rejects.toThrow("Unable to reach the feeder");
  });

  it("rejects a second concurrent feeding", async () => {
    const { engine, bus } = harness();
    engine.startCycle("PET001", 150);
    const sent = bus.send("feeding.start", { petId: "PET002", portionG: 120 });
    await vi.advanceTimersByTimeAsync(400);
    await expect(sent).rejects.toThrow("already running");
  });

  it("accepts configuration commands without touching the engine", async () => {
    const { store, bus } = harness();
    const sent = bus.send("device.config", { action: "tare" });
    await vi.advanceTimersByTimeAsync(400);
    await expect(sent).resolves.toEqual({ accepted: true });
    expect(store.get().cycle.active).toBe(false);
  });
});
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `npm test -- commands`
Expected: FAIL — module not found.

- [ ] **Step 3: Write `services/commands.ts`**

Port lines 487-508. Keep the 320 ms simulated round-trip and the offline rejection message verbatim — the UI's error toasts quote it. The original returns `{ accepted: true, type, payload }` for the three config commands; the contract narrows that to `{ accepted: true }` since no caller reads the echo.

- [ ] **Step 4: Run the tests**

Run: `npm test -- commands && npm run typecheck`
Expected: PASS (4 tests), no type errors.

- [ ] **Step 5: Commit**

```bash
git add services/commands.ts services/__tests__/commands.test.ts
git commit -m "feat: port command bus as an injectable factory"
```

---

### Task 8: Analytics derivation and hooks

**Files:**
- Create: `lib/analytics.ts`, `hooks/useAnalytics.ts`, `hooks/useTelemetry.ts`, `hooks/useToast.tsx`, `components/ui/ToastNotification.tsx`, `components/ui/tone.ts`
- Test: `lib/__tests__/analytics.test.ts`

**Interfaces:**
- Consumes: `FeedingRecord`, `Pet`, `ToastInput`, `Tone`; `dayKey`, `fmtShort`, `fmtTime`, `uid`.
- Produces: `deriveAnalytics(feedings, pets): Analytics` where `Analytics = { daily, perPet, accuracy, meanErr, accuracyPct, successRate }`; `useAnalytics(feedings, pets)`; `useTelemetry(store)`; `ToastProvider`, `useToast()`; `PET_HEX`.

The pure derivation is extracted out of the original `useAnalytics` (`smart-pet-feeder-dashboard.jsx:1111-1145`) so it can be tested without a DOM; the hook becomes a one-line `useMemo` wrapper. This is the single sanctioned extraction named in the Global Constraints.

- [ ] **Step 1: Write the failing test**

```ts
// lib/__tests__/analytics.test.ts
import { describe, expect, it } from "vitest";
import { deriveAnalytics } from "@/lib/analytics";
import type { FeedingRecord, Pet } from "@/lib/types";

const pets: Pet[] = [
  { id: "PET001", name: "Max", species: "Dog", breed: "Lab", weightKg: 24, portionG: 150,
    mealsPerDay: 3, status: "Active", colour: "amber", enrolledAt: "2026-05-04" },
];

const row = (over: Partial<FeedingRecord>): FeedingRecord => ({
  id: "FD1", timestamp: new Date(2026, 7, 20, 8, 0).getTime(), petId: "PET001",
  targetG: 100, actualG: 100, status: "Completed", confidence: 96,
  trigger: "Scheduled", durationS: 8, ...over,
});

describe("deriveAnalytics", () => {
  it("totals grams and cycles per day", () => {
    const out = deriveAnalytics([row({}), row({ id: "FD2", actualG: 90 })], pets);
    expect(out.daily).toHaveLength(1);
    expect(out.daily[0].grams).toBe(190);
    expect(out.daily[0].cycles).toBe(2);
    expect(out.daily[0].label).toBe("20 Aug");
  });

  it("summarises per pet with a rounded average", () => {
    const out = deriveAnalytics([row({}), row({ id: "FD2", actualG: 80 })], pets);
    expect(out.perPet[0]).toMatchObject({ name: "Max", grams: 180, cycles: 2, avg: 90 });
  });

  it("computes deviation for the accuracy series", () => {
    const out = deriveAnalytics([row({ actualG: 90 })], pets);
    expect(out.accuracy[0]).toMatchObject({ target: 100, actual: 90, deviation: -10 });
  });

  it("derives mean error, accuracy and success rate from completed rows only", () => {
    const out = deriveAnalytics(
      [row({}), row({ id: "FD2", actualG: 90 }), row({ id: "FD3", status: "Under-dispensed", actualG: 40 })],
      pets,
    );
    expect(out.meanErr).toBe(5);
    expect(out.accuracyPct).toBeCloseTo(95, 5);
    expect(out.successRate).toBeCloseTo((2 / 3) * 100, 5);
  });

  it("returns zeroed metrics for an empty history", () => {
    const out = deriveAnalytics([], pets);
    expect(out.daily).toEqual([]);
    expect(out.meanErr).toBe(0);
    expect(out.accuracyPct).toBe(0);
    expect(out.successRate).toBe(0);
  });

  it("keeps only the last 14 days", () => {
    const rows = Array.from({ length: 20 }, (_, i) =>
      row({ id: `FD${i}`, timestamp: new Date(2026, 7, 1 + i, 8, 0).getTime() }));
    expect(deriveAnalytics(rows, pets).daily).toHaveLength(14);
  });
});
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `npm test -- analytics`
Expected: FAIL — module not found.

- [ ] **Step 3: Write `lib/analytics.ts`**

Body copied from lines 1112-1144, typed, with `PET_HEX` (line 1147) moved here since it colours the charts:

```ts
export const PET_HEX: Record<PetColour, string> = {
  amber: "#f59e0b", sky: "#0ea5e9", emerald: "#10b981", violet: "#8b5cf6", rose: "#f43f5e",
};

export function deriveAnalytics(feedings: FeedingRecord[], pets: Pet[]): Analytics { /* lines 1112-1144 */ }
```

- [ ] **Step 4: Write the three hooks**

```ts
// hooks/useAnalytics.ts
"use client";
import { useMemo } from "react";
import { deriveAnalytics } from "@/lib/analytics";
import type { FeedingRecord, Pet } from "@/lib/types";

export const useAnalytics = (feedings: FeedingRecord[], pets: Pet[]) =>
  useMemo(() => deriveAnalytics(feedings, pets), [feedings, pets]);
```

```ts
// hooks/useTelemetry.ts
"use client";
import { useEffect, useState } from "react";
import type { TelemetryStore } from "@/services/telemetry";

export function useTelemetry(store: TelemetryStore) {
  const [state, setState] = useState(() => store.get());
  useEffect(() => store.subscribe(setState), [store]);
  return state;
}
```

`ToastProvider` renders `<ToastNotification>`, so this task also creates `components/ui/tone.ts` (`TONE`, lines 545-551, typed `Record<Tone, { ring: string; bg: string; text: string; dot: string; Icon: LucideIcon }>`) and `components/ui/ToastNotification.tsx` (lines 655-668, props `{ tone?: Tone; title: string; message?: string; onClose: () => void }`). Task 9 creates the remaining primitives and must not recreate these two.

`hooks/useToast.tsx` ports `ToastProvider` and `useToast` from lines 520-540. Two typed changes: the context is `createContext<((t: ToastInput) => void) | null>(null)`, and `useToast()` throws if used outside the provider so callers get a non-null function instead of an optional one.

- [ ] **Step 5: Run the tests**

Run: `npm test && npm run typecheck`
Expected: all suites pass, no type errors.

- [ ] **Step 6: Commit**

```bash
git add lib/analytics.ts hooks lib/__tests__/analytics.test.ts
git commit -m "feat: extract testable analytics derivation and port hooks"
```

---

### Task 9: UI primitives

**Files:**
- Create: `components/ui/{Card,SectionHead,Label,Badge,Button,Field,Input,Select,ProgressBar,Modal,LoadingState,EmptyState,ErrorState}.tsx`
- Test: none — verified by `npm run typecheck`, per the spec's decision that ported UI is verified by comparison rather than assertion.

**Interfaces:**
- Consumes: `Tone` from `@/lib/types`; `clamp` from `@/lib/utils`; `lucide-react` icons.
- Produces: the 13 components below. `TONE` and `ToastNotification` already exist from Task 8 — import `TONE` from `@/components/ui/tone`, do not redeclare it.

Source: `smart-pet-feeder-dashboard.jsx:542-707`. One component per file.

- [ ] **Step 1: Create the six trivial primitives**

Each is a direct copy of its original body with a typed props declaration:

```ts
// Card.tsx      lines 553-559
type CardProps = React.HTMLAttributes<HTMLDivElement>;
// SectionHead.tsx  lines 561-571
type SectionHeadProps = { title: string; subtitle?: string; right?: React.ReactNode };
// Label.tsx     lines 573-575
type LabelProps = { children: React.ReactNode; className?: string };
// Badge.tsx     lines 577-585
type BadgeProps = { tone?: Tone; children: React.ReactNode; dot?: boolean; className?: string };
// Field.tsx     lines 605-615
type FieldProps = { label: string; hint?: string; children: React.ReactNode };
// ProgressBar.tsx  lines 620-627
type ProgressBarProps = { value: number; tone?: "emerald" | "amber" | "rose" | "slate" | "sky"; height?: number };
```

- [ ] **Step 2: Create `Button.tsx`, `Input.tsx` and `Select.tsx`**

`Button` (lines 587-603) spreads onto a native button and takes a lucide icon component:

```ts
import type { LucideIcon } from "lucide-react";

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "dark" | "ghost" | "subtle" | "danger";
  size?: "sm" | "md" | "lg";
  icon?: LucideIcon;
};
```

`Input` and `Select` (lines 617-618) take `React.InputHTMLAttributes<HTMLInputElement>` and `React.SelectHTMLAttributes<HTMLSelectElement>`. `inputCls` (line 616) lives in `Input.tsx` and is exported so `Select.tsx` reuses it — it must not be duplicated.

- [ ] **Step 3: Create `Modal.tsx`**

Lines 629-653. It has an escape-key `useEffect`, so it needs `"use client"`. Type the handler as `(e: KeyboardEvent) => void`.

```ts
type ModalProps = {
  open: boolean; title: string; description?: string; onClose: () => void;
  children?: React.ReactNode; footer?: React.ReactNode; width?: number;
};
```

- [ ] **Step 4: Create the three remaining state components**

```ts
// LoadingState.tsx       lines 670-683
type LoadingStateProps = { label?: string; rows?: number };
// EmptyState.tsx         lines 685-694
type EmptyStateProps = { icon?: LucideIcon; title: string; message?: string; action?: React.ReactNode };
// ErrorState.tsx         lines 696-707
type ErrorStateProps = { title?: string; message?: string; onRetry?: () => void };
```

- [ ] **Step 5: Convert the Tailwind v4 casualties**

Search the files you just created for `bg-opacity-` and rewrite each as slash syntax. In this task that is `Modal`'s backdrop (`bg-slate-900 bg-opacity-60` → `bg-slate-900/60`).

Run: `grep -rn "bg-opacity-" components/`
Expected: no matches.

- [ ] **Step 6: Verify**

Run: `npm run typecheck && npm run lint`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add components/ui
git commit -m "feat: port UI primitives to typed components"
```

---

### Task 10: Feature components — cards and readouts

**Files:**
- Create: `components/feeder/{PetAvatar,DeviceStatusPill,StatusCard,MiniStat,ReadoutRow,PetCard,AlertCard,ChartFrame}.tsx`, `components/feeder/pet-colour.ts`
- Test: none — verified by `npm run typecheck`.

**Interfaces:**
- Consumes: `Pet`, `Alert`, `Tone`; `timeAgo`, `fmtTime`, `fmtDate`; `Card`, `Badge`, `Button` from `components/ui`.
- Produces: the eight components below plus `PET_COLOUR`.

Source: `smart-pet-feeder-dashboard.jsx:708-1107` (the simpler half).

- [ ] **Step 1: Create `components/feeder/pet-colour.ts`**

`PET_COLOUR` (lines 711-717), typed `Record<PetColour, { bg: string; text: string; ring: string; ... }>` matching the original's shape exactly.

- [ ] **Step 2: Create the eight components**

```ts
// PetAvatar.tsx        lines 719-726
type PetAvatarProps = { pet: Pet; size?: number };
// DeviceStatusPill.tsx lines 728-741   ("use client" — calls timeAgo on render)
type DeviceStatusPillProps = { online: boolean; lastHeartbeat: number };
// StatusCard.tsx       lines 743-761
type StatusCardProps = {
  label: string; value: React.ReactNode; unit?: string; caption?: string;
  icon: LucideIcon; tone?: Tone; children?: React.ReactNode; onClick?: () => void;
};
// MiniStat.tsx         lines 1013-1022
type MiniStatProps = { label: string; value: React.ReactNode };
// ReadoutRow.tsx       lines 933-942
type ReadoutRowProps = { label: string; value: React.ReactNode };
// PetCard.tsx          lines 985-1011
type PetCardProps = { pet: Pet; todayG: number; onView: () => void; onEdit: () => void };
// AlertCard.tsx        lines 1064-1094
type AlertCardProps = { alert: Alert; onRead: (id: string) => void };
// ChartFrame.tsx       lines 1096-1105
type ChartFrameProps = { title: string; subtitle?: string; children: React.ReactNode; height?: number; right?: React.ReactNode };
```

- [ ] **Step 3: Verify**

Run: `npm run typecheck && npm run lint && grep -rn "bg-opacity-" components/ ; true`
Expected: no type errors, no lint errors, no `bg-opacity-` matches.

- [ ] **Step 4: Commit**

```bash
git add components/feeder
git commit -m "feat: port feeder card and readout components"
```

---

### Task 11: Feature components — live monitoring and tables

**Files:**
- Create: `components/feeder/{CameraPreview,PetDetectionPanel,WeightMonitor,FeedingWorkflow,SensorCard,FeedingHistoryTable,PetFormModal}.tsx`
- Test: none — verified by `npm run typecheck`.

**Interfaces:**
- Consumes: `Telemetry`, `Pet`, `FeedingRecord`, `NewPet`, `DetectionState`; `WORKFLOW_STEPS` from `@/services/telemetry`; `PET_HEX` from `@/lib/analytics`; recharts.
- Produces: the seven components below.

Sources: lines 763-853 (`CameraPreview`), 855-893 (`PetDetectionPanel`), 895-931 (`WeightMonitor`), 944-983 (`FeedingWorkflow`), 1024-1062 (`SensorCard`), 1588-1626 (`FeedingHistoryTable`), 1440-1486 (`PetFormModal`).

- [ ] **Step 1: Create `CameraPreview.tsx`**

The largest single component: a hand-drawn SVG scene, ~90 lines, no video element. Copy the SVG verbatim — every coordinate, gradient id and opacity. Only the signature is typed:

```ts
type CameraPreviewProps = {
  detection: Telemetry["detection"];
  pet: Pet | undefined;
  online: boolean;
  compact?: boolean;
};
```

The `<defs>` gradient ids (`spfWall`, `spfFloor`) are global in an SVG document. They stay as-is because only one instance renders at a time on any page; do not rename them.

- [ ] **Step 2: Create `PetDetectionPanel.tsx`, `WeightMonitor.tsx` and `FeedingWorkflow.tsx`**

```ts
type PetDetectionPanelProps = { detection: Telemetry["detection"]; pet: Pet | undefined };
type WeightMonitorProps = { bowl: Telemetry["bowl"]; servo: Telemetry["servo"]; cycle: Telemetry["cycle"] };
type FeedingWorkflowProps = { cycle: Telemetry["cycle"] };
```

`FeedingWorkflow` imports `WORKFLOW_STEPS` from `@/services/telemetry` rather than redeclaring it.

- [ ] **Step 3: Create `SensorCard.tsx`**

```ts
type SensorCardProps = {
  icon: LucideIcon; name: string; part: string; status: string; tone: Tone;
  primary: React.ReactNode; unit?: string;
  rows: { label: string; value: React.ReactNode }[];
  spark?: { t: number; v: number }[];
  sparkTone?: string;
};
```

- [ ] **Step 4: Create `FeedingHistoryTable.tsx`**

```ts
type FeedingHistoryTableProps = { rows: FeedingRecord[]; pets: Pet[]; compact?: boolean };
```

- [ ] **Step 5: Create `PetFormModal.tsx`**

Holds its own form state (`"use client"`). `onSubmit` receives the form values, not an event:

```ts
type PetFormModalProps = {
  open: boolean;
  pet: Pet | null;
  onClose: () => void;
  onSubmit: (values: NewPet) => void | Promise<void>;
};
```

- [ ] **Step 6: Verify**

Run: `npm run typecheck && npm run lint`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add components/feeder
git commit -m "feat: port live monitoring components and history table"
```

---

### Task 12: Dashboard shell, providers and navigation

**Files:**
- Create: `components/layout/{Sidebar,Header,DemoPanel}.tsx`, `lib/nav.ts`, `services/services-provider.tsx`, `app/(dashboard)/layout.tsx`
- Test: none — verified by `npm run build` and by the first page rendering in Task 13.

**Interfaces:**
- Consumes: everything from Tasks 2-11.
- Produces: `NAV` (`{ key, href, label, icon, title, subtitle }[]`); `useFeederData()` returning `FeederData`; `ToastProvider` mounted; `Sidebar`, `Header`, `DemoPanel`.

This task carries the plan's one structural change. `AppShell` (lines 2084-2321) held all state and switched on a `route` string. App Router replaces that switch with real routes, so the state moves up into the route-group layout and reaches pages through context.

- [ ] **Step 1: Create `lib/nav.ts`**

`NAV` from lines 1987-1997, with an `href` added per entry (`/`, `/live`, `/pets`, `/feeding`, `/history`, `/sensors`, `/device`, `/alerts`, `/settings`) and `icon` typed `LucideIcon`.

- [ ] **Step 2: Create `services/services-provider.tsx`**

Constructs the adapter, telemetry store, engine and command bus exactly once, in state initialisers so nothing is built during module evaluation:

```tsx
"use client";
const [instances] = useState(() => {
  const services = createMockAdapter();
  const telemetry = new TelemetryStore(initialTelemetry(Date.now()));
  const engine = new SimulationEngine(telemetry);
  return { services, telemetry, engine, commandBus: createCommandBus(telemetry, engine) };
});
```

Stage 2 replaces the `createMockAdapter()` line with a `CONFIG.dataSource` branch; nothing else in the file changes.

- [ ] **Step 3: Define the `FeederData` context value**

This is the contract every page in Tasks 13-16 consumes. The left column names the prop the original page component received, so the port is a lookup rather than a guess.

| Original prop | Context field | Type |
|---|---|---|
| `t` | `telemetry` | `Telemetry` |
| `pets` | `pets` | `Pet[]` |
| `feedings` | `feedings` | `FeedingRecord[]` |
| `schedules` | `schedules` | `Schedule[]` |
| `alerts` | `alerts` | `Alert[]` |
| `loading` | `loading` | `boolean` |
| — | `loadError` | `string \| null` |
| — | `reload` | `() => Promise<void>` |
| `onQuickFeed` | `requestFeed` | `(pet: Pet) => void` |
| `onDispense` | `dispense` | `(pet: Pet, portionG: number) => Promise<void>` |
| `onStop` | `stopCycle` | `() => Promise<void>` |
| `onCommand` | `sendCommand` | `(type: CommandType, payload: unknown, title: string, message: string) => Promise<void>` |
| `onCreate` | `createPet` | `(values: NewPet) => Promise<void>` |
| `onUpdate` | `updatePet` | `(id: string, values: Partial<Pet>) => Promise<void>` |
| `onDelete` | `deletePet` | `(id: string) => Promise<void>` |
| `onToggleSchedule` | `toggleSchedule` | `(s: Schedule) => Promise<void>` |
| `onRead` | `markAlertRead` | `(id: string) => void` |
| `onReadAll` | `markAllAlertsRead` | `() => void` |
| `settings`/`onSave` | `settings` / `saveSettings` | `Settings` / `(s: Settings) => void` |
| `onNavigate` | — | replaced by `next/link` |

Every function body comes from the identically-named handler in `AppShell` (lines 2183-2270). `Settings` is already declared in `lib/types.ts` by Task 2.

- [ ] **Step 4: Port the engine event effect**

Copy lines 2124-2181 into the provider unchanged — this stays the single place toasts, alerts and history rows are created. Type the callback parameter as `EngineEvent`; the `switch` on `evt.kind` then narrows each branch automatically. Also call `engine.setPets(pets)` whenever `pets` changes, which is what Task 6 introduced.

- [ ] **Step 5: Create `Sidebar.tsx` and `Header.tsx`**

`Sidebar` (lines 1999-2047) swaps its `onNavigate` callback for `next/link` and derives the active item from `usePathname()` instead of a `route` prop. `Header` is extracted from the inline `<header>` at lines 2258-2283; it looks the current `NAV` entry up by pathname for its title and subtitle.

```ts
type SidebarProps = { unread: number; onClose?: () => void };
type HeaderProps = { unread: number; demo: boolean; online: boolean; lastHeartbeat: number;
                     onOpenNav: () => void; onToggleDemo: () => void };
```

- [ ] **Step 6: Create `DemoPanel.tsx`**

Lines 2049-2078.

```ts
type DemoPanelProps = { demo: boolean; cycleActive: boolean; onToggle: () => void; onScenario: (key: string) => void };
```

- [ ] **Step 7: Assemble `app/(dashboard)/layout.tsx`**

Mounts `ServicesProvider` → `ToastProvider` → `FeederDataProvider`, renders the desktop sidebar, mobile drawer, header, demo panel, `{children}`, the footer line from lines 2298-2301, and the quick-feed confirmation `Modal` from lines 2306-2320 — the modal lives here because three different pages trigger it. Starts the engine on mount and stops it on unmount (line 2117).

- [ ] **Step 8: Convert the remaining opacity utilities**

Run: `grep -rn "bg-opacity-" app/ components/`
Expected: no matches. The header (`bg-white bg-opacity-90` → `bg-white/90`) and the mobile drawer scrim (`bg-slate-900 bg-opacity-40` → `bg-slate-900/40`) are in this task.

- [ ] **Step 9: Verify**

Run: `npm run typecheck && npm run lint`
Expected: no errors. `npm run build` still fails — there are no routes yet. That is expected until Task 13.

- [ ] **Step 10: Commit**

```bash
git add app components/layout lib/nav.ts services/services-provider.tsx
git commit -m "feat: port dashboard shell with route-group layout and data provider"
```

---

### Task 13: Dashboard and Live routes

**Files:**
- Create: `app/(dashboard)/page.tsx`, `app/(dashboard)/live/page.tsx`
- Test: none automated — acceptance checklist below.

**Interfaces:**
- Consumes: `useFeederData()`, `useAnalytics`, all feeder components.
- Produces: the first two working routes.

Sources: lines 1153-1297 (`DashboardPage`), 1299-1336 (`LivePage`). Each page component's body moves into its `page.tsx` and reads `useFeederData()` instead of props, using the mapping table in Task 12. `onNavigate("live")` becomes a `next/link` to `/live`.

- [ ] **Step 1: Stand up a reference render of the original**

Comparison needs both versions on screen. One-time setup, thrown away in Task 17:

```bash
npm create vite@latest /tmp/feeder-reference -- --template react
cd /tmp/feeder-reference && npm install && npm install lucide-react recharts@^3
npm install -D tailwindcss @tailwindcss/vite
cp "$REPO"/smart-pet-feeder-dashboard.jsx src/App.jsx   # $REPO = your repo root
```

Wire `@tailwindcss/vite` into `vite.config.js` and `@import "tailwindcss";` into `src/index.css`, then `npm run dev`. Leave it running on its own port for Tasks 13-16.

- [ ] **Step 2: Port the dashboard route**

Create `app/(dashboard)/page.tsx` with `"use client"` and the body from lines 1153-1297.

- [ ] **Step 3: Port the live route**

Create `app/(dashboard)/live/page.tsx` with the body from lines 1299-1336.

- [ ] **Step 4: Run both and compare**

Run: `npm run dev`
Check against the reference at each of these points — they are the ones that break silently:

- Status cards show hopper grams, bowl grams, today's total and unread alert count, all non-zero after the mock latency resolves.
- The hopper `ProgressBar` colour changes at the 20% threshold (use the demo panel's "Low food" scenario).
- The camera panel animates: idle → detected → identifying → identified during a cycle.
- Charts render with axes and no console warnings from recharts.
- `timeAgo` strings tick upward rather than freezing.
- Clicking a pet's quick-feed opens the confirmation modal from the layout.
- No hydration warning in the browser console. One appearing here means a `Date.now()` escaped into module scope.

- [ ] **Step 5: Verify the build**

Run: `npm run build`
Expected: succeeds, listing `/` and `/live`.

- [ ] **Step 6: Commit**

```bash
git add app/\(dashboard\)
git commit -m "feat: port dashboard and live monitoring routes"
```

---

### Task 14: Pets and Feeding routes

**Files:**
- Create: `app/(dashboard)/pets/page.tsx`, `app/(dashboard)/feeding/page.tsx`
- Test: none automated — acceptance checklist below.

Sources: lines 1338-1438 (`PetsPage`), 1488-1586 (`FeedingPage`). `PetsPage` keeps its local search/filter/modal state; only its data and callbacks come from context.

- [ ] **Step 1: Port the pets route**

Body from lines 1338-1438, using `createPet`, `updatePet`, `deletePet` and rendering `PetFormModal` from Task 11.

- [ ] **Step 2: Port the feeding route**

Body from lines 1488-1586, using `dispense`, `stopCycle` and `toggleSchedule`.

- [ ] **Step 3: Run and compare**

Run: `npm run dev`

- Search and the species filter narrow the pet grid.
- Adding a pet appends a card and raises a success toast; the new pet's id is `PET004`.
- Editing a portion updates the card and the toast quotes the new gram value.
- Deleting removes the card and raises a warning toast.
- Manual dispense drives a full cycle and the workflow stepper advances 0→5.
- Dispensing while a cycle runs shows the "already running" error toast.
- Toggling a schedule flips the row and its badge.
- Deleting the last pet leaves the `EmptyState`, not a blank page.

- [ ] **Step 4: Verify**

Run: `npm run build && npm run typecheck`
Expected: both succeed.

- [ ] **Step 5: Commit**

```bash
git add app/\(dashboard\)/pets app/\(dashboard\)/feeding
git commit -m "feat: port pets and feeding routes"
```

---

### Task 15: History and Sensors routes

**Files:**
- Create: `app/(dashboard)/history/page.tsx`, `app/(dashboard)/sensors/page.tsx`
- Test: none automated — acceptance checklist below.

Sources: lines 1628-1757 (`HistoryPage`), 1759-1809 (`SensorsPage`).

- [ ] **Step 1: Port the history route**

Body from lines 1628-1757. It calls `useAnalytics(feedings, pets)` from Task 8 — the derivation must not be reimplemented inline.

- [ ] **Step 2: Port the sensors route**

Body from lines 1759-1809, rendering one `SensorCard` per component with the sparkline series from `telemetry.history`.

- [ ] **Step 3: Run and compare**

Run: `npm run dev`

- The daily chart shows 14 bars; per-pet and accuracy charts render.
- Mean error, accuracy percentage and success rate match the reference for the same seeded data.
- Filtering by pet narrows both the table and the charts.
- Sensor sparklines advance every 400 ms and cap at 40 points.
- The HC-SR04 distance readout drops during a cycle and drifts when idle.
- Taking the device offline flips every sensor card to its offline tone.

- [ ] **Step 4: Verify**

Run: `npm run build`
Expected: succeeds.

- [ ] **Step 5: Commit**

```bash
git add app/\(dashboard\)/history app/\(dashboard\)/sensors
git commit -m "feat: port history and sensors routes"
```

---

### Task 16: Device, Alerts and Settings routes

**Files:**
- Create: `app/(dashboard)/device/page.tsx`, `app/(dashboard)/alerts/page.tsx`, `app/(dashboard)/settings/page.tsx`
- Test: none automated — acceptance checklist below.

Sources: lines 1811-1881 (`DevicePage`), 1883-1912 (`AlertsPage`), 1914-1982 (`SettingsPage`).

- [ ] **Step 1: Port the device route**

Body from lines 1811-1881, using `sendCommand` for the tare, ping and restart actions.

- [ ] **Step 2: Port the alerts route**

Body from lines 1883-1912, using `markAlertRead` and `markAllAlertsRead`.

- [ ] **Step 3: Port the settings route**

Body from lines 1914-1982, using `settings` and `saveSettings`.

- [ ] **Step 4: Run and compare**

Run: `npm run dev`

- Device page shows IP, SSID, RSSI, firmware, uptime and free heap; uptime increments.
- Tare, ping and restart each raise a success toast; all three fail with the offline error when the device is offline.
- Alerts show unread styling; marking one read clears its highlight and decrements the header badge.
- "Mark all read" empties the badge.
- Settings save raises a toast and the values persist while navigating between routes — this is what proves state lives in the layout rather than the page.

- [ ] **Step 5: Verify all nine routes**

Run: `npm run build`
Expected: succeeds and lists all nine routes: `/`, `/live`, `/pets`, `/feeding`, `/history`, `/sensors`, `/device`, `/alerts`, `/settings`.

- [ ] **Step 6: Commit**

```bash
git add app/\(dashboard\)
git commit -m "feat: port device, alerts and settings routes"
```

---

### Task 17: Retire the single file and update documentation

**Files:**
- Delete: `smart-pet-feeder-dashboard.jsx`
- Rename: `PORTING-TO-NEXTJS.md` → `docs/ARCHITECTURE.md`
- Modify: `CLAUDE.md`

**Interfaces:**
- Consumes: a complete, verified port.
- Produces: a repository whose documentation describes what exists.

- [ ] **Step 1: Final full-app comparison**

Walk all nine routes against the reference render one last time, exercising every demo scenario: cycle, offline, online, low food, refill, unknown pet, sensor error. Every toast and alert that fires in the reference must fire in the port.

- [ ] **Step 2: Confirm the whole suite is green**

Run: `npm test && npm run typecheck && npm run lint && npm run build`
Expected: all four succeed. Do not proceed past this step otherwise — the original file is about to be deleted and it is the only reference.

- [ ] **Step 3: Delete the original and the scratch reference**

```bash
git rm smart-pet-feeder-dashboard.jsx
rm -rf /tmp/feeder-reference /tmp/feeder-scaffold
```

- [ ] **Step 4: Convert the porting doc into an architecture doc**

```bash
git mv PORTING-TO-NEXTJS.md docs/ARCHITECTURE.md
```

Rewrite it in the present tense: the "Target structure" section becomes the actual structure; "Types to lift out first" becomes a pointer to `lib/types.ts` rather than a copy of it, so the two cannot drift. Keep the Firebase, MQTT, command-payload and ESP32-telemetry sections unchanged — they describe work that is still ahead, and the stage 2 spec depends on them.

- [ ] **Step 5: Rewrite `CLAUDE.md`**

The current file documents a single-file repository with no toolchain and is now wrong in nearly every particular. Replace it with: the real commands (`npm run dev`, `test`, `typecheck`, `lint`, `build`), the four-layer architecture in its new folder form, the route-group layout and why state lives in `FeederDataProvider`, the two porting hazards from the Global Constraints (literal env reads, no module-scope `Date.now()`) as standing rules, the `TONE`/`PET_COLOUR`/`PET_HEX` conventions, and a pointer to `docs/ARCHITECTURE.md` and the stage 2 spec.

- [ ] **Step 6: Final verification**

Run: `npm test && npm run build`
Expected: both succeed with the original file gone.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "docs: retire single-file dashboard and document the ported structure"
```

---

## Definition of Done

- `npm test`, `npm run typecheck`, `npm run lint` and `npm run build` all pass.
- All nine routes render and behave as the original did, verified page by page against a live reference render.
- No hydration warnings in the browser console on any route.
- `grep -rn "bg-opacity-" app components` returns nothing.
- `smart-pet-feeder-dashboard.jsx` is deleted; `CLAUDE.md` and `docs/ARCHITECTURE.md` describe the ported project.
- Stage 2 (`docs/superpowers/specs/2026-08-20-feeder-platform-design.md` §8) can begin by branching `createMockAdapter()` in `services/services-provider.tsx` and nothing else.
