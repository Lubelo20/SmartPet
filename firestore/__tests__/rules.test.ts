import { readFileSync } from "node:fs";
import { afterAll, afterEach, beforeAll, describe, it } from "vitest";
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

/**
 * Seed the global AI documents the way the training job would, bypassing rules.
 * Without an existing document, `assertFails(setDoc(...))` only ever proves the
 * `create` path is closed.
 */
async function seedGlobalDocs() {
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, "models", "v1.0"), { status: "ARCHIVED", accuracy: 0.9 });
    await setDoc(doc(db, "system", "ai"), { activeModelVersion: "v1.0" });
    await setDoc(doc(db, "trainingSessions", "s1"), { status: "RUNNING" });
  });
}

async function seedInvite(email: string, hid: string = HID) {
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), "invites", email), {
      hid, invitedBy: ALICE.uid, createdAt: 0,
    });
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

describe("settings and member preferences", () => {
  it("lets any member read and write shared device settings", async () => {
    await seedHousehold([ALICE.uid, BOB.uid]);
    await assertSucceeds(setDoc(doc(bob(), "households", HID, "settings", "device"), {
      deviceName: "Kitchen feeder", defaultPortion: 120,
    }));
    await assertSucceeds(getDoc(doc(alice(), "households", HID, "settings", "device")));
  });

  it("denies a non-member the settings document", async () => {
    await seedHousehold();
    await assertFails(getDoc(doc(mallory(), "households", HID, "settings", "device")));
    await assertFails(setDoc(doc(mallory(), "households", HID, "settings", "device"), { deviceName: "x" }));
  });

  it("lets a member write their own preferences", async () => {
    await seedHousehold([ALICE.uid, BOB.uid]);
    await assertSucceeds(setDoc(doc(bob(), "households", HID, "members", BOB.uid), {
      notifications: { lowFood: false, offline: true, feedingError: true, unknownPet: true },
    }));
  });

  it("refuses to write another member's preferences", async () => {
    // The shared-data wildcard would have allowed this, which is why the
    // collection list in the rules is explicit rather than a bare wildcard.
    await seedHousehold([ALICE.uid, BOB.uid]);
    await assertFails(setDoc(doc(bob(), "households", HID, "members", ALICE.uid), {
      notifications: { lowFood: false, offline: false, feedingError: false, unknownPet: false },
    }));
  });

  it("lets a member read another member's preferences", async () => {
    await seedHousehold([ALICE.uid, BOB.uid]);
    await assertSucceeds(getDoc(doc(bob(), "households", HID, "members", ALICE.uid)));
  });

  it("denies a non-member every member document", async () => {
    await seedHousehold();
    await assertFails(getDoc(doc(mallory(), "households", HID, "members", ALICE.uid)));
    await assertFails(setDoc(doc(mallory(), "households", HID, "members", MALLORY.uid), {
      notifications: { lowFood: true, offline: true, feedingError: true, unknownPet: true },
    }));
  });

  it("refuses an unknown subcollection outright", async () => {
    // The explicit list means a typo'd or unexpected collection is denied
    // rather than silently readable by every member.
    await seedHousehold();
    await assertFails(setDoc(doc(alice(), "households", HID, "secrets", "x"), { a: 1 }));
  });
});

describe("membership changes", () => {
  it("lets an invited user add their own uid and nothing else", async () => {
    await seedHousehold();
    await seedInvite(BOB.email);
    await assertSucceeds(updateDoc(doc(bob(), "households", HID), {
      memberUids: [ALICE.uid, BOB.uid],
    }));
  });

  it("refuses to add a uid that is not your own, even with an invite", async () => {
    await seedHousehold();
    await seedInvite(BOB.email);
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
    await seedInvite(BOB.email, "some-other-house");
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
    await seedInvite(BOB.email);
    await assertSucceeds(getDoc(doc(bob(), "invites", BOB.email)));
    await assertFails(getDoc(doc(mallory(), "invites", BOB.email)));
  });

  it("lets a member list the invites for their own household", async () => {
    await seedHousehold();
    await seedInvite(BOB.email);
    const q = query(collection(alice(), "invites"), where("hid", "==", HID));
    await assertSucceeds(getDocs(q));
  });

  it("rejects an unconstrained invite query", async () => {
    // Invites are keyed by email, so an unconstrained list would hand every
    // signed-in user every invited email address in the system.
    await seedHousehold();
    await seedInvite(BOB.email);
    await assertFails(getDocs(collection(alice(), "invites")));
  });

  it("rejects listing another household's invites", async () => {
    await seedHousehold();
    await seedInvite(BOB.email);
    const q = query(collection(mallory(), "invites"), where("hid", "==", HID));
    await assertFails(getDocs(q));
  });

  it("lets a member revoke an invite their household issued", async () => {
    await seedHousehold();
    await seedInvite(BOB.email);
    await assertSucceeds(deleteDoc(doc(alice(), "invites", BOB.email)));
  });

  it("refuses a non-member revoking someone else's invite", async () => {
    await seedHousehold();
    await seedInvite(BOB.email);
    await assertFails(deleteDoc(doc(mallory(), "invites", BOB.email)));
  });

  it("lets the invitee delete their own invite once used", async () => {
    await seedHousehold();
    await seedInvite(BOB.email);
    await assertSucceeds(deleteDoc(doc(bob(), "invites", BOB.email)));
  });
});

describe("AI collections", () => {
  it("lets a member read and write detections in their own household", async () => {
    await seedHousehold();
    const db = alice();
    await assertSucceeds(setDoc(doc(db, "households", HID, "detections", "d1"), {
      deviceId: "ESP32-PETFEEDER-001", petId: "p1", confidence: 0.96,
      status: "RECOGNIZED", timestamp: 1_756_000_000_000,
    }));
    await assertSucceeds(getDoc(doc(db, "households", HID, "detections", "d1")));
  });

  it("lets a member write feedingEvents and trainingImages", async () => {
    await seedHousehold();
    const db = alice();
    await assertSucceeds(setDoc(doc(db, "households", HID, "feedingEvents", "e1"), {
      requestId: "FEED-1", decision: "REJECTED", reason: "UNKNOWN_PET",
      timestamp: 1_756_000_000_000,
    }));
    await assertSucceeds(setDoc(doc(db, "households", HID, "trainingImages", "i1"), {
      petId: "p1", storagePath: "training/house1/p1/i1.jpg", approved: true,
      uploadedAt: 1_756_000_000_000,
    }));
  });

  it("refuses a non-member reading another household's detections", async () => {
    await seedHousehold();
    await assertFails(getDoc(doc(bob(), "households", HID, "detections", "d1")));
  });

  it("refuses writes to a collection not on the allowed list", async () => {
    await seedHousehold();
    await assertFails(setDoc(doc(alice(), "households", HID, "somethingElse", "x"), { a: 1 }));
  });

  it("lets any signed-in user read the model registry", async () => {
    await seedHousehold();
    const db = bob();
    await assertSucceeds(getDoc(doc(db, "models", "v1.0")));
    await assertSucceeds(getDoc(doc(db, "system", "ai")));
  });

  it("refuses a client writing the model registry, however it is dressed up", async () => {
    await seedHousehold();
    const db = alice();
    await assertFails(setDoc(doc(db, "models", "v9.9"), { status: "ACTIVE", accuracy: 1 }));
    await assertFails(setDoc(doc(db, "system", "ai"), { activeModelVersion: "v9.9" }));
    await assertFails(setDoc(doc(db, "trainingSessions", "s1"), { status: "COMPLETE" }));
  });

  it("refuses a client updating or deleting a model that already exists", async () => {
    // `setDoc` on a document that does not exist only exercises `create`. The
    // dangerous edit is the other half: someone adding `allow update: if
    // isAdmin()` beside a retained `allow create: if false` would leave every
    // create-only test green while letting a client mark its own model ACTIVE
    // — which is precisely what the rule's comment says it prevents.
    await seedHousehold();
    await seedGlobalDocs();
    const db = alice();
    await assertFails(updateDoc(doc(db, "models", "v1.0"), { status: "ACTIVE" }));
    await assertFails(deleteDoc(doc(db, "models", "v1.0")));
    await assertFails(setDoc(doc(db, "models", "v1.0"), { status: "ACTIVE", accuracy: 1 }));
  });

  it("refuses a client updating or deleting the active-model pointer", async () => {
    await seedHousehold();
    await seedGlobalDocs();
    const db = alice();
    await assertFails(updateDoc(doc(db, "system", "ai"), { activeModelVersion: "v9.9" }));
    await assertFails(deleteDoc(doc(db, "system", "ai")));
  });

  it("refuses a client updating or deleting a training session", async () => {
    await seedHousehold();
    await seedGlobalDocs();
    const db = alice();
    await assertFails(updateDoc(doc(db, "trainingSessions", "s1"), { status: "COMPLETE" }));
    await assertFails(deleteDoc(doc(db, "trainingSessions", "s1")));
  });

  it("refuses an unauthenticated read of the model registry", async () => {
    await seedHousehold();
    await assertFails(getDoc(doc(anon(), "models", "v1.0")));
  });

  it("refuses an unauthenticated read of system and training sessions", async () => {
    // Same rule, same reasoning: these three share `allow read: if signedIn()`,
    // so all three need the anonymous denial asserted, not just one.
    await seedHousehold();
    await seedGlobalDocs();
    await assertFails(getDoc(doc(anon(), "system", "ai")));
    await assertFails(getDoc(doc(anon(), "trainingSessions", "s1")));
  });
});
