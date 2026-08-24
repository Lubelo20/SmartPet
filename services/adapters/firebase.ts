import {
  addDoc, collection, deleteDoc, doc, getDoc, getDocs, orderBy, query,
  setDoc, updateDoc, where, writeBatch, type Firestore,
} from "firebase/firestore";
import { toFeederError } from "@/lib/errors";
import {
  alertFromDoc, alertToDoc, feedingFromDoc, feedingToDoc,
  petFromDoc, petToDoc, scheduleFromDoc, scheduleToDoc,
} from "@/lib/firebase/mapping";
import { buildSeedSettings } from "@/lib/seed-data";
import { DEFAULT_NOTIFICATIONS } from "@/lib/notifications";
import type {
  Alert, DeviceSettings, FeedingRecord, Invite, NewPet, NewSchedule,
  NotificationSettings, Pet, Settings,
} from "@/lib/types";
import type { FeederServices } from "@/services/contract";

/**
 * Takes its Firestore instance and household id as arguments rather than
 * reaching for globals — that is what lets the contract suite point it at the
 * emulator. Every method rethrows through toFeederError, so nothing above this
 * layer ever sees a raw FirebaseError.
 */
export function createFirebaseAdapter(db: Firestore, hid: string, uid: string): FeederServices {
  const col = (name: string) => collection(db, "households", hid, name);
  const ref = (name: string, id: string) => doc(db, "households", hid, name, id);

  async function guard<T>(fallback: string, fn: () => Promise<T>): Promise<T> {
    try { return await fn(); } catch (e) { throw toFeederError(e, fallback); }
  }

  return {
    pets: {
      list: () => guard("Could not load pets.", async () => {
        const snap = await getDocs(query(col("pets"), orderBy("name")));
        return snap.docs.map((d) => petFromDoc(d.id, d.data()));
      }),
      get: (id) => guard("Could not load that pet.", async () => {
        const snap = await getDoc(ref("pets", id));
        return snap.exists() ? petFromDoc(snap.id, snap.data()) : null;
      }),
      create: (pet: NewPet) => guard("Could not add the pet.", async () => {
        // Pets keep human-readable ids because the classifier references them.
        const existing = await getDocs(col("pets"));
        const id = pet.id ?? `PET${String(existing.size + 1).padStart(3, "0")}`;
        const next: Pet = { ...pet, id, enrolledAt: new Date().toISOString().slice(0, 10) };
        await setDoc(ref("pets", id), petToDoc(next));
        return next;
      }),
      update: (id, patch) => guard("Could not save the pet.", async () => {
        await updateDoc(ref("pets", id), patch);
        const snap = await getDoc(ref("pets", id));
        if (!snap.exists()) throw toFeederError({ code: "not-found" }, "That pet no longer exists.");
        return petFromDoc(snap.id, snap.data());
      }),
      remove: (id) => guard("Could not delete the pet.", async () => {
        await deleteDoc(ref("pets", id));
        return true;
      }),
    },
    feedings: {
      list: () => guard("Could not load feeding history.", async () => {
        const snap = await getDocs(query(col("feedingHistory"), orderBy("timestamp", "desc")));
        return snap.docs.map((d) => feedingFromDoc(d.id, d.data()));
      }),
      append: (row: FeedingRecord) => guard("Could not record the feeding.", async () => {
        await addDoc(col("feedingHistory"), feedingToDoc(row));
        return row;
      }),
    },
    schedules: {
      list: () => guard("Could not load schedules.", async () => {
        const snap = await getDocs(query(col("feedingSchedules"), orderBy("time")));
        return snap.docs.map((d) => scheduleFromDoc(d.id, d.data()));
      }),
      create: (row: NewSchedule) => guard("Could not add the schedule.", async () => {
        // Auto-id: the placeholder never reaches Firestore, scheduleToDoc strips id.
        const created = await addDoc(col("feedingSchedules"), scheduleToDoc({ ...row, id: "" }));
        return { ...row, id: created.id };
      }),
      update: (id, patch) => guard("Could not save the schedule.", async () => {
        await updateDoc(ref("feedingSchedules", id), patch);
        const snap = await getDoc(ref("feedingSchedules", id));
        if (!snap.exists()) throw toFeederError({ code: "not-found" }, "That schedule no longer exists.");
        return scheduleFromDoc(snap.id, snap.data());
      }),
      remove: (id) => guard("Could not delete the schedule.", async () => {
        await deleteDoc(ref("feedingSchedules", id));
        return true;
      }),
    },
    household: {
      name: () => guard("Could not load the household.", async () => {
        const snap = await getDoc(doc(db, "households", hid));
        return snap.exists() ? String(snap.data().name ?? "My home") : "My home";
      }),

      members: () => guard("Could not load the household members.", async () => {
        const snap = await getDoc(doc(db, "households", hid));
        const uids: string[] = snap.exists() ? (snap.data().memberUids ?? []) : [];
        // Identity lives on each member document, which only that user may
        // write. Anyone who has not signed in since this shipped has no record
        // yet, so they show as a bare uid rather than disappearing.
        const docs = await getDocs(col("members"));
        const byUid = new Map(docs.docs.map((d) => [d.id, d.data()]));
        return uids.map((u) => {
          const data = byUid.get(u);
          return {
            uid: u,
            email: data?.email ? String(data.email) : null,
            displayName: data?.displayName ? String(data.displayName) : null,
          };
        });
      }),

      invites: () => guard("Could not load pending invitations.", async () => {
        // Constrained by hid: the rules reject an unconstrained query rather
        // than filtering it, so this shape is required, not just tidy.
        const snap = await getDocs(query(collection(db, "invites"), where("hid", "==", hid)));
        return snap.docs.map((d) => ({
          email: d.id,
          hid: String(d.data().hid),
          invitedBy: String(d.data().invitedBy),
          createdAt: Number(d.data().createdAt ?? 0),
        }));
      }),

      invite: (email: string) => guard("Could not send that invitation.", async () => {
        const key = email.trim().toLowerCase();

        // Inviting the same address twice must not fail. `setDoc` over an
        // existing document is an update, and invites are `allow update: if
        // false` on purpose — otherwise a member of one household could
        // overwrite an invite another household issued and silently redirect
        // that person to theirs. So re-inviting is a no-op instead.
        //
        // A member cannot `get` an arbitrary invite (only the addressee can),
        // but can list their own household's, which is enough to tell.
        const existing = await getDocs(query(collection(db, "invites"), where("hid", "==", hid)));
        const already = existing.docs.find((d) => d.id === key);
        if (already) {
          return {
            email: key,
            hid: String(already.data().hid),
            invitedBy: String(already.data().invitedBy),
            createdAt: Number(already.data().createdAt ?? 0),
          };
        }

        const row: Invite = { email: key, hid, invitedBy: uid, createdAt: Date.now() };
        const { email: _key, ...stored } = row;
        await setDoc(doc(db, "invites", key), stored);
        return row;
      }),

      revokeInvite: (email: string) => guard("Could not revoke that invitation.", async () => {
        await deleteDoc(doc(db, "invites", email));
        return true;
      }),
    },

    /**
     * Two documents: device preferences on the household, notification
     * preferences on the member. Composed here so no component learns the
     * split. A missing document falls back to the shared defaults rather than
     * to an empty object, so a household that predates this feature reads the
     * same values the mock adapter would return.
     */
    settings: {
      get: () => guard("Could not load settings.", async () => {
        const defaults = buildSeedSettings();
        const [deviceSnap, memberSnap] = await Promise.all([
          getDoc(ref("settings", "device")),
          getDoc(ref("members", uid)),
        ]);
        const device = deviceSnap.exists()
          ? (deviceSnap.data() as DeviceSettings) : null;
        const notifications = memberSnap.exists()
          ? (memberSnap.data().notifications as NotificationSettings | undefined) : undefined;
        return {
          ...defaults,
          ...(device ?? {}),
          notifications: { ...DEFAULT_NOTIFICATIONS, ...(notifications ?? {}) },
        };
      }),
      save: (next: Settings) => guard("Could not save settings.", async () => {
        const { notifications, ...device } = next;
        await Promise.all([
          setDoc(ref("settings", "device"), device),
          // merge: the member document is this user's, but it is not only for
          // notifications — later stages may add fields beside them.
          setDoc(ref("members", uid), { notifications }, { merge: true }),
        ]);
        return next;
      }),
    },
    alerts: {
      list: () => guard("Could not load alerts.", async () => {
        const snap = await getDocs(query(col("alerts"), orderBy("timestamp", "desc")));
        return snap.docs.map((d) => alertFromDoc(d.id, d.data()));
      }),
      append: (row: Alert) => guard("Could not record the alert.", async () => {
        await addDoc(col("alerts"), alertToDoc(row));
        return row;
      }),
      markRead: (id) => guard("Could not update the alert.", async () => {
        await updateDoc(ref("alerts", id), { read: true });
        return true;
      }),
      markAllRead: () => guard("Could not update the alerts.", async () => {
        const snap = await getDocs(col("alerts"));
        const batch = writeBatch(db);
        snap.docs.forEach((d) => batch.update(d.ref, { read: true }));
        await batch.commit();
        return true;
      }),
    },
  };
}
