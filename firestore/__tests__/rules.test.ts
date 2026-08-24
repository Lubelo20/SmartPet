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

  it("lets the invitee delete their own invite once used", async () => {
    await seedHousehold();
    await seedInvite(BOB.email);
    await assertSucceeds(deleteDoc(doc(bob(), "invites", BOB.email)));
  });
});
