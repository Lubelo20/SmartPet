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

/**
 * Lazy and memoised on purpose. Initialising at module scope would run during
 * the static prerender, where no config exists and nothing needs it — call
 * this from inside effects and state initialisers only.
 */
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
    // Ports must match firebase.json — lib/__tests__/firebase-client.test.ts
    // asserts they do, because drift here makes every read hang.
    connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });
    connectFirestoreEmulator(db, "127.0.0.1", 8085);
  }

  bundle = { app, auth, db };
  return bundle;
}
