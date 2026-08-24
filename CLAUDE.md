# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this repository is

A Next.js 15 (App Router) + TypeScript frontend for an IoT smart pet feeder (ESP32 · OV2640
camera · HC-SR04 ultrasonic · HX711 + load cell · SG90 servo · Wi-Fi/MQTT). Data comes from an
in-memory mock adapter and device telemetry from an in-browser simulator, so the app runs and
demos with no backend and no hardware attached.

## Commands

```bash
npm run dev         # dev server, http://localhost:3000
npm test             # vitest run — unit tests for lib/ and services/
npm run typecheck    # tsc --noEmit
npm run lint         # eslint
npm run build        # next build — also type-checks and lints
```

Run all four before calling anything done; `npm run build` is the closest thing to an
end-to-end check since it renders every route.

## Architecture

Four layers, strictly one-directional — config/types/utils → services → components → routes:

1. **`lib/`** — `config.ts` (env-driven `CONFIG`), `types.ts` (every shared type), `utils.ts`,
   `analytics.ts` (`deriveAnalytics`), `seed-data.ts`, `nav.ts` (`NAV`, the route table).
2. **`services/`** — `contract.ts` defines `FeederServices`; `adapters/mock.ts` and
   `adapters/firebase.ts` both implement it, and `services-provider.tsx` picks one on
   `CONFIG.dataSource`. `telemetry.ts` (`TelemetryStore`, pub/sub),
   `simulation.ts` (`SimulationEngine`, the ESP32 stand-in), `commands.ts` (`commandBus`, the
   only outbound path to the device). `services-provider.tsx` builds all four exactly once, in
   a `useState` initialiser, so nothing is constructed at module scope.
3. **`components/`** — `ui/` primitives (`Card`, `Button`, `Modal`, …), `feeder/` domain
   components, `layout/` (`DashboardShell`, `Sidebar`, `Header`, `DemoPanel`).
4. **`app/(dashboard)/**/page.tsx`** — the nine routes, one per page.

**No component talks to a transport.** Components read `useFeederData()` (app-level state:
pets, feedings, schedules, alerts, settings, telemetry, and the mutators) or
`useTelemetry(store)` (a raw telemetry subscription) and act through `commandBus`, indirectly,
via the mutators `useFeederData()` exposes. Never call `commandBus.send` or a `services.*`
method directly from a page component.

### Why state lives in `FeederDataProvider`, not in pages

`app/(dashboard)/layout.tsx` wraps every route in
`ServicesProvider > ToastProvider > FeederDataProvider > DashboardShell`. `FeederDataProvider`
(`hooks/useFeederData.tsx`) owns pets/feedings/schedules/alerts/telemetry/settings and every
mutator, and its single `engine.on(...)` effect is the **one place** that turns simulator
events (`cycle:start`, `cycle:complete`, `cycle:stopped`, `detection:unknown`,
`device:offline`/`device:online`, `food:low`, `food:refilled`, `sensor:error`) into toasts,
feeding-history rows and alerts. Pages call a mutator (e.g. `dispense`, `toggleSchedule`) and
let the resulting engine event come back around to raise the toast/alert — they never raise
one directly. This keeps that reaction logic in one place instead of duplicated per route.

## Standing constraints (earned during the port — do not relax without a reason)

- **Read `process.env.NEXT_PUBLIC_*` literally at the read site**, e.g.
  `process.env.NEXT_PUBLIC_DATA_SOURCE`. Next.js inlines env vars via static text replacement
  at build time; it does not follow a destructured alias like
  `const { NEXT_PUBLIC_X } = process.env`, so the value would come back `undefined` at runtime.
  See `lib/config.ts` for the pattern.
- **No `Date.now()`, `new Date()` or `Math.random()` at module scope.** A value computed at
  import time is captured once at server-render time and baked into the initial HTML;
  the client then computes a different value on hydration and React throws a hydration
  mismatch. Compute these inside functions/effects/render, not in top-level `const`.
- **Relative time is hydration-safe if seeded from a client timestamp; absolute time
  rendered during render is not.** `timeAgo()` etc. are fine because they're called from
  render with props, not from a module-scope clock. `CameraPreview` is the one exception that
  renders `new Date().toLocaleTimeString()` directly during render (it's an on-screen "camera
  timestamp" overlay) — that's the only place `suppressHydrationWarning` is used, and it should
  stay that way; don't add it elsewhere as a shortcut around a real mismatch.
- **Tailwind v4 has no `bg-opacity-*`.** Express background opacity with slash syntax
  (`bg-slate-900/70`). Plain `opacity-*` (whole-element opacity) is unaffected and still valid.
- **No arbitrary-value Tailwind classes** (`w-[123px]`, `text-[#f00]`). Use inline `style` for
  anything Tailwind's scale can't express (aspect ratio, SVG transitions, dynamic widths) —
  see `CameraPreview` for the pattern.

## Conventions

- **`TONE`** (`components/ui/tone.ts`) — the success/warning/critical/info/neutral map every
  status surface (badges, alerts, toasts) is built from. Add a new semantic colour there, not
  ad hoc in a component.
- **`PET_COLOUR`** (`components/feeder/pet-colour.ts`) — Tailwind classes per pet colour, for
  badges/avatars. **`PET_HEX`** (`lib/analytics.ts`) — the same palette as hex, for recharts
  `stroke`/`fill` props, which can't take Tailwind classes.
- **`deriveAnalytics`** (`lib/analytics.ts`) — every chart derivation (daily totals, per-pet
  totals, portion accuracy, mean error, success rate) lives here, not in page components.
  `hooks/useAnalytics.ts` is a thin `useMemo` wrapper around it.

## Where to look next

- `docs/ARCHITECTURE.md` — the full folder-by-folder architecture, the data/telemetry/command
  contracts, and the plan for swapping the mock adapter for Firebase and the simulator for real
  MQTT/RTDB telemetry.
- `docs/superpowers/specs/2026-08-20-feeder-platform-design.md` — the stage 2 design (Firestore
  backend, auth, household ownership). It branches off `createMockAdapter()` in
  `services/services-provider.tsx` and nothing else in this codebase.
- `smart-pet-feeder-dashboard.jsx` — the original single-file dashboard this app was ported
  from. It's still in the repo as the pre-port visual reference until a human does a
  side-by-side sign-off of all nine routes against it; don't delete or edit it.

## Stage 2: auth, households and Firestore

`CONFIG.dataSource` selects the adapter — `mock` (default) or `firebase`. **With no
`.env.local` at all the whole dashboard still runs on mock data with no sign-in**, and that
must stay true: `AuthProvider` yields a fixed fake session in mock mode before it ever
touches `getFirebase()`.

- **Data is household-scoped.** Everything lives under `households/{hid}/` — `pets`,
  `feedingHistory`, `feedingSchedules`, `alerts`, `settings/device`, `members/{uid}` — and
  `memberUids` on the household document is the security boundary.
- **Settings are two documents, one type.** `settings/device` holds what describes the
  feeder (shared by the household); `members/{uid}` holds the notification toggles
  (personal). The adapters compose them into the single `Settings` the UI sees — no
  component knows about the split.
- **The subcollection rule names its collections explicitly.** Rule matches are OR'd, so a
  bare `match /{collection}/{docId}` granting write to any member could not later be
  narrowed for `members/{uid}`. Adding a collection means adding it to that list.
- **Muting a notification silences the toast, never the alert.** `shouldToast`
  (`lib/notifications.ts`) gates the interruption; `raiseAlert` always runs. Losing the
  record of a failed cycle because someone flipped a toggle would be the dangerous choice.
- **Security is `firestore.rules`, not the client.** The route gate in
  `app/(dashboard)/layout.tsx` is UX only; it stops someone seeing a broken screen, it does
  not protect data. There is deliberately no Next middleware — with no server session
  cookie it would be theatre. Rules are covered by 22 emulator tests; change them and run
  `npm run test:rules`.
- **Invites are rules-only.** There is no privileged server. A user holding an invite that
  names their email may add exactly their own uid to a household and change nothing else.
  `acceptInviteFor` must use `arrayUnion` — the rule compares against
  `resource.data.memberUids.concat([uid])`.
- **`Timestamp` exists in exactly one module**, `lib/firebase/mapping.ts`. Everything above
  it speaks epoch milliseconds, so swapping adapters never changes a domain type. Firestore
  rejects `undefined`, so optional fields are omitted rather than written.
- **Both adapters must stay interchangeable.** `firestore/__tests__/contract.test.ts` runs
  one suite twice, once per adapter. Fix drift in the adapter, never by making a test lie.
- **Errors are `FeederError`** (`lib/errors.ts`). No component should ever see a raw
  `FirebaseError`; `toFeederError` maps codes to sentences a pet owner can act on.
- **`ServicesProvider` takes `householdId` as a prop** and is remounted with
  `key={householdId}`. Do not mutate the instances when the id arrives — `useTelemetry`
  reads its store on mount only and would be left pinned to a stale one.
