import {
  addDoc, collection, deleteDoc, doc, getDoc, getDocs, orderBy, query,
  setDoc, updateDoc, writeBatch, type Firestore,
} from "firebase/firestore";
import { toFeederError } from "@/lib/errors";
import {
  alertFromDoc, alertToDoc, feedingFromDoc, feedingToDoc,
  petFromDoc, petToDoc, scheduleFromDoc, scheduleToDoc,
} from "@/lib/firebase/mapping";
import type { Alert, FeedingRecord, NewPet, NewSchedule, Pet } from "@/lib/types";
import type { FeederServices } from "@/services/contract";

/**
 * Takes its Firestore instance and household id as arguments rather than
 * reaching for globals — that is what lets the contract suite point it at the
 * emulator. Every method rethrows through toFeederError, so nothing above this
 * layer ever sees a raw FirebaseError.
 */
export function createFirebaseAdapter(db: Firestore, hid: string): FeederServices {
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
