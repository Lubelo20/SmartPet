/**
 * Writes the demo household from the same seed data the mock adapter uses, so
 * a fresh Firebase project looks exactly like mock mode.
 *
 *   Emulator:  NEXT_PUBLIC_USE_EMULATORS=true npm run seed
 *   Live:      GOOGLE_APPLICATION_CREDENTIALS=./sa.json npm run seed -- --force
 *
 * This is the one place the Admin SDK is allowed. Everything the app itself
 * does goes through the client SDK under firestore.rules; seeding cannot,
 * because the rules require an authenticated member and the seed has to create
 * the household that membership refers to. Against the emulator the Admin SDK
 * needs no credentials at all.
 */
import { cert, initializeApp, applicationDefault, type AppOptions } from "firebase-admin/app";
import { getFirestore, Timestamp } from "firebase-admin/firestore";
import {
  buildSeedAlerts, buildSeedFeedings, buildSeedPets, buildSeedSchedules, buildSeedSettings,
} from "../lib/seed-data";

const args = process.argv.slice(2);
const force = args.includes("--force");
const positional = args.filter((a) => !a.startsWith("--"));
const hid = positional[0] ?? "demo-household";
const uid = positional[1] ?? "demo-user";

const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ?? "demo-feeder";
const useEmulators = process.env.NEXT_PUBLIC_USE_EMULATORS === "true";

// Seeding a real project by accident is the failure worth preventing.
if (!projectId.startsWith("demo-") && !force) {
  console.error(
    `Refusing to seed project "${projectId}" because its id does not start with "demo-".\n` +
    `If you really mean to write demo data into it, re-run with --force.`,
  );
  process.exit(1);
}

if (useEmulators) {
  // The Admin SDK talks to the emulator through this, and skips credentials.
  // Host and port must match firebase.json.
  process.env.FIRESTORE_EMULATOR_HOST ??= "127.0.0.1:8085";
}

async function main() {
  const options: AppOptions = { projectId };
  if (!useEmulators && process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    options.credential = process.env.GOOGLE_APPLICATION_CREDENTIALS.endsWith(".json")
      ? cert(process.env.GOOGLE_APPLICATION_CREDENTIALS)
      : applicationDefault();
  }
  initializeApp(options);
  const db = getFirestore();

  const pets = buildSeedPets();
  const schedules = buildSeedSchedules();
  const feedings = buildSeedFeedings();
  const alerts = buildSeedAlerts();
  const { notifications, ...device } = buildSeedSettings();

  const batch = db.batch();
  batch.set(db.doc(`households/${hid}`), {
    name: "Demo household",
    memberUids: [uid],
    deviceId: process.env.NEXT_PUBLIC_DEVICE_ID ?? "ESP32-PETFEEDER-001",
    createdAt: Date.now(),
  });

  // The app's mappers use the client SDK's Timestamp, which the Admin SDK will
  // not accept, so the two timestamp fields are converted here instead. Shapes
  // stay identical to what lib/firebase/mapping.ts writes.
  for (const p of pets) {
    const { id, ...rest } = p;
    batch.set(db.doc(`households/${hid}/pets/${id}`), rest);
  }
  for (const s of schedules) {
    const { id, ...rest } = s;
    batch.set(db.doc(`households/${hid}/feedingSchedules/${id}`), rest);
  }
  for (const f of feedings) {
    const { id, timestamp, ...rest } = f;
    batch.set(db.doc(`households/${hid}/feedingHistory/${id}`), {
      ...rest, timestamp: Timestamp.fromMillis(timestamp),
    });
  }
  for (const a of alerts) {
    const { id, timestamp, ...rest } = a;
    batch.set(db.doc(`households/${hid}/alerts/${id}`), {
      ...rest, timestamp: Timestamp.fromMillis(timestamp),
    });
  }
  // The two halves of the settings split. Both adapters fall back to the same
  // defaults when these are absent, so seeding them is about making the demo
  // household complete rather than about correctness.
  batch.set(db.doc(`households/${hid}/settings/device`), device);
  batch.set(db.doc(`households/${hid}/members/${uid}`), { notifications });

  await batch.commit();

  console.log(
    `Seeded ${projectId}/households/${hid} (owner ${uid}): ` +
    `${pets.length} pets, ${schedules.length} schedules, ` +
    `${feedings.length} feedings, ${alerts.length} alerts, settings.`,
  );
}

main().then(() => process.exit(0)).catch((e) => {
  console.error("Seed failed:", e);
  process.exit(1);
});
