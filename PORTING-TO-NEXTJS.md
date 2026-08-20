# Smart Pet Feeder Dashboard — porting the single file into Next.js + TypeScript

`smart-pet-feeder-dashboard.jsx` is one runnable file so it previews immediately. The
internal boundaries are already the folder boundaries — splitting it is mechanical.

## Target structure

```
app/
  layout.tsx                     -> ToastProvider + <html> shell
  (dashboard)/page.tsx           -> DashboardPage
  (dashboard)/live/page.tsx      -> LivePage
  (dashboard)/pets/page.tsx      -> PetsPage
  (dashboard)/feeding/page.tsx   -> FeedingPage
  (dashboard)/history/page.tsx   -> HistoryPage
  (dashboard)/sensors/page.tsx   -> SensorsPage
  (dashboard)/device/page.tsx    -> DevicePage
  (dashboard)/alerts/page.tsx    -> AlertsPage
  (dashboard)/settings/page.tsx  -> SettingsPage
components/
  ui/            Card, Button, Badge, Input, Select, Modal, ProgressBar,
                 Toast, LoadingState, EmptyState, ErrorState
  feeder/        StatusCard, PetCard, SensorCard, WeightMonitor, CameraPreview,
                 FeedingWorkflow, FeedingHistoryTable, AlertCard, DeviceStatusPill,
                 PetDetectionPanel, ChartFrame
  layout/        Sidebar, Header, DemoPanel
lib/
  config.ts      CONFIG (env driven)
  types.ts       Pet, FeedingRecord, Schedule, Alert, Telemetry, DeviceStatus
  utils.ts       fmtDate, fmtTime, timeAgo, fmtUptime, clamp
services/
  adapters/mock.ts        createMockAdapter()      (already written)
  adapters/firebase.ts    createFirebaseAdapter()  (stub in the file's comments)
  index.ts                exports `services` based on CONFIG.dataSource
  telemetry.ts            TelemetryStore + useTelemetry
  simulation.ts           SimulationEngine (dev only)
  commands.ts             commandBus
hooks/
  useTelemetry.ts, useToast.ts, useAnalytics.ts
```

## Types to lift out first

```ts
export type Pet = {
  id: string; name: string; species: "Dog" | "Cat"; breed: string;
  weightKg: number; portionG: number; mealsPerDay: number;
  status: "Active" | "Paused"; colour: string; note?: string; enrolledAt: string;
};

export type FeedingRecord = {
  id: string; timestamp: number; petId: string; targetG: number; actualG: number;
  status: "Completed" | "Under-dispensed" | "Low confidence";
  confidence: number; trigger: "Manual" | "Scheduled"; durationS: number;
};

export type Telemetry = {
  device: { id: string; online: boolean; ip: string; ssid: string; rssi: number;
            firmware: string; mqtt: string; lastHeartbeat: number; uptimeS: number; freeHeapKb: number };
  hopper: { grams: number; capacity: number };
  bowl: { grams: number; targetG: number };
  distanceCm: number;
  servo: "READY" | "DISPENSING";
  camera: { online: boolean; lastFrameAt: number; fps: number };
  detection: { state: "idle" | "detected" | "identifying" | "identified" | "unknown";
               petId: string | null; confidence: number; since: number };
  cycle: { active: boolean; step: number; petId: string | null; targetG: number;
           trigger: string | null; startedAt: number | null; message: string };
};
```

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
