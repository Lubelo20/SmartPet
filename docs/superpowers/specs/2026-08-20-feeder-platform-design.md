# Smart Pet Feeder — platform design (frontend port + Firebase backend)

Date: 2026-08-20
Status: approved design, not yet implemented

## 1. Context

The repository today holds two files: `smart-pet-feeder-dashboard.jsx`, a ~2,300-line
single-file React dashboard for an ESP32-based pet feeder, and `PORTING-TO-NEXTJS.md`,
which maps that file onto a Next.js folder structure. There is no build, no dependency
manifest and no tests. All data comes from `createMockAdapter()` and all device telemetry
from an in-browser `SimulationEngine`.

This design covers turning that into a real application with a real backend.

### In scope

- Porting the single file to Next.js 15 (App Router) + TypeScript.
- A live Firestore data layer replacing the mock adapter.
- Firebase Auth with household-scoped ownership.
- Security rules, indexes, a seed script and emulator-backed tests.

### Out of scope (each gets its own spec later)

- Live telemetry transport (MQTT / Firebase RTDB) replacing `SimulationEngine`.
- ESP32 firmware and the on-device classifier.
- Member roles and permissions beyond membership.
- Hosting and deployment configuration.

## 2. Decisions

| Decision | Choice | Why |
|---|---|---|
| Round scope | Frontend port + real backend | Telemetry and firmware are independently specifiable. |
| Ownership | Household with members | Supports a second person in the house without a role system. |
| Sign-in | Email/password + Google | Password account is demo-proof; Google is one tap for real use. |
| Data access | Client SDK, rules are the boundary | Keeps the adapter swap a one-line change; no API surface to build. |
| Firebase project | Does not exist; user will create it | Development and verification run against the emulators. |
| Testing | Adapter contract tests + rules tests | Targets the two failure modes that are expensive and invisible. |
| Sequencing | Port first, backend second (approach A) | The porting doc already decided the boundaries, so the port is mechanical. |
| Database | Firestore for all in-scope collections | RTDB is reserved for the 1–5 Hz telemetry stream in a later round. |
| Mock adapter | Retained, selected by `NEXT_PUBLIC_DATA_SOURCE` | The dashboard must still demo with no backend at all. |

## 3. Project structure

One Next.js 15 App Router project at the repository root. TypeScript `strict`,
Tailwind v4, Vitest.

```
app/
  layout.tsx                     root shell
  (auth)/sign-in/page.tsx        email/password + Google
  (auth)/join/page.tsx           invite acceptance
  (dashboard)/layout.tsx         sidebar + header + ToastProvider + auth gate
  (dashboard)/page.tsx           DashboardPage
  (dashboard)/{live,pets,feeding,history,sensors,device,alerts,settings}/page.tsx
components/
  ui/        Card, Button, Badge, Input, Select, Modal, ProgressBar, Field,
             ToastNotification, LoadingState, EmptyState, ErrorState
  feeder/    StatusCard, PetCard, SensorCard, WeightMonitor, CameraPreview,
             FeedingWorkflow, FeedingHistoryTable, AlertCard, DeviceStatusPill,
             PetDetectionPanel, ChartFrame, PetAvatar
  layout/    Sidebar, Header, DemoPanel
lib/
  config.ts  utils.ts  errors.ts
  types.ts                Pet, FeedingRecord, Schedule, Alert, Telemetry, DeviceStatus,
                          plus the NewPet / NewSchedule input variants used on create()
  firebase/  client.ts  auth-provider.tsx  household.ts
services/
  contract.ts             FeederServices interface
  adapters/mock.ts        createMockAdapter()
  adapters/firebase.ts    createFirebaseAdapter()
  services-provider.tsx   binds an adapter to the current household
  telemetry.ts  simulation.ts  commands.ts
hooks/
  useTelemetry.ts  useAnalytics.ts
  useToast.tsx            exports both ToastProvider and useToast
firestore.rules  firestore.indexes.json  firebase.json  scripts/seed.ts
```

Three additions beyond `PORTING-TO-NEXTJS.md`: the `(auth)` route group, the auth gate
living in `(dashboard)/layout.tsx` so nine pages are protected by one file, and
`lib/firebase/` kept separate from `services/adapters/firebase.ts` so the adapter stays a
pure data concern.

### Port ordering

Bottom-up, each layer compiling before the next begins: `lib/` → `services/` →
`components/ui/` → `components/feeder/` → `components/layout/` → pages. Type errors then
appear next to the code that caused them rather than arriving all at once.

### Port constraints

- No refactoring of component internals beyond what typing forces.
- No behavioural changes. A port that also improves things cannot be verified by comparison.
- `smart-pet-feeder-dashboard.jsx` stays on disk as the reference until the final commit of
  stage 1.
- The seven `bg-opacity-*` utilities are converted to slash syntax (`bg-white/90`); Tailwind
  v4 removed them. The existing "no arbitrary values" habit is kept — it costs nothing.

## 4. Data model

```
households/{hid}              { name, memberUids: string[], deviceId, settings, createdAt }
  ├─ pets/{petId}             PET001-style IDs, referenced by the classifier
  ├─ feedingHistory/{id}      auto-ID
  ├─ feedingSchedules/{id}    auto-ID
  └─ alerts/{id}              auto-ID
invites/{email}               { hid, invitedBy, createdAt }
```

`households/{hid}.deviceId` is authoritative once a user is signed in; `CONFIG.deviceId`
(from `NEXT_PUBLIC_DEVICE_ID`) is the fallback used in mock mode and during the telemetry
round before a household is resolved.

Document IDs: pets keep human-readable IDs because the on-device classifier maps a
predicted class to a `petId`, and console debugging is easier. High-volume collections use
auto-IDs.

Timestamps are stored as Firestore `Timestamp` and converted to and from epoch
milliseconds **at the adapter boundary**. The ported UI keeps `timestamp: number`, so
`fmtDate`, `timeAgo` and `useAnalytics` are unchanged and the two adapters stay genuinely
interchangeable. Conversion lives in one file per adapter.

Every feeding record written this round carries `simulated: true`, because the device is
still simulated while the backend is real. `FeedingHistoryTable` renders a small "Demo"
badge for those rows. When live telemetry lands, records arrive with `simulated: false`
and the badge stops appearing — no migration and no filtering logic.

### Security rules

`memberUids` on the household document is the single thing every rule checks. Subcollection
rules resolve it with `get(/databases/$(db)/documents/households/$(hid)).data.memberUids`.

Household list queries must be constrained to `where('memberUids', 'array-contains', uid)`;
an unconstrained query is rejected rather than filtered, which is the case that leaks if the
rule is written naively.

The invite flow is rules-only, with no Cloud Functions, which keeps the client-SDK decision
intact:

No email is sent — there is no server to send one this round. An invited person simply
signs in with the invited address and the app detects the pending invite; `(auth)/join` is
where that offer is presented. Delivering the invitation itself is out of band.

1. An existing member writes `invites/{invitee-email}`.
2. That document is readable only by the person it names: `request.auth.token.email == inviteId`.
3. A signed-in user may append **their own uid and nothing else** to a household's
   `memberUids` when a matching invite exists. Removing or altering any other member's uid
   is denied.
4. Joining is one batched client write that adds the uid and deletes the invite.

### Indexes

`firestore.indexes.json` carries composite indexes for feeding history by pet and
timestamp, and for unread alerts by timestamp.

## 5. Auth and session flow

`AuthProvider` (client component, `lib/firebase/`) owns the session and exposes a status of
`resolving | signed-out | no-household | ready`. `resolving` is a real state with its own
loading screen because Firebase restores sessions asynchronously and a flash of the sign-in
page is otherwise unavoidable.

`app/(dashboard)/layout.tsx` redirects to `/sign-in` when signed out. This gate is **UX, not
security** — the security boundary is `firestore.rules`, which holds regardless of what the
client renders. There is deliberately no Next middleware: with no server session cookie to
inspect, a middleware check would be theatre.

First sign-in takes one of two paths:

- An `invites/{their-email}` document exists → offer to join that household, run the batched
  join-and-delete write.
- Otherwise → create a household named from their display name, empty. No onboarding wizard;
  the existing `EmptyState` on the pets page already fills that role.

When `NEXT_PUBLIC_DATA_SOURCE=mock`, the provider yields a fixed fake user and the demo
household and the gate never redirects. The dashboard still runs and demos with zero Firebase
configuration.

The household ID reaches the adapter through `ServicesProvider` rather than a module-level
singleton mutated after login, which would race with the first render. Each page's
`services.pets.list()` becomes `useServices().pets.list()` — a one-line change in nine pages,
and it is what makes the adapter testable with an injected household.

## 6. Adapter contract, data flow, error handling

`services/contract.ts` declares `FeederServices` with the method names already in use:

```ts
export interface FeederServices {
  pets:      { list(): Promise<Pet[]>; get(id: string): Promise<Pet | null>;
               create(pet: NewPet): Promise<Pet>;
               update(id: string, patch: Partial<Pet>): Promise<Pet>;
               remove(id: string): Promise<boolean> };
  feedings:  { list(): Promise<FeedingRecord[]>; append(row: FeedingRecord): Promise<FeedingRecord> };
  schedules: { list(): Promise<Schedule[]>; create(row: NewSchedule): Promise<Schedule>;
               update(id: string, patch: Partial<Schedule>): Promise<Schedule>;
               remove(id: string): Promise<boolean> };
  alerts:    { list(): Promise<Alert[]>; append(row: Alert): Promise<Alert>;
               markRead(id: string): Promise<boolean>; markAllRead(): Promise<boolean> };
}
```

Both adapters implement it and the contract test suite runs against both.

Data flow through the UI is unchanged: `AppShell` still performs one `Promise.all` on mount,
still sets `loading`, still routes failures into `loadError` and the existing `ErrorState`
with its retry button. No optimistic updates; the current await-then-setState pattern stays.

Error mapping is the one place stage 2 adds behaviour. The adapter maps Firestore's opaque
codes at its boundary into a typed `FeederError` carrying a `kind` of `denied`, `offline`,
`not-found` or `unknown` plus a human-readable message. The mock adapter throws the same
type, so error paths are testable without a backend. `failed-precondition` is called out
specifically: it almost always means a missing composite index, and the dev-mode message
says so.

Firestore's local cache is enabled so a phone on unreliable house wifi renders last-known
state instead of an error.

Real-time listeners are **not** in this round. The adapter grows an optional `subscribe()`
when live telemetry lands; everything stays request-response today, which is what keeps the
port verifiable against the original.

## 7. Verification

Three Vitest suites, run against the emulators via `firebase emulators:exec`:

1. **Contract** — one parameterised suite executed twice, against the mock adapter and
   against the Firebase adapter on the emulator, with identical assertions. Drift between the
   adapters fails a test instead of surfacing in a demo.
2. **Rules** — via `@firebase/rules-unit-testing`. A non-member is denied every read and
   write; a member is allowed; an invitee can add their own uid and only their own; nobody can
   drop an existing member from `memberUids`; an unconstrained household query is rejected.
3. **Timestamp mapping** — a round-trip test on the seam every record crosses.

No component tests: the UI is ported code that already works, and the port is verified by
comparison rather than by assertion.

The port itself has no cheap automated verification. Stage 1 relies on `tsc --noEmit` and
`next build` for structural correctness, and on page-by-page visual comparison against the
original `.jsx` for behavioural correctness. That is why the original file stays on disk
until the last commit of the stage.

## 8. Deliverables

Each stage gets its own implementation plan; stage 2 is not planned in detail until stage 1
is done and its assumptions have survived contact with the real code.

### Stage 1 — the port

- Next.js 15 + TypeScript + Tailwind v4 + Vitest project.
- All nine pages, all primitives and all feature components ported.
- `FeederServices` typed; mock adapter, telemetry store, simulation engine and command bus intact.
- `smart-pet-feeder-dashboard.jsx` deleted.
- `CLAUDE.md` rewritten — it documents a single-file world and becomes actively misleading the
  moment the split lands.
- `PORTING-TO-NEXTJS.md` becomes `docs/ARCHITECTURE.md`, describing what is rather than what is planned.

Done when: `tsc --noEmit` and `next build` pass, and all nine pages match the original
side by side.

### Stage 2 — the backend

- `lib/firebase/` (client init, `AuthProvider`, household resolution).
- `ServicesProvider` and the nine call-site updates.
- `createFirebaseAdapter()` with timestamp and error mapping.
- `firestore.rules`, `firestore.indexes.json`, `firebase.json`.
- `scripts/seed.ts` writing the demo household from the existing `SEED_*` data. Seeded
  feeding records carry `simulated: true` like every other record written this round.
- Sign-in and invite-acceptance pages.
- The three test suites.
- `SETUP.md`: creating the Firebase project, enabling the two providers, pasting config into
  `.env.local`, deploying rules and indexes, running the seed.

Done when: all suites pass against the emulators, and the app runs end to end against the
emulators with `NEXT_PUBLIC_DATA_SOURCE=firebase` — sign in, create a pet, dispense, see the
record persist, sign out, sign back in.

## 9. Risks

- **The port is verified by eye.** Nine pages of visual comparison is the weakest link. The
  mitigation is keeping the original file until the end and porting bottom-up so that
  structural breakage surfaces in the compiler first.
- **Rules are easy to get subtly wrong.** Specifically the unconstrained-query case and the
  "append only your own uid" case. Both have named tests; neither is verified by inspection.
- **No cloud project exists yet.** Everything is emulator-verified, so the first real
  deployment can still surface console configuration gaps — authorised domains for Google
  sign-in in particular. `SETUP.md` exists to make that a checklist rather than a debugging
  session.
- **A real backend with a simulated device** produces fabricated history. The `simulated`
  flag keeps that honest rather than hidden.
