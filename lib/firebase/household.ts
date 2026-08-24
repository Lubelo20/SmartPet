import {
  arrayUnion, collection, doc, getDoc, getDocs, query, setDoc, where,
  writeBatch, type Firestore,
} from "firebase/firestore";
import { FeederError, toFeederError } from "@/lib/errors";
import { CONFIG } from "@/lib/config";

/**
 * Household membership is the security boundary, so every function here runs
 * against the same rules production uses. There is no privileged server: the
 * invite flow is enforced entirely by firestore.rules.
 */

export async function resolveHousehold(
  db: Firestore,
  uid: string,
  email: string | null,
): Promise<{ householdId: string | null; pendingInviteHid: string | null }> {
  try {
    // Constrained form the rules require — an unconstrained query is rejected.
    const q = query(collection(db, "households"), where("memberUids", "array-contains", uid));
    const snap = await getDocs(q);
    if (!snap.empty) {
      return { householdId: snap.docs[0].id, pendingInviteHid: null };
    }

    if (!email) return { householdId: null, pendingInviteHid: null };

    const invite = await getDoc(doc(db, "invites", email));
    return {
      householdId: null,
      pendingInviteHid: invite.exists() ? String(invite.data().hid) : null,
    };
  } catch (e) {
    throw toFeederError(e, "Could not work out which household you belong to.");
  }
}

export async function createHouseholdFor(
  db: Firestore,
  uid: string,
  displayName: string | null,
): Promise<string> {
  try {
    const hid = doc(collection(db, "households")).id;
    const owner = displayName?.trim();
    await setDoc(doc(db, "households", hid), {
      name: owner ? `${owner}'s home` : "My home",
      // Exactly the creator. The rules refuse a create with anyone pre-added.
      memberUids: [uid],
      deviceId: CONFIG.deviceId,
      createdAt: Date.now(),
    });
    return hid;
  } catch (e) {
    throw toFeederError(e, "Could not create your household.");
  }
}

export async function acceptInviteFor(
  db: Firestore,
  uid: string,
  email: string,
): Promise<string> {
  try {
    const inviteRef = doc(db, "invites", email);
    const invite = await getDoc(inviteRef);
    if (!invite.exists()) {
      throw new FeederError("not-found", "That invitation is no longer valid.");
    }
    const hid = String(invite.data().hid);

    // arrayUnion, not a hand-built array: the rules compare the result against
    // resource.data.memberUids.concat([uid]), which is exactly what arrayUnion
    // produces when the uid is absent.
    const batch = writeBatch(db);
    batch.update(doc(db, "households", hid), { memberUids: arrayUnion(uid) });
    batch.delete(inviteRef);
    await batch.commit();

    return hid;
  } catch (e) {
    throw toFeederError(e, "Could not join that household.");
  }
}
