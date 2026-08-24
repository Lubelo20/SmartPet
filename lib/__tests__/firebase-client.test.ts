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

  it("connects to the same emulator ports firebase.json serves", () => {
    // These live in two files and drift silently: the client would connect to a
    // port nothing is listening on and every read would hang.
    const source = readFileSync("lib/firebase/client.ts", "utf8");
    const cfg = JSON.parse(readFileSync("firebase.json", "utf8")) as {
      emulators: { auth: { port: number }; firestore: { port: number } };
    };
    expect(source).toContain(`:${cfg.emulators.auth.port}`);
    expect(source).toContain(`, ${cfg.emulators.firestore.port})`);
  });
});
