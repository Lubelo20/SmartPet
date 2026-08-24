"use client";

import {
  createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode,
} from "react";
import {
  createUserWithEmailAndPassword, GoogleAuthProvider, onAuthStateChanged,
  signInWithEmailAndPassword, signInWithPopup, signOut,
} from "firebase/auth";
import { CONFIG } from "@/lib/config";
import { toFeederError } from "@/lib/errors";
import { getFirebase } from "@/lib/firebase/client";
import { acceptInviteFor, createHouseholdFor, resolveHousehold } from "@/lib/firebase/household";
import { MOCK_SESSION, type AuthUser, type AuthValue } from "@/lib/firebase/session";
import type { SessionStatus } from "@/lib/types";

export { MOCK_SESSION };
export type { AuthUser, AuthValue };

const AuthCtx = createContext<AuthValue | null>(null);

export function useAuth(): AuthValue {
  const ctx = useContext(AuthCtx);
  if (!ctx) throw new Error("useAuth must be used within an AuthProvider");
  return ctx;
}

const noop = async () => {};

export function AuthProvider({ children }: { children: ReactNode }) {
  const isMock = CONFIG.dataSource === "mock";

  // `resolving` is a real state, not a detail: Firebase restores sessions
  // asynchronously, and without it every load flashes the sign-in page.
  const [status, setStatus] = useState<SessionStatus>(isMock ? "ready" : "resolving");
  const [user, setUser] = useState<AuthUser | null>(isMock ? MOCK_SESSION.user : null);
  const [householdId, setHouseholdId] = useState<string | null>(
    isMock ? MOCK_SESSION.householdId : null,
  );
  const [pendingInviteHid, setPendingInviteHid] = useState<string | null>(null);

  useEffect(() => {
    if (isMock) return;
    const { auth, db } = getFirebase();

    return onAuthStateChanged(auth, async (fbUser) => {
      if (!fbUser) {
        setUser(null);
        setHouseholdId(null);
        setPendingInviteHid(null);
        setStatus("signed-out");
        return;
      }

      const next: AuthUser = {
        uid: fbUser.uid, email: fbUser.email, displayName: fbUser.displayName,
      };
      setUser(next);
      setStatus("resolving");

      try {
        const { householdId: hid, pendingInviteHid: invite } =
          await resolveHousehold(db, next.uid, next.email);
        setHouseholdId(hid);
        setPendingInviteHid(invite);
        setStatus(hid ? "ready" : "no-household");
      } catch {
        setHouseholdId(null);
        setPendingInviteHid(null);
        setStatus("no-household");
      }
    });
  }, [isMock]);

  const reresolve = useCallback(async () => {
    if (isMock || !user) return;
    const { db } = getFirebase();
    const { householdId: hid, pendingInviteHid: invite } =
      await resolveHousehold(db, user.uid, user.email);
    setHouseholdId(hid);
    setPendingInviteHid(invite);
    setStatus(hid ? "ready" : "no-household");
  }, [isMock, user]);

  const value = useMemo<AuthValue>(() => {
    if (isMock) {
      return {
        ...MOCK_SESSION,
        signInWithPassword: noop,
        registerWithPassword: noop,
        signInWithGoogle: noop,
        signOutNow: noop,
        acceptInvite: noop,
        createHousehold: noop,
      };
    }

    return {
      status, user, householdId, pendingInviteHid,

      signInWithPassword: async (email, password) => {
        const { auth } = getFirebase();
        try { await signInWithEmailAndPassword(auth, email, password); }
        catch (e) { throw toFeederError(e, "Could not sign you in. Check your email and password."); }
      },

      registerWithPassword: async (email, password) => {
        const { auth } = getFirebase();
        try { await createUserWithEmailAndPassword(auth, email, password); }
        catch (e) { throw toFeederError(e, "Could not create that account."); }
      },

      signInWithGoogle: async () => {
        const { auth } = getFirebase();
        try { await signInWithPopup(auth, new GoogleAuthProvider()); }
        catch (e) { throw toFeederError(e, "Google sign-in did not complete."); }
      },

      signOutNow: async () => {
        const { auth } = getFirebase();
        try { await signOut(auth); }
        catch (e) { throw toFeederError(e, "Could not sign you out."); }
      },

      acceptInvite: async () => {
        if (!user?.email) throw toFeederError(null, "You need an email address to accept an invitation.");
        const { db } = getFirebase();
        await acceptInviteFor(db, user.uid, user.email);
        await reresolve();
      },

      createHousehold: async () => {
        if (!user) throw toFeederError(null, "You need to be signed in to create a household.");
        const { db } = getFirebase();
        await createHouseholdFor(db, user.uid, user.displayName);
        await reresolve();
      },
    };
  }, [isMock, status, user, householdId, pendingInviteHid, reresolve]);

  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>;
}
