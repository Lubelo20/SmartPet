# Smart Pet Feeder — AI pet identification and feeding intelligence

Date: 2026-09-04
Status: **proposed design. Nothing here is built.** Two parts of it cannot be built at all
until the Firebase project moves off the Spark plan (§3.1), and one part cannot be verified
by anyone in this repository because no board has ever been flashed (§11).

Scope: integrating pet identification, model training, model management and a feeding
decision engine into the **existing** dashboard. It is an integration design, not a
replacement design — §2 exists to record how much is already built, because the largest
risk in this work is rebuilding something that already works.

Companion documents: `docs/ARCHITECTURE.md` (layering, telemetry and command contracts),
`2026-08-25-feeder-firmware-design.md` (the device this must talk to),
`2026-08-20-feeder-platform-design.md` (household ownership and Firestore).

---

## 1. What it must satisfy

The interfaces are already fixed by working code, so this design has little freedom. That
is deliberate: every constraint below is a thing that already passes tests.

- **Household scoping is the security boundary.** Everything lives under
  `households/{hid}/…`, and `memberUids` on the household document is what
  `firestore.rules` checks. 22 emulator tests cover it.
- **The four-layer rule holds**: `lib/` → `services/` → `components/` → `app/`. No component
  talks to a transport. New AI state reaches pages through `useFeederData()` or a hook
  beside it, never by a page calling a service directly.
- **`FeederServices` is a contract implemented twice.** `firestore/__tests__/contract.test.ts`
  runs one suite against both the mock and Firebase adapters. Anything added to the contract
  must be implemented in both, or the mock stops running with no backend — which is the
  property that lets this project demo without hardware.
- **`Timestamp` exists in exactly one module** (`lib/firebase/mapping.ts`). Everything above
  it speaks epoch milliseconds.
- **Errors are `FeederError`.** No component sees a raw `FirebaseError` or an HTTP status.
- **Every setting must govern something.** A control that promises behaviour and delivers
  none has been the most common bug in this codebase.
- **The device decides.** Per the firmware design §4, the ESP32 owns the final say on
  whether the servo turns. The dashboard and the cloud may *withhold* permission; they may
  never compel a pour that the device's own limits reject.

## 2. What already exists

This table is the most important section of this document. The brief asked for a system;
about 40% of it is built and tested. Reuse is not optional here — duplicating any row below
creates two sources of truth for whether an animal eats.

| Brief | Exists today | Where |
|---|---|---|
| §6 Pet registration | Full CRUD, form modal, cards, avatars | `services/*/pets`, `components/feeder/PetFormModal.tsx` |
| §5 Configurable confidence threshold | `Settings.confidenceThreshold`, injected into the engine, already blocks feeding | `lib/types.ts`, `services/simulation.ts:249` |
| §16 Daily-limit check | `checkDailyLimit`, enforced in the `dispense` mutator | `lib/limits.ts` |
| §17 Some rejection reasons | `detection:unknown`, `cycle:stopped`, `schedule:skipped{reason:'daily-limit'}` | `lib/types.ts` `EngineEvent` |
| §14 Pet detection card | Renders `idle`/`detected`/`identifying`/`identified`/`unknown` | `components/feeder/PetDetectionPanel.tsx` |
| §15 Live camera | Frame, overlay, timestamp, resolution | `components/feeder/CameraPreview.tsx` |
| §19 Load-cell verification | `targetG` vs `actualG`, `Under-dispensed` status | `lib/types.ts` `FeedingRecord` |
| §20 Food monitoring | `food:low`, `hopperCapacityG`, `lowFoodThreshold` | `services/simulation.ts`, `lib/config.ts` |
| §25 Alerts | Type, severity, collection, `raiseAlert`, mute-never-suppresses-the-record rule | `lib/notifications.ts` |
| §24 History page | Table, filters, analytics derivations | `app/(dashboard)/history`, `lib/analytics.ts` |
| §29 Multi-pet household | Per-pet portion, meals/day, schedules, status | throughout |

**Untouched by this work:** every page's layout, `TONE`, `PET_COLOUR`, the semantic colour
tokens, `DashboardShell`, `Sidebar`, the analytics derivations, and the mock adapter's
ability to run the whole app with no backend and no sign-in.

## 3. Decisions taken

| Decision | Choice | Reason |
|---|---|---|
| Collection scoping | Household-scoped, not flat | §4.1 |
| Pet schema | Reuse existing fields, add `photoPath` only | §4.2 |
| Decision engine | Pure module in `lib/`, no I/O | Testable without emulator, network or board; it is the safety-critical part |
| Inference host | Cloud Run | TF + FastAPI is ~500 MB; Vercel's function ceiling is 250 MB |
| Model format | TFLite for serving, Keras kept for retraining | Smaller cold start; Keras is the reproducible artefact |
| Training host | Colab, manual trigger | Per the brief. It is not, and must not become, the inference server |
| Who calls inference | The **device**, not the browser | A browser tab is not a required participant in feeding an animal |
| Model scope | Global (`models/`, `system/ai`), not per household | One model serves every household; per-household models would need per-household training |
| Real-time | Firestore listeners for AI state; RTDB stays the device transport | Firestore already holds the domain data; two transports for one datum would drift |

### 3.1 Blockers, verified

| Blocker | Evidence | Blocks |
|---|---|---|
| **Spark plan** — `billingEnabled: false` | `gcloud billing projects describe` | Firebase Storage, Cloud Run → sub-projects B, C, D |
| **Storage API disabled** | `firebasestorage.googleapis.com` returns `SERVICE_DISABLED` | B, C |
| **No hardware** | `firmware/README.md`: nothing has been flashed | F, and the §42 end-to-end test |
| **No vision in firmware** | `firmware/README.md`: "`petId` is always null" | F |

Sub-projects **A** and **E** need none of the above and can be built and verified today.

## 4. Where this design departs from the brief

### 4.1 Flat collections become household-scoped

The brief's §21 proposes `pets/`, `detections/`, `feedingEvents/`, `devices/`. Adopting
that would delete the security boundary: `firestore.rules` authorises by
`memberUids` on the enclosing household, and a top-level `feedingEvents/` has no enclosing
household to check. It would also break 22 passing rules tests and both adapters.

**Resolved:** `detections` and `feedingEvents` become subcollections of the household. Only
`models/` and `system/ai` are global, because a model is not household data — and both are
read-only to clients (§12).

### 4.2 Pet field names stay as they are

| Brief | Existing | Note |
|---|---|---|
| `petId` | `id` | Firestore document id |
| `feedingEnabled` | `status: "Active" \| "Paused"` | Same concept |
| `mealSize` | `portionG` | Same concept |
| `dailyLimit` | `mealsPerDay` (per pet) + `Settings.maxDaily` (device) | Two limits already exist |
| `photo` | — | **Genuinely missing.** Added as `photoPath` |
| `ownerId` | household `memberUids` | Ownership is the household's |

Renaming touches every component and buys nothing. Only `photoPath` is added.

### 4.3 `CONFIG.transport` is currently decorative

It is read in exactly one place — `app/(dashboard)/settings/page.tsx:36` — where it is
*displayed*. Nothing switches on it. Sub-project E makes it real; until then, no document
should describe the app as having a selectable transport.

---

## 5. Data model

### 5.1 Firestore

```
households/{hid}/
  pets/{petId}              + photoPath?: string        (existing doc, one new field)
  feedingHistory/{id}                                    (existing, untouched)
  feedingSchedules/{id}                                  (existing, untouched)
  alerts/{id}                                            (existing, new `type` values only)
  settings/device           + aiEnabled, feedCooldownS   (existing doc, new fields)
  members/{uid}                                          (existing, untouched)

  detections/{detectionId}   NEW
  feedingEvents/{eventId}    NEW
  trainingImages/{imageId}   NEW   metadata only; bytes live in Storage

models/{version}             NEW   global, client-read-only
system/ai                    NEW   global, client-read-only, single document
trainingSessions/{sessionId} NEW   global, client-read-only
```

`detections` and `feedingEvents` are separate collections on purpose. A detection is an
observation and happens whether or not anything is dispensed; a feeding event is a decision
and its outcome. Collapsing them would make "how often does an unknown animal appear?"
unanswerable without filtering on a null.

### 5.2 New types (`lib/types.ts`)

```ts
export type DetectionStatus = "RECOGNIZED" | "UNKNOWN" | "ERROR";

export type Detection = {
  id: string; deviceId: string; timestamp: number;
  petId: string | null; petName: string; confidence: number;   // 0..1
  status: DetectionStatus; modelVersion: string | null;
  imagePath?: string;                                          // Storage path, if retained
};

export type FeedingDecision = "APPROVED" | "REJECTED";
export type RejectionReason =
  | "UNKNOWN_PET" | "LOW_AI_CONFIDENCE" | "FEEDING_DISABLED"
  | "DAILY_LIMIT_REACHED" | "OUTSIDE_SCHEDULE" | "INSUFFICIENT_FOOD"
  | "DEVICE_OFFLINE" | "AI_SERVICE_OFFLINE" | "AI_DISABLED" | "COOLDOWN_ACTIVE"
  | "UNSAFE_AMOUNT";

export type FeedingEvent = {
  id: string; requestId: string; deviceId: string; timestamp: number;
  petId: string | null; petName: string;
  requestedG: number; actualG: number | null;
  aiConfidence: number | null; modelVersion: string | null;
  decision: FeedingDecision; reason: RejectionReason | null;
  result: "SUCCESS" | "SHORT_POUR" | "FAILED" | "NOT_ATTEMPTED";
};

export type ModelVersion = {
  version: string; status: "ACTIVE" | "INACTIVE" | "FAILED";
  accuracy: number; precision: number; recall: number; f1Score: number;
  numberOfPets: number; numberOfImages: number;
  labels: Record<string, string>;              // classIndex -> petId
  tflitePath: string; kerasPath: string;
  createdAt: number;
};
```

### 5.2.1 Two confidence scales, and the one place they meet

The codebase already has a scale and it is not the model's. This must be written down or it
will be got wrong:

| Value | Scale | Why |
|---|---|---|
| Model output, `/predict` response, `Detection.confidence`, `FeedingEvent.aiConfidence` | `0..1` | What a softmax returns. Rescaling on the wire invites a factor-of-100 bug |
| `Settings.confidenceThreshold` | `0..100` | **Existing.** Rendered as "75%" and stored that way today |
| `FeedingRecord.confidence` | `0..100` | **Existing.** `simulation.ts` writes `95` |

Conversion happens in **exactly one place** — `lib/decision.ts` step 3, written as
`confidence < settings.confidenceThreshold / 100` — and nowhere else. No new field uses
`0..100`, and no existing field is migrated: renaming a scale under working code buys a
consistency nobody sees and risks a threshold that silently reads 0.75% or 7500%.

### 5.3 Storage layout

```
training/{hid}/{petId}/{imageId}.jpg    training images, household-scoped
models/{version}/pet_model.tflite       written by the training job only
models/{version}/pet_model.keras
models/{version}/labels.json
models/{version}/metadata.json
detections/{hid}/{detectionId}.jpg      optional retained frames, TTL 30 days
```

Training images are household-scoped even though the model is global: the images are
someone's pets in someone's kitchen, and a household must not read another's.

### 5.4 Rules changes

Two changes, both narrow:

```
// Add to the explicit subcollection list — never a wildcard, per the existing comment.
match /{collection}/{docId} {
  allow read, write: if isMember(hid)
    && collection in ['pets','feedingHistory','feedingSchedules','alerts','settings',
                      'detections','feedingEvents','trainingImages'];
}

// Global, client-read-only. Written by the training job and the activation callable,
// both of which use the Admin SDK and bypass rules.
match /models/{version}      { allow read: if signedIn(); allow write: if false; }
match /system/{doc}          { allow read: if signedIn(); allow write: if false; }
match /trainingSessions/{id} { allow read: if signedIn(); allow write: if false; }
```

`allow write: if false` on `models/` is the point. A client that could mark a model ACTIVE
could point every feeder at a model it trained itself.

**`read` grants `list`, and that is a constraint on sub-project C.** Any signed-in user can
enumerate every document in `models`, `system` and `trainingSessions` unfiltered — unlike
`households` and `invites`, whose `list` rules are constrained per document. That is
harmless while nothing writes those collections. It stops being harmless the moment
`trainingSessions` carries household ids, pet ids or Storage paths (§8), because unfiltered
`list` then leaks one household's metadata to every signed-in user of the system. The
sub-project that first writes a `trainingSessions` document must either keep household
identifiers out of it or replace `read` with a constrained `get`/`list` pair.

**Every rule above gets emulator tests before the code that relies on it**, in the style of
the existing 22.

---

## 6. Sub-project A — decision engine (no billing, fully verifiable)

The safety-critical piece, and the reason to build it first: nothing else may decide whether
an animal eats.

### 6.1 Shape

`lib/decision.ts`, a pure function. No Firestore, no fetch, no clock of its own — time is a
parameter so tests are deterministic and there is no module-scope `Date.now()`.

```ts
export type DecisionInput = {
  now: number;
  prediction: { petId: string | null; confidence: number; status: DetectionStatus;
                modelVersion: string | null } | null;   // null = AI unreachable
  pet: Pet | null;
  settings: Settings;
  telemetry: Pick<Telemetry, "device" | "hopper">;
  schedules: Schedule[];
  todaysFeedings: FeedingRecord[];
  lastFeedAt: Record<string, number>;                   // petId -> epoch ms
  requestedG: number;
};

export type Decision =
  | { decision: "APPROVED"; petId: string; amountG: number }
  | { decision: "REJECTED"; reason: RejectionReason; petId: string | null };

export function decideFeeding(input: DecisionInput): Decision;
```

### 6.2 Order of checks

Order matters, because the reason recorded is the *first* failure and that is what the user
reads on the History page. Cheapest and most safety-relevant first:

0. `settings.aiEnabled === false` → `AI_DISABLED`. AI-triggered feeding is off; detections
   are still recorded, and scheduled and manual feeding are untouched. This step is what
   stops `aiEnabled` from being a switch that promises behaviour and delivers none — the
   failure mode this codebase names as its most common bug.
1. `prediction === null` → `AI_SERVICE_OFFLINE` — **fail safe, never fail open** (brief §27)
2. `status !== "RECOGNIZED"` or `petId === null` → `UNKNOWN_PET`
3. `confidence < settings.confidenceThreshold / 100` → `LOW_AI_CONFIDENCE`
4. `pet === null` → `UNKNOWN_PET` (recognised a class that no longer has a pet document)
5. `pet.status !== "Active"` → `FEEDING_DISABLED`
6. `requestedG` outside `[1, min(pet.portionG * 2, 200)]` → `UNSAFE_AMOUNT` (brief §45)
7. `now - lastFeedAt[petId] < settings.feedCooldownS * 1000` → `COOLDOWN_ACTIVE` (§28)
8. `checkDailyLimit(...)` fails → `DAILY_LIMIT_REACHED` — **reuses `lib/limits.ts`**
9. outside every enabled schedule window for that pet → `OUTSIDE_SCHEDULE`
10. `hopper.grams < requestedG` → `INSUFFICIENT_FOOD`
11. `!device.online` → `DEVICE_OFFLINE`
12. otherwise `APPROVED`

Step 4 is not paranoia: a model trained on three pets keeps predicting class 2 after that
pet is deleted, and the deletion must win.

Step 6 is the answer to the brief's §45 `DISPENSE 5000g` test. The ceiling is derived from
the pet's own portion rather than a constant, so a chihuahua's cap is not a labrador's.
**The device enforces its own limits regardless** — this check exists so an unsafe request
is refused and recorded before it is ever sent, not as the only guard.

### 6.3 Confidence threshold is not feeding authorisation

The brief is explicit and correct on this. `confidenceThreshold` gates step 3 only.
`pet.status` gates step 5. A pet can be recognised at 99% and still not eat. They are
separate fields, separate rejection reasons and separate columns on the History page.

### 6.4 Tests

Table-driven, one case per rejection reason plus the approval path, plus the three scenarios
the brief names (§42 approved, §43 unknown, §44 low confidence), plus boundary cases at
exactly the threshold, exactly the cooldown and exactly the daily limit. Pure function, so
these run in `npm test` with no emulator.

---

## 7. Sub-project B — training-image management (needs Blaze)

- Upload UI added to the **existing** Pets page as a section on the pet detail view, not a
  new page and not a new design language. Multi-file drop, per-file progress, client-side
  validation (JPEG/PNG, ≤ 5 MB, ≥ 224×224).
- Writes bytes to `training/{hid}/{petId}/{imageId}.jpg` and metadata to
  `households/{hid}/trainingImages/{imageId}`.
- A new **AI Training** route (`app/(dashboard)/ai/`) shows per-pet counts and readiness,
  using the existing `Card`, `Button` and `TONE` primitives.
- Readiness thresholds: `< 50` INSUFFICIENT, `50–149` MARGINAL, `≥ 150` READY. Stated here
  so the UI and the training job cannot disagree.
- `[START TRAINING]` is disabled unless **every** `Active` pet is READY. Training a model
  that cannot recognise one of the household's pets produces confident wrong answers, which
  is worse than refusing.

## 8. Sub-project C — training pipeline and model registry (needs Blaze)

A Colab notebook in `ml/train_pet_classifier.ipynb`, plus `ml/` Python modules so the logic
is testable outside a notebook.

Pipeline: authenticate (service-account key, **never committed** — the repo is public) →
download approved images → validate and flag corrupt files → stratified split 70/15/15 →
resize 224×224 → augment (flip, rotation ±15°, brightness, zoom) → MobileNetV2 transfer
learning, frozen base → fine-tune last 30 layers at a lower learning rate → evaluate →
export `.keras`, `.tflite`, `labels.json`, `metadata.json` → upload to Storage → write
`models/{version}`.

- Split is **stratified by pet** and grouped so near-duplicate frames from one burst cannot
  straddle train and test. Ungrouped splitting is how a 99%-accurate model that has
  memorised the kitchen floor gets shipped.
- A new model is written `INACTIVE`. Activation is a separate, deliberate act (§10).
- `trainingSessions/{id}` carries real epoch/accuracy progress written by the job. The
  dashboard renders exactly what is there and **never interpolates** — the brief's §34 is
  explicit and it is right.

## 9. Sub-project D — inference service (needs Blaze)

FastAPI on Cloud Run, `ml/service/`. Loads the ACTIVE model from Storage at cold start and
re-reads `system/ai` on a 60-second TTL, so activation propagates without a redeploy.

| Endpoint | Purpose |
|---|---|
| `POST /predict` | multipart image → prediction |
| `POST /model/test` | same, but never records a detection |
| `GET /models`, `GET /models/active` | registry reads |
| `POST /models/{version}/activate` | admin only; flips ACTIVE atomically |
| `GET /health`, `GET /health/ai` | liveness, and model-loaded readiness |

Response is exactly the brief's §12 shape. `confidence` is `0..1`.

Authentication: the ESP32 presents its Firebase ID token; the service verifies it and checks
the uid against `deviceAuth/{deviceId}/uid` — the same mechanism the firmware design already
uses for RTDB. **No API keys in firmware.**

Timeout 3 s. On timeout, model-load failure or any 5xx, the caller treats the prediction as
`null`, which reaches `decideFeeding` as `AI_SERVICE_OFFLINE` and refuses to feed (§6.2
step 1). Failing safe is a design output, not an error path.

## 10. Model management UI

On the AI route, reusing existing primitives: list versions with accuracy/precision/recall/F1,
compare two, upload an image to test a model **before** activating it, and activate — behind
a confirm, because activation changes what every feeder does. Exactly one `ACTIVE`,
enforced in the activation transaction, not by the client.

## 11. Sub-project E — real time, and F — firmware vision

**E (no billing).** Replace one-shot `list()` with Firestore `onSnapshot` for `detections`,
`feedingEvents` and `alerts`; keep RTDB as the device telemetry transport. Make
`CONFIG.transport` actually select between `simulation` and `rtdb` rather than being
displayed. `ServicesProvider` already remounts on `householdId`, so listener lifetime has a
correct home.

**F (no hardware — cannot be verified here).** HC-SR04 crossing the presence threshold
triggers one capture, one `POST /predict`, one decision. Event-based, with a device-side
cooldown independent of the cloud's, because a device that loses connectivity must still not
pour continuously. This sub-project must be marked, as the firmware README already marks its
predecessor, as **written but never run on hardware** until somebody flashes a board.

## 12. Security

- No Admin credentials, service-account keys or model-activation authority in the browser.
  `models/`, `system/ai` and `trainingSessions/` are `allow write: if false`.
- The dashboard may **request** a feed; it may not command one. The device validates
  independently and its own limits win.
- Every feeding command carries a unique `requestId`; the device rejects a repeat, so a
  retried network call cannot double-pour.
- Storage rules mirror Firestore's: `training/{hid}/…` readable and writable only by members
  of that household; `models/…` readable by any signed-in user, writable by nobody.
- The repository is public. `secrets.h` and `.env.local` are git-ignored and verified so;
  the Colab service-account key must never be committed, and the notebook must read it from
  an upload prompt, not a repo path.

## 13. Verification

| Sub-project | How it is verified |
|---|---|
| A | Unit tests, table-driven, no emulator. Every rejection reason, every boundary |
| Rules | Emulator tests, in the style of the existing 22 |
| B | Contract tests for the new adapter methods, run against both adapters |
| C | `ml/` modules tested with pytest on a fixture dataset; the notebook is not the unit |
| D | pytest + FastAPI TestClient; a fixture TFLite model, no network |
| E | Existing suites must stay green; listener teardown asserted |
| F | `pio test -e native` for domain logic only. **Nothing else is verifiable without a board** |

The end-to-end scenario in the brief's §42 **cannot be executed** by anyone in this
repository. It requires an ESP32, a camera, a load cell, a servo and a pet. It should be
written down as a bench checklist for whoever has the hardware, not claimed as passing.

## 14. Sequence

```
A (decision engine + types + rules)        no billing    ← start here
└── E (real-time listeners)                no billing
    └── B (training images)                Blaze
        └── C (training + registry)        Blaze
            └── D (inference service)      Blaze
                └── F (firmware vision)    hardware
```

A first because everything calls it and it is the part that must never be wrong. F last
because it is the only part nobody here can test.

## 15. What this design refuses to do

- **No bounding boxes.** MobileNetV2 classification produces no localisation. The brief says
  not to fake them; drawing a box around the centre of the frame would be a lie in a UI whose
  whole job is to be trusted.
- **No browser training.** Stated in the brief, repeated here because it is tempting.
- **No feeding on AI failure.** There is no "degraded mode" that feeds without identification.
- **No per-household models** in this version.
- **No automatic activation** of a newly trained model.

## 16. Cost

Blaze is pay-as-you-go and retains the free tier. At this scale — hundreds of images, one
model, one feeder — Storage and Firestore stay inside free quotas. Cloud Run scale-to-zero
means the inference service costs nothing while idle; the realistic bill is a few cents a
month plus Colab, which is free. **The card is required for access to the products, not
because the usage is expensive.**

## 17. Open questions

1. **Billing** — will Blaze be enabled? B, C and D are unreachable without it. A and E are
   not, so there is useful work either way.
2. **Retained detection frames** — keeping the image behind a detection makes debugging a
   misidentification possible and is a camera pointed at a kitchen. Default here is 30-day
   TTL, off unless enabled.
3. **Who may activate a model** — any household member, or an explicit owner role? The
   codebase has no roles today; adding one is its own piece of work.
4. **Hardware** — is there an ESP32-CAM to flash? If not, F should be written and clearly
   marked unverified rather than silently trusted.
