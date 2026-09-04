import { readFileSync } from "node:fs";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { initializeTestEnvironment, type RulesTestEnvironment } from "@firebase/rules-unit-testing";
import { doc, getDoc, setDoc, type Firestore } from "firebase/firestore";
import { acceptInviteFor, createHouseholdFor, resolveHousehold, resolveSession } from "@/lib/firebase/household";

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

/**
 * Two code paths reached a resolved household — onAuthStateChanged and the
 * provider's reresolve() after createHousehold/acceptInvite — and only the
 * first wrote members/{uid}. A household created live had an empty members
 * collection, so the Household page listed a bare uid. resolveSession is the
 * single path both now use.
 */
describe("resolveSession", () => {
  it("writes the member record for a household the user already belongs to", async () => {
    const db = dbFor(ALICE.uid, ALICE.email);
    const hid = await createHouseholdFor(db, ALICE.uid, "Alice");

    const res = await resolveSession(db, ALICE.uid, ALICE.email, "Alice");

    expect(res.householdId).toBe(hid);
    const member = await getDoc(doc(db, "households", hid, "members", ALICE.uid));
    expect(member.exists()).toBe(true);
    expect(member.data()?.email).toBe(ALICE.email);
    expect(member.data()?.displayName).toBe("Alice");
  });

  it("writes the member record for someone who has just accepted an invite", async () => {
    const alice = dbFor(ALICE.uid, ALICE.email);
    const hid = await createHouseholdFor(alice, ALICE.uid, "Alice");
    await setDoc(doc(alice, "invites", BOB.email), {
      hid, invitedBy: ALICE.uid, createdAt: Date.now(),
    });

    const bob = dbFor(BOB.uid, BOB.email);
    await acceptInviteFor(bob, BOB.uid, BOB.email);
    const res = await resolveSession(bob, BOB.uid, BOB.email, null);

    expect(res.householdId).toBe(hid);
    const member = await getDoc(doc(bob, "households", hid, "members", BOB.uid));
    expect(member.exists()).toBe(true);
    expect(member.data()?.email).toBe(BOB.email);
  });

  it("writes nothing when the user has no household", async () => {
    const db = dbFor(BOB.uid, BOB.email);
    const res = await resolveSession(db, BOB.uid, BOB.email, null);
    expect(res.householdId).toBeNull();
    expect(res.pendingInviteHid).toBeNull();
  });
});
