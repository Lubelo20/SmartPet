import { readFileSync } from "node:fs";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { initializeTestEnvironment, type RulesTestEnvironment } from "@firebase/rules-unit-testing";
import { doc, getDoc, setDoc, type Firestore } from "firebase/firestore";
import { acceptInviteFor, createHouseholdFor, resolveHousehold } from "@/lib/firebase/household";

let testEnv: RulesTestEnvironment;
const ALICE = { uid: "alice", email: "alice@example.com" };
const BOB = { uid: "bob", email: "bob@example.com" };

const dbFor = (uid: string, email: string) =>
  testEnv.authenticatedContext(uid, { email }).firestore() as unknown as Firestore;

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: "demo-feeder",
    firestore: { rules: readFileSync("firestore.rules", "utf8") },
  });
});
afterAll(async () => { await testEnv.cleanup(); });
afterEach(async () => { await testEnv.clearFirestore(); });

describe("createHouseholdFor", () => {
  it("creates a household naming the creator as sole member", async () => {
    const db = dbFor(ALICE.uid, ALICE.email);
    const hid = await createHouseholdFor(db, ALICE.uid, "Alice");
    const snap = await getDoc(doc(db, "households", hid));
    expect(snap.exists()).toBe(true);
    expect(snap.data()?.memberUids).toEqual([ALICE.uid]);
    expect(snap.data()?.name).toContain("Alice");
  });
});

describe("resolveHousehold", () => {
  it("finds a household the user belongs to", async () => {
    const db = dbFor(ALICE.uid, ALICE.email);
    const hid = await createHouseholdFor(db, ALICE.uid, "Alice");
    const res = await resolveHousehold(db, ALICE.uid, ALICE.email);
    expect(res.householdId).toBe(hid);
    expect(res.pendingInviteHid).toBeNull();
  });

  it("returns nulls for a user with neither household nor invite", async () => {
    const db = dbFor(BOB.uid, BOB.email);
    const res = await resolveHousehold(db, BOB.uid, BOB.email);
    expect(res.householdId).toBeNull();
    expect(res.pendingInviteHid).toBeNull();
  });

  it("surfaces a pending invite when one names this email", async () => {
    const aliceDb = dbFor(ALICE.uid, ALICE.email);
    const hid = await createHouseholdFor(aliceDb, ALICE.uid, "Alice");
    await setDoc(doc(aliceDb, "invites", BOB.email), {
      hid, invitedBy: ALICE.uid, createdAt: 0,
    });
    const res = await resolveHousehold(dbFor(BOB.uid, BOB.email), BOB.uid, BOB.email);
    expect(res.householdId).toBeNull();
    expect(res.pendingInviteHid).toBe(hid);
  });
});

describe("acceptInviteFor", () => {
  it("adds the invitee and deletes the invite", async () => {
    const aliceDb = dbFor(ALICE.uid, ALICE.email);
    const hid = await createHouseholdFor(aliceDb, ALICE.uid, "Alice");
    await setDoc(doc(aliceDb, "invites", BOB.email), {
      hid, invitedBy: ALICE.uid, createdAt: 0,
    });

    const bobDb = dbFor(BOB.uid, BOB.email);
    const joined = await acceptInviteFor(bobDb, BOB.uid, BOB.email);
    expect(joined).toBe(hid);

    const snap = await getDoc(doc(bobDb, "households", hid));
    expect(snap.data()?.memberUids.sort()).toEqual([ALICE.uid, BOB.uid].sort());
    expect((await getDoc(doc(bobDb, "invites", BOB.email))).exists()).toBe(false);
  });

  it("rejects when no invite exists", async () => {
    const db = dbFor(BOB.uid, BOB.email);
    await expect(acceptInviteFor(db, BOB.uid, BOB.email)).rejects.toMatchObject({ kind: "not-found" });
  });
});
