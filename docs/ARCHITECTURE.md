# Smart Pet Feeder Dashboard — architecture

The dashboard is a Next.js 15 (App Router) + TypeScript app. It started life as
`smart-pet-feeder-dashboard.jsx`, a single 2,300-line file whose internal banner
sections (`1. CONFIG` … `10. APP SHELL`) became the folder boundaries below —
the port was mechanical, not a redesign. That original file is still in the repo;
see "The pre-port reference" at the end of this document.

## Actual structure

```
app/
  layout.tsx                        <html> shell, global metadata, imports globals.css
  (dashboard)/layout.tsx            ServicesProvider > ToastProvider > FeederDataProvider > DashboardShell
  (dashboard)/page.tsx              DashboardPage
  (dashboard)/live/page.tsx         LivePage
  (dashboard)/pets/page.tsx         PetsPage
  (dashboard)/feeding/page.tsx      FeedingPage
  (dashboard)/history/page.tsx      HistoryPage
  (dashboard)/sensors/page.tsx      SensorsPage
  (dashboard)/device/page.tsx       DevicePage
  (dashboard)/alerts/page.tsx       AlertsPage
  (dashboard)/settings/page.tsx     SettingsPage
components/
  ui/            Card, Button, Badge, Input, Select, Field, Label, Modal, ProgressBar,
                 ToastNotification, LoadingState, EmptyState, ErrorState, SectionHead, tone.ts (TONE)
  feeder/        StatusCard, PetCard, PetAvatar, PetFormModal, SensorCard, WeightMonitor,
                 CameraPreview, FeedingWorkflow, FeedingHistoryTable, AlertCard,
                 DeviceStatusPill, PetDetectionPanel, ChartFrame, ReadoutRow, MiniStat,
                 pet-colour.ts (PET_COLOUR)
  layout/        DashboardShell, Sidebar, Header, DemoPanel
hooks/
  useFeederData.tsx   FeederDataProvider + useFeederData() — the app-data context (see below)
  useTelemetry.ts     subscribes a component to a TelemetryStore
  useToast.tsx        ToastProvider + useToast()
  useAnalytics.ts     thin useMemo wrapper around lib/analytics.ts
lib/
  config.ts      CONFIG — see lib/types.ts note below
  types.ts       every shared type: Pet, FeedingRecord, Schedule, Alert, Telemetry,
                 DeviceStatus, EngineEvent, Settings, Tone, ToastInput, …
  utils.ts       fmtDate, fmtTime, fmtShort, timeAgo, fmtUptime, clamp, uid, delay,
                 the seeded rnd()/rint() generator
  analytics.ts   deriveAnalytics() — every chart derivation, plus PET_HEX
  seed-data.ts   deterministic seed rows for the mock adapter
  nav.ts         NAV — the sidebar/header route table
services/
  contract.ts             FeederServices — the adapter interface (pets/feedings/schedules/alerts)
  adapters/mock.ts         createMockAdapter() — in-memory, seeded, latency-simulated
  services-provider.tsx    ServicesProvider — builds services/telemetry/engine/commandBus once
  telemetry.ts             TelemetryStore (pub/sub) + initialTelemetry() + WORKFLOW_STEPS
  simulation.ts            SimulationEngine — the in-browser stand-in for the ESP32 stream
  commands.ts              createCommandBus() — the only outbound path to the device
```

Two things the original single-file plan did not anticipate, because they only became
necessary once the app had real routes and a router:

- **`hooks/useFeederData.tsx`** — `AppShell`'s state and its single cross-cutting
  `engine.on(...)` effect (§10 of the original file) had nowhere to live once each page
  became its own route component instead of a `switch` case. It is now a React context:
  `FeederDataProvider` owns pets/feedings/schedules/alerts/telemetry/settings and every
  mutator (`dispense`, `createPet`, `toggleSchedule`, …), and every page reads it through
  `useFeederData()`.
- **`components/layout/DashboardShell.tsx`** and the **`app/(dashboard)/` route group** —
  the sidebar, header, mobile nav drawer, demo panel and quick-feed confirmation modal that
  used to be the fixed chrome around `AppShell`'s `switch` are now the shared layout for the
  route group, composed once in `app/(dashboard)/layout.tsx` and reused by all nine routes.

## Types

Type definitions live in one place, `lib/types.ts` — there is no separate copy in this
document to keep in sync. Read that file directly for `Pet`, `FeedingRecord`, `Schedule`,
`Alert`, `Telemetry`, `DeviceStatus`, `EngineEvent`, `Settings`, `Tone`, and the rest.

## Four layers, still strictly one-directional

1. **CONFIG** (`lib/config.ts`) — everything environment-driven via `NEXT_PUBLIC_*`.
   Credentials come from `.env.local`; never inline them.
2. **DATA LAYER** (`services/contract.ts`, `services/adapters/mock.ts`) — today
   `createMockAdapter()`; stage 2 branches this file on `CONFIG.dataSource` for a Firebase
   adapter. The adapter method names are the contract — `list / get / create / update /
   remove / append / markRead / markAllRead`, all Promise-returning with simulated latency,
   so the UI already handles async and loading states. Swapping adapters must require zero
   component changes.
3. **TELEMETRY LAYER** (`services/telemetry.ts`, `services/simulation.ts`, `services/commands.ts`):
   - `TelemetryStore` is a tiny pub/sub store holding one object: `device`, `hopper`, `bowl`,
     `distanceCm`, `servo`, `camera`, `detection`, `cycle`, `demo`, `history`.
   - `SimulationEngine` stands in for the real ESP32 stream. It ticks every 400 ms and runs
     the feeding-cycle state machine (`cycle.step` 0→5: detected → identified → portion →
     dispensing → checking → reached), writing only into `TelemetryStore` and emitting events
     via `engine.on`. Replacing it with an MQTT/RTDB subscription must leave the UI untouched;
     keep it in the repo behind Demo Mode so the dashboard can be shown without hardware.
   - `commandBus.send(type, payload)` is the only outbound path. Types in use: `feeding.start`,
     `feeding.stop`, `portion.update`, `schedule.update`, `device.config`. It rejects when the
     device is offline — callers are expected to catch and toast.
   - `services/services-provider.tsx` constructs all three (services, telemetry, engine,
     commandBus) exactly once, inside a `useState` initialiser, so nothing is built at module
     scope and every instance keeps a stable identity for the life of the tree.
4. **UI LAYER** (`components/`, `app/(dashboard)/**/page.tsx`) — no component touches a
   transport. Components read state through `useFeederData()` / `useTelemetry(store)` and
   act through `commandBus` (indirectly, via the mutators `useFeederData()` exposes).

### Where side effects live

`FeederDataProvider` (`hooks/useFeederData.tsx`) owns *all* cross-cutting reaction to device
events — the direct successor to `AppShell`'s effect in the original file. Its single
`engine.on(...)` effect is the one place that turns engine events (`cycle:start`,
`cycle:complete`, `cycle:stopped`, `detection:unknown`, `device:offline` / `device:online`,
`food:low`, `food:refilled`, `sensor:error`) into toasts, feeding-history rows and alerts.
Pages never raise alerts or append history themselves — they call the mutators
`useFeederData()` exposes and let the event come back around. Keep it that way.

### Routing

The App Router replaces the original `AppShell` `switch`. `lib/nav.ts` (`NAV`) is the direct
successor of the old key/label/icon/title/subtitle array, now carrying an `href` instead of a
`key` a `switch` matched on; `components/layout/Sidebar.tsx` and `Header.tsx` render it, and
`app/(dashboard)/layout.tsx` supplies the shared chrome and providers to every route. Adding a
page means one `NAV` entry plus one `app/(dashboard)/<route>/page.tsx`.

### Conventions

- **Styling:** Tailwind v4 utility classes only, no arbitrary-value syntax (`className="w-[123px]"`).
  Tailwind v4 has no `bg-opacity-*` utility — opacity on a background colour is expressed with
  slash syntax (`bg-slate-900/70`); plain `opacity-*` (for whole-element opacity) is still valid
  and used where that's what's meant. Inline `style` is used only for things Tailwind can't
  express (aspect ratio, SVG transitions, dynamic widths).
- **Semantic colour:** `components/ui/tone.ts` (`TONE`) drives every success/warning/critical/
  info/neutral surface. Pet colours go through `components/feeder/pet-colour.ts` (`PET_COLOUR`,
  Tailwind classes) and `lib/analytics.ts` (`PET_HEX`, hex for recharts props).
- **Primitives:** `Card`, `Button`, `Badge`, `Input`, `Select`, `Modal`, `ProgressBar`, `Field`,
  `LoadingState`, `EmptyState`, `ErrorState` (`components/ui/`). Compose these instead of
  hand-rolling markup.
- **Determinism:** `lib/utils.ts` has a seeded LCG (`rnd`, `rint`) so the mock history and
  confidence values are reproducible across reloads. Use `rnd()` for anything that should stay
  stable; `Math.random()` is reserved for genuine jitter and `uid()`. Nothing that calls
  `Date.now()`, `new Date()` or `Math.random()` runs at module scope — those calls happen
  inside functions/effects so server and client renders start from the same state.
- **Camera:** `CameraPreview` is a hand-drawn SVG scene with an animated detection box — there
  is no video element. It reacts to `detection.state` (`idle | detected | identifying |
  identified | unknown`). It's the one component with a genuine hydration hazard (it renders
  a wall-clock timestamp during render) and is the only place `suppressHydrationWarning` is used.
- **Analytics:** `lib/analytics.ts` (`deriveAnalytics`) derives every chart series (daily
  totals, per-pet, portion accuracy, mean error, success rate) from `feedings` + `pets`. Add
  derivations there, not inside page components; `hooks/useAnalytics.ts` just memoises it.

## Hardware-facing contracts

The sections below describe work that is still ahead — the Firebase adapter, the MQTT/RTDB
telemetry transport, and the ESP32 firmware side — and are unchanged from the original porting
plan. The stage 2 spec (`docs/superpowers/specs/2026-08-20-feeder-platform-design.md`) depends
on them staying accurate, so update this section in the same change whenever a payload or
command changes.

## Swapping mock data for Firebase

1. `npm i firebase` and put the keys in `.env.local` (never in the repo):
   `NEXT_PUBLIC_FIREBASE_API_KEY`, `..._AUTH_DOMAIN`, `..._DATABASE_URL`, `..._PROJECT_ID`.
2. Implement `createFirebaseAdapter()` with the same method names the mock adapter
   uses — `list / get / create / update / remove / append / markRead`.
3. Set `NEXT_PUBLIC_DATA_SOURCE=firebase`. No component changes.

Suggested collections: `pets`, `feedingHistory`, `feedingSchedules`, `alerts`,
`sensorReadings`, and a Realtime Database node `devices/{deviceId}/telemetry` for the
live stream (RTDB is a better fit than Firestore for 1–2 Hz sensor pushes).

## Swapping the simulator for real telemetry

`SimulationEngine` only writes into `TelemetryStore`. Replace it with either:

```ts
// Firebase RTDB
onValue(ref(rtdb, `devices/${CONFIG.deviceId}/telemetry`), snap => telemetry.set(snap.val()));

// or MQTT over websockets
client.subscribe(`petfeeder/${CONFIG.deviceId}/telemetry`);
client.on("message", (_t, payload) => telemetry.set(JSON.parse(payload.toString())));
```

Outgoing side: `commandBus.send()` publishes to `petfeeder/{deviceId}/command` (or writes
a document to `commands/`). The ESP32 subscribes and acts. Command payloads already in use:

| Command | Payload | ESP32 behaviour |
|---|---|---|
| `feeding.start` | `{ petId, portionG, trigger }` | open servo, close when HX711 hits target |
| `feeding.stop` | `{}` | close servo immediately |
| `portion.update` | `{ petId, portionG }` | update stored profile |
| `schedule.update` | `{ id, time, portionG, enabled }` | update device RTC schedule |
| `device.config` | `{ action: "tare" \| "ping" \| "restart", ... }` | maintenance actions |

Keep `SimulationEngine` in the repo behind the Demo Mode toggle — it is what lets the
dashboard be demonstrated when the hardware is not on the table.

## Suggested telemetry payload from the ESP32

```json
{
  "deviceId": "ESP32-PETFEEDER-001",
  "ts": 1755676800,
  "distanceCm": 18,
  "bowlG": 125.4,
  "hopperG": 742.0,
  "servo": "DISPENSING",
  "detection": { "state": "identified", "petId": "PET001", "confidence": 96.8 },
  "wifi": { "rssi": -58, "ip": "192.168.0.114" },
  "uptimeS": 183642
}
```

Publish at ~1 Hz while idle and ~5 Hz during a dispensing cycle; the dashboard already
handles both rates without extra work.

## The pre-port reference

`smart-pet-feeder-dashboard.jsx` remains in the repository root. It is the pre-port
reference build — the source every ported route was checked against — and it stays until
a human has done a side-by-side visual sign-off of all nine routes against it. No agent in
this port had the ability to render either build and compare them visually, so that
sign-off has not happened yet. Once it has, delete the file; do not delete it before then.
